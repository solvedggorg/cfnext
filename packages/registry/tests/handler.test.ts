import { expect, test } from "bun:test"

import { CATALOG } from "../src/catalog"
import { handleRegistry } from "../src/handler"
import type { RateLimit } from "../src/rate-limit"

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

function env(max = 100) {
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

  const packument = await request("/cfnext")
  expect(packument.status).toBe(200)
  expect(packument.headers.get("content-type")).toContain("application/json")
  const body = (await packument.json()) as { name: string; versions: Record<string, unknown> }
  expect(body.name).toBe("cfnext")
  expect(Object.keys(body.versions)).toHaveLength(5)

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
  expect(await tags.json()).toEqual({
    latest: CATALOG.distTags.latest,
    beta: CATALOG.distTags.beta,
    nightly: CATALOG.distTags.nightly,
  })
})

test("rejects unknown packages, missing versions, and publishes", async () => {
  expect((await handleRegistry(new Request("https://registry1.solved.gg/lodash"), env())).status).toBe(
    404,
  )
  expect(
    (await handleRegistry(new Request("https://registry1.solved.gg/cfnext/9.9.9"), env())).status,
  ).toBe(404)
  expect(
    (
      await handleRegistry(
        new Request("https://registry1.solved.gg/cfnext", { method: "PUT" }),
        env(),
      )
    ).status,
  ).toBe(405)
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
