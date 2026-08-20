import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { parseJsonc } from "../src/jsonc"
import type { CfnextJson } from "../src/schema"
import { p0Fixture } from "./fixtures/cfnext-json"
import { generate } from "../src/generate"

const cli = join(import.meta.dir, "../src/cli/index.ts")
const dirs: string[] = []

async function tmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-add-"))
  dirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function runCli(dir: string, argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", cli, ...argv], { cwd: dir, stdout: "pipe", stderr: "pipe" })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  return { code, stdout, stderr }
}

test("cfnext add r2 writes cfnext.json and regenerates wrangler", async () => {
  const dir = await tmpDir()
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "workers" }, null, 2))
  await generate(dir)
  const result = await runCli(dir, ["add", "r2"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.bindings?.r2?.[0]?.binding).toBe("BUCKET")
  const wrangler = await readFile(join(dir, "wrangler.jsonc"), "utf8")
  expect(wrangler).toContain("@generated")
  expect(wrangler).toContain("demo-bucket")
})

test("cfnext add ai-search writes instance binding", async () => {
  const dir = await tmpDir()
  await writeFile(join(dir, "cfnext.json"), JSON.stringify(p0Fixture, null, 2))
  await generate(dir)
  const result = await runCli(dir, ["add", "ai-search", "--name", "docs"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.ai?.search?.[0]).toEqual({ binding: "AI_SEARCH", instanceName: "docs" })
})

test("cfnext add database alias writes d1", async () => {
  const dir = await tmpDir()
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "workers" }, null, 2))
  await generate(dir)
  const result = await runCli(dir, ["add", "database"])
  expect(result.code, result.stderr).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.bindings?.d1?.[0]?.binding).toBe("DB")
})

test("cfnext add --environment staging writes overlay", async () => {
  const dir = await tmpDir()
  await writeFile(
    join(dir, "cfnext.json"),
    JSON.stringify(
      {
        name: "demo",
        target: "ssr",
        bindings: { d1: [{ binding: "DB", databaseName: "demo-db", id: "11111111-1111-1111-1111-111111111111" }] },
      },
      null,
      2,
    ),
  )
  await generate(dir)
  const result = await runCli(dir, ["add", "d1", "--environment", "staging", "--id", "22222222-2222-2222-2222-222222222222"])
  expect(result.code, result.stderr).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.env?.staging?.bindings?.d1?.[0]?.id).toBe("22222222-2222-2222-2222-222222222222")
  expect(json.bindings?.d1?.[0]?.id).toBe("11111111-1111-1111-1111-111111111111")
})

test("cfnext add r2 --name updates an existing binding", async () => {
  const dir = await tmpDir()
  await writeFile(
    join(dir, "cfnext.json"),
    JSON.stringify(
      { name: "demo", target: "workers", bindings: { r2: [{ binding: "BUCKET", bucketName: "old-bucket" }] } },
      null,
      2,
    ),
  )
  await generate(dir)
  const result = await runCli(dir, ["add", "r2", "--name", "new-bucket"])
  expect(result.code, result.stderr).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.bindings?.r2).toHaveLength(1)
  expect(json.bindings?.r2?.[0]?.bucketName).toBe("new-bucket")
})
