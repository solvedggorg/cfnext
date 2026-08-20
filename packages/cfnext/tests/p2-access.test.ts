import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { parseJsonc } from "../src/jsonc"
import type { CfnextJson } from "../src/schema"
import { generate } from "../src/generate"
import { splitGenerated } from "../src/generate/hash"
import { provisionAccess, type AccessHttp } from "../src/access-provision"

const cli = join(import.meta.dir, "../src/cli/index.ts")
const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function tmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p2-access-"))
  dirs.push(dir)
  return dir
}

function spawnEnv(overrides: Record<string, string | undefined> = {}): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value
  }
  delete env.CLOUDFLARE_API_TOKEN
  delete env.CLOUDFLARE_ACCOUNT_ID
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
  return env
}

async function runCli(
  dir: string,
  argv: string[],
  env?: Record<string, string | undefined>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", cli, ...argv], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
    env: spawnEnv(env),
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  return { code: await proc.exited, stdout, stderr }
}

async function seed(dir: string): Promise<void> {
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "ssr" }, null, 2))
  await writeFile(
    join(dir, "worker.ts"),
    `import { createSsrWorker } from "cfnext/worker/ssr"
export default createSsrWorker({ handlers: [], loaders: {} })
`,
  )
  await generate(dir)
}

test("cfnext add access writes protectPreview, access.dev, and plan file", async () => {
  const dir = await tmpDir()
  await seed(dir)
  const result = await runCli(dir, ["add", "access"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
  expect(`${result.stdout}\n${result.stderr}`).toMatch(/account-wide|preview policy/i)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.access).toMatchObject({
    protectPreview: true,
    protectProduction: false,
    previewPolicyName: "Cloudflare Workers Preview URLs",
    productionPolicyName: null,
  })
  expect(json.access?.dev?.aud).toBe("demo")

  const wrangler = parseJsonc<{
    access?: { dev?: { aud: string; identity?: { email?: string } } }
    env?: Record<string, { access?: unknown }>
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.access?.dev?.aud).toBe("demo")
  expect(wrangler.access?.dev?.identity?.email).toBe("dev@example.com")

  const planPath = join(dir, ".cloudflare/generated/access.plan.json")
  expect(existsSync(planPath)).toBe(true)
  const plan = JSON.parse(await readFile(planPath, "utf8")) as {
    kind: string
    api: { method: string; path: string; body: Record<string, unknown> }
    dashboard: string
    warnings: string[]
  }
  expect(plan.kind).toBe("access")
  expect(plan.api.method).toBe("PUT")
  expect(plan.api.path).toContain("/workers/scripts/demo/access")
  expect(plan.api.body).toEqual({
    preview_urls: { enabled: true },
    production_workers_dev: { enabled: false },
  })
  expect(JSON.stringify(plan)).not.toMatch(/Bearer |eyJ|"token":\s*"[^"]+"/)
  expect(plan.dashboard).toMatch(/workers/i)
})

test("cfnext add access --provision without auth writes plan and exits 2", async () => {
  const dir = await tmpDir()
  await seed(dir)
  const result = await runCli(dir, ["add", "access", "--provision"], {
    CLOUDFLARE_API_TOKEN: undefined,
    CLOUDFLARE_ACCOUNT_ID: undefined,
  })
  expect(result.code).toBe(2)
  expect(`${result.stdout}\n${result.stderr}`).toMatch(/dashboard/i)
  expect(existsSync(join(dir, ".cloudflare/generated/access.plan.json"))).toBe(true)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.access?.protectPreview).toBe(true)
})

test("provisionAccess PUTs Workers Access API and writes back aud", async () => {
  const calls: Array<{ url: string; method: string; body: unknown }> = []
  const http: AccessHttp = {
    apiBase: "https://api.cloudflare.com/client/v4",
    fetch: async (input, init) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url, method, body })
      if (method === "PUT" && url.endsWith("/workers/scripts/demo/access")) {
        return Response.json({
          success: true,
          result: { aud: "aud-from-api", preview_urls: { enabled: true } },
        })
      }
      if (method === "GET" && url.includes("/access/apps")) {
        return Response.json({
          success: true,
          result: [{ id: "app-1", name: "Cloudflare Workers Preview URLs", aud: "aud-from-api" }],
        })
      }
      if (method === "PUT" && url.includes("/access/apps/app-1")) {
        return Response.json({ success: true, result: { id: "app-1" } })
      }
      return Response.json({ success: false, errors: [{ message: `unexpected ${method} ${url}` }] }, { status: 500 })
    },
  }

  const json: CfnextJson = {
    name: "demo",
    access: {
      protectPreview: true,
      protectProduction: false,
      allowedEmails: ["eng@acme.com"],
      allowedDomains: ["acme.com"],
      dev: { aud: "demo", identity: { email: "dev@acme.com" } },
    },
  }
  const result = await provisionAccess(json, { token: "tok", accountId: "acct" }, http)
  expect(calls[0]?.method).toBe("PUT")
  expect(calls[0]?.url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/workers/scripts/demo/access")
  expect(calls[0]?.body).toEqual({
    preview_urls: { enabled: true },
    production_workers_dev: { enabled: false },
  })
  expect(result.json.access?.aud).toBe("aud-from-api")
  expect(result.json.access?.previewPolicyName).toBe("Cloudflare Workers Preview URLs")
  expect(result.json.access?.productionPolicyName).toBeNull()
  expect(result.warnings.some((w) => /account-wide/i.test(w))).toBe(true)
  expect(JSON.stringify(result.plan)).not.toContain("tok")
})

test("named env blocks omit access.dev", async () => {
  const dir = await tmpDir()
  await writeFile(
    join(dir, "cfnext.json"),
    JSON.stringify(
      {
        name: "demo",
        target: "ssr",
        access: {
          protectPreview: true,
          protectProduction: false,
          dev: { aud: "demo", identity: { email: "dev@example.com" } },
        },
        env: { staging: { vars: { APP_ENV: "staging" } } },
      },
      null,
      2,
    ),
  )
  await generate(dir)
  const wrangler = parseJsonc<{
    access?: { dev?: { aud: string } }
    env?: { staging?: { access?: unknown; vars?: Record<string, string> } }
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.access?.dev?.aud).toBe("demo")
  expect(wrangler.env?.staging?.access).toBeUndefined()
  expect(wrangler.env?.staging?.vars?.APP_ENV).toBe("staging")
})
