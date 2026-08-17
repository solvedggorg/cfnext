import { expect, test } from "bun:test"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { parseJsonc } from "../src/jsonc"
import type { CfnextJson } from "../src/schema"
import { p0Fixture } from "./fixtures/cfnext-json"
import { generate } from "../src/generate"

const cli = join(import.meta.dir, "../src/cli/index.ts")

async function tmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "cfnext-add-"))
}

test("cfnext add r2 writes cfnext.json and regenerates wrangler", async () => {
  const dir = await tmpDir()
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "workers" }, null, 2))
  await generate(dir)
  const proc = Bun.spawn(["bun", cli, "add", "r2"], { cwd: dir, stdout: "pipe", stderr: "pipe" })
  expect(await proc.exited).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.bindings?.r2?.[0]?.binding).toBe("BUCKET")
  const wrangler = await readFile(join(dir, "wrangler.jsonc"), "utf8")
  expect(wrangler).toContain("@generated")
  expect(wrangler).toContain("demo-bucket")
})

test("cfnext add email exits 1 in P0", async () => {
  const dir = await tmpDir()
  await writeFile(join(dir, "cfnext.json"), JSON.stringify(p0Fixture, null, 2))
  const proc = Bun.spawn(["bun", cli, "add", "email"], { cwd: dir, stdout: "pipe", stderr: "pipe" })
  expect(await proc.exited).toBe(1)
  const err = await new Response(proc.stderr).text()
  expect(err).toMatch(/not implemented/i)
})
