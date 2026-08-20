import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
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

async function runCli(dir: string, argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", cli, ...argv], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, CFNEXT_SKIP_SECRET_BULK: "1" },
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  return { code: await proc.exited, stdout, stderr }
}

test("cfnext env unions .env.local keys into secrets.required and regenerates", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p1-env-"))
  dirs.push(dir)
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "ssr" }, null, 2))
  await writeFile(join(dir, "worker.ts"), "export default { fetch() { return new Response('ok') } }\n")
  await generate(dir)
  await writeFile(join(dir, ".env.local"), "STRIPE_SECRET_KEY=sk_test\nNEXT_PUBLIC_APP=1\n")

  const result = await runCli(dir, ["env"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.secrets?.required).toEqual(["STRIPE_SECRET_KEY"])
  const wrangler = parseJsonc<{ secrets?: { required?: string[] } }>(
    splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body,
  )
  expect(wrangler.secrets?.required).toEqual(["STRIPE_SECRET_KEY"])
})

test("cfnext env --environment staging writes the named-env overlay", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p1-env-staging-"))
  dirs.push(dir)
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "ssr" }, null, 2))
  await writeFile(join(dir, "worker.ts"), "export default { fetch() { return new Response('ok') } }\n")
  await generate(dir)
  await writeFile(join(dir, ".env.local"), "STAGING_SECRET=1\n")
  const result = await runCli(dir, ["env", "--environment", "staging"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.secrets?.required).toBeUndefined()
  expect(json.env?.staging?.secrets?.required).toEqual(["STAGING_SECRET"])
})

test("cfnext env --environment preview writes top-level secrets.required", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p1-env-preview-"))
  dirs.push(dir)
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "ssr" }, null, 2))
  await writeFile(join(dir, "worker.ts"), "export default { fetch() { return new Response('ok') } }\n")
  await generate(dir)
  await writeFile(join(dir, ".env.local"), "PREVIEW_SECRET=1\n")
  const result = await runCli(dir, ["env", "--environment", "preview"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.secrets?.required).toEqual(["PREVIEW_SECRET"])
  expect(json.env?.preview).toBeUndefined()
})
