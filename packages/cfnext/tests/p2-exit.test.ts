import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { parseJsonc } from "../src/jsonc"
import type { CfnextJson } from "../src/schema"
import { generate } from "../src/generate"
import { splitGenerated } from "../src/generate/hash"

const cli = join(import.meta.dir, "../src/cli/index.ts")
const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

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

test("P2 exit criterion: add access, add access --provision without token, add flagship", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p2-exit-"))
  dirs.push(dir)
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "ssr" }, null, 2))
  await writeFile(
    join(dir, "worker.ts"),
    `import { createSsrWorker } from "cfnext/worker/ssr"
export default createSsrWorker({ handlers: [], loaders: {} })
`,
  )
  await generate(dir)

  const added = await runCli(dir, ["add", "access"])
  expect(added.code, `${added.stdout}\n${added.stderr}`).toBe(0)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.access?.protectPreview).toBe(true)
  expect(json.access?.protectProduction).toBe(false)
  expect(json.access?.dev?.aud).toBeTruthy()

  const wrangler = parseJsonc<{
    access?: { dev?: { aud: string; identity?: Record<string, unknown> } }
    observability?: { enabled?: boolean; traces?: { enabled?: boolean } }
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.access?.dev?.aud).toBeTruthy()
  expect(existsSync(join(dir, ".cloudflare/generated/access.plan.json"))).toBe(true)

  const provision = await runCli(dir, ["add", "access", "--provision"], {
    CLOUDFLARE_API_TOKEN: undefined,
    CLOUDFLARE_ACCOUNT_ID: undefined,
  })
  expect(provision.code, `${provision.stdout}\n${provision.stderr}`).toBe(2)
  expect(`${provision.stdout}\n${provision.stderr}`).toMatch(/dashboard|plan/i)

  const flags = await runCli(dir, ["add", "flagship", "--app-id", "orion-flags"])
  expect(flags.code, `${flags.stdout}\n${flags.stderr}`).toBe(0)
  const afterFlags = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  const flagship = Array.isArray(afterFlags.flagship) ? afterFlags.flagship[0] : afterFlags.flagship
  expect(flagship?.binding).toBe("FLAGS")
  expect(flagship?.appId).toBe("orion-flags")

  const types = await runCli(dir, ["types"])
  expect(types.code, `${types.stdout}\n${types.stderr}`).toBe(0)
  const env = await readFile(join(dir, "cloudflare-env.d.ts"), "utf8")
  expect(env).toContain("interface CloudflareEnv")
  expect(env).toMatch(/FLAGS/)
}, 120_000)
