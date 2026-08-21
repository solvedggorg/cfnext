import { expect, test } from "bun:test"

import { CATALOG } from "../src/catalog"
import { handleRegistry } from "../src/handler"
import type { RateLimit, Limiters } from "../src/rate-limit"

function limiter(max: number): RateLimit {
  const hits = new Map<string, number>()
  return {
    async limit({ key }) {
      const next = (hits.get(key) ?? 0) + 1
      hits.set(key, next)
      return { success: next <= max }
    },
  }
}

function env(max = 100): Limiters {
  return {
    META_LIMIT: limiter(max),
    TARBALL_LIMIT: limiter(max),
    GLOBAL_LIMIT: limiter(max),
  }
}

test("serves packument, version, tarball, ping, and dist-tags", async () => {
  const request = (path: string, headers?: HeadersInit) =>
    handleRegistry(new Request(`https://registry1.solved.gg${path}`, { headers }), env())

  const ping = await request("/-/ping")
  expect(ping.status).toBe(200)
  expect(await ping.json()).toEqual({})

  const packument = await request("/cfnext", {
    accept: "application/vnd.npm.install-v1+json",
  })
  expect(packument.status).toBe(200)
  expect(packument.headers.get("content-type")).toContain("application/vnd.npm.install-v1+json")
  const body = (await packument.json()) as { name: string; versions: Record<string, unknown> }
  expect(body.name).toBe("cfnext")
  expect(Object.keys(body.versions)).toEqual([CATALOG.distTags.latest])

  const version = CATALOG.distTags.latest
  const manifest = await request(`/cfnext/${version}`)
  expect(manifest.status).toBe(200)

  const tarball = await request(`/cfnext/-/cfnext-${version}.tgz`)
  expect(tarball.status).toBe(200)
  expect(tarball.headers.get("content-type")).toBe("application/octet-stream")
  const bytes = new Uint8Array(await tarball.arrayBuffer())
  expect(bytes[0]).toBe(0x1f)
  expect(bytes[1]).toBe(0x8b)

  const tags = await request("/-/package/cfnext/dist-tags")
  expect(await tags.json()).toEqual({ latest: CATALOG.distTags.latest })
})

test("proxies non-cfnext packages to npm without spending rate limit", async () => {
  const calls: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: Request | string | URL) => {
    calls.push(String(input))
    return new Response(JSON.stringify({ name: "lodash" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as typeof fetch
  try {
    // Exhausted budgets must not affect passthrough traffic.
    const tight = env(0)
    const proxied = await handleRegistry(new Request("https://registry1.solved.gg/lodash"), tight)
    expect(proxied.status).toBe(200)
    expect(await proxied.json()).toEqual({ name: "lodash" })
    expect(calls[0]).toBe("https://registry.npmjs.org/lodash")

    const scoped = await handleRegistry(
      new Request("https://registry1.solved.gg/@cloudflare%2fworkers-types"),
      tight,
    )
    expect(scoped.status).toBe(200)
    expect(calls[1]).toBe("https://registry.npmjs.org/@cloudflare%2fworkers-types")
  } finally {
    globalThis.fetch = original
  }
})

test("proxy failures surface as 502 while cfnext stays local", async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new Error("down")
  }) as unknown as typeof fetch
  try {
    const response = await handleRegistry(new Request("https://registry1.solved.gg/react"), env())
    expect(response.status).toBe(502)
  } finally {
    globalThis.fetch = original
  }
  expect((await handleRegistry(new Request("https://registry1.solved.gg/cfnext/9.9.9"), env())).status).toBe(404)
  expect(
    (
      await handleRegistry(
        new Request("https://registry1.solved.gg/cfnext", { method: "PUT" }),
        env(),
      )
    ).status,
  ).toBe(405)
})

test("dist.tarball follows the inbound Host header", async () => {
  const response = await handleRegistry(
    new Request("https://registry1.solved.gg/cfnext", {
      headers: { host: "127.0.0.1:8799" },
    }),
    env(),
  )
  const body = (await response.json()) as {
    versions: Record<string, { dist: { tarball: string } }>
  }
  expect(body.versions[CATALOG.distTags.latest]?.dist.tarball).toBe(
    `http://127.0.0.1:8799/cfnext/-/cfnext-${CATALOG.distTags.latest}.tgz`,
  )
})

test("returns 429 after the heavy per-IP budget is exhausted", async () => {
  const tight = env(2)
  const url = "https://registry1.solved.gg/cfnext"
  expect((await handleRegistry(new Request(url), tight)).status).toBe(200)
  expect((await handleRegistry(new Request(url), tight)).status).toBe(200)
  const blocked = await handleRegistry(new Request(url), tight)
  expect(blocked.status).toBe(429)
  expect(blocked.headers.get("retry-after")).toBe("60")
})
