import { expect, test } from "bun:test"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { parseJsonc } from "../src/jsonc"
import type { CfnextJson } from "../src/schema"
import { wranglerToCfnextJson } from "../src/generate/migrate"
import { generate } from "../src/generate"
import { splitGenerated } from "../src/generate/hash"

const cli = join(import.meta.dir, "../src/cli/index.ts")

test("wranglerToCfnextJson maps P0 bindings", () => {
  const json = wranglerToCfnextJson(
    {
      name: "demo",
      main: "worker.ts",
      compatibility_date: "2026-08-16",
      compatibility_flags: ["nodejs_compat"],
      d1_databases: [{ binding: "DB", database_name: "demo-db", database_id: "11111111-1111-1111-1111-111111111111" }],
    },
    "demo",
  )
  expect(json.target).toBe("ssr")
  expect(json.bindings?.d1?.[0]?.id).toBe("11111111-1111-1111-1111-111111111111")
})

test("cfnext migrate wrangler writes json and regenerates wrangler", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-mig-"))
  await writeFile(
    join(dir, "wrangler.jsonc"),
    JSON.stringify(
      {
        name: "legacy",
        main: "worker.ts",
        compatibility_date: "2026-08-16",
        d1_databases: [{ binding: "DB", database_name: "legacy-db" }],
      },
      null,
      2,
    ),
  )
  const proc = Bun.spawn(["bun", cli, "migrate", "wrangler"], { cwd: dir, stdout: "pipe", stderr: "pipe" })
  const code = await proc.exited
  expect(code).toBe(0)
  expect(existsSync(join(dir, "cfnext.json"))).toBe(true)
  expect(existsSync(join(dir, "wrangler.jsonc.bak"))).toBe(true)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.bindings?.d1?.[0]?.binding).toBe("DB")
  const wrangler = await readFile(join(dir, "wrangler.jsonc"), "utf8")
  expect(wrangler).toContain("@generated")
  const body = parseJsonc<{ d1_databases?: Array<{ binding: string }> }>(splitGenerated(wrangler).body)
  expect(body.d1_databases?.[0]?.binding).toBe("DB")
})

test("generate --check is green after generate", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-check-"))
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "workers" }, null, 2))
  await generate(dir)
  const proc = Bun.spawn(["bun", cli, "generate", "--check"], { cwd: dir, stdout: "pipe", stderr: "pipe" })
  expect(await proc.exited).toBe(0)
})
