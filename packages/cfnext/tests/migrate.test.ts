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
  expect(json.compatibilityDate).toBe("2026-08-16")
  expect(json.compatibilityFlags).toEqual(["nodejs_compat"])
  expect(json.bindings?.d1?.[0]?.id).toBe("11111111-1111-1111-1111-111111111111")
})

test("wranglerToCfnextJson maps env.staging and preserves observability in passthrough", () => {
  const json = wranglerToCfnextJson(
    {
      name: "demo",
      main: "worker.ts",
      compatibility_date: "2026-08-16",
      observability: { enabled: true, head_sampling_rate: 0.5 },
      env: {
        staging: {
          vars: { APP_ENV: "staging" },
          d1_databases: [{ binding: "DB", database_id: "22222222-2222-2222-2222-222222222222" }],
        },
      },
    },
    "demo",
  )
  expect(json.env?.staging?.vars).toEqual({ APP_ENV: "staging" })
  expect(json.env?.staging?.bindings?.d1?.[0]?.id).toBe("22222222-2222-2222-2222-222222222222")
  expect(json.passthrough?.observability).toEqual({ enabled: true, head_sampling_rate: 0.5 })
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

test("cfnext migrate wrangler refuses to overwrite existing cfnext.json", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-mig-exist-"))
  await writeFile(join(dir, "wrangler.jsonc"), JSON.stringify({ name: "legacy", main: "worker.ts", compatibility_date: "2026-08-16" }, null, 2))
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "keep-me", target: "workers" }, null, 2))
  const proc = Bun.spawn(["bun", cli, "migrate", "wrangler"], { cwd: dir, stdout: "pipe", stderr: "pipe" })
  expect(await proc.exited).toBe(1)
  const err = await new Response(proc.stderr).text()
  expect(err).toMatch(/already exists/)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.name).toBe("keep-me")
})

test("generate --check is green after generate", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-check-"))
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "workers" }, null, 2))
  await generate(dir)
  const proc = Bun.spawn(["bun", cli, "generate", "--check"], { cwd: dir, stdout: "pipe", stderr: "pipe" })
  expect(await proc.exited).toBe(0)
})
