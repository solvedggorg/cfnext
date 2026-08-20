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

test("wranglerToCfnextJson maps P1 workflows, secrets, cron, and user DOs", () => {
  const json = wranglerToCfnextJson(
    {
      name: "demo",
      main: "worker.ts",
      compatibility_date: "2026-08-16",
      durable_objects: {
        bindings: [
          { name: "NEXT_APP", class_name: "NextApp" },
          { name: "RATE_LIMITER", class_name: "RateLimiter" },
        ],
      },
      workflows: [{ name: "orders", binding: "ORDERS", class_name: "OrderWorkflow" }],
      triggers: { crons: ["0 * * * *"] },
      secrets: { required: ["CLERK_SECRET_KEY"] },
      secrets_store_secrets: [{ binding: "STRIPE", store_id: "demo", secret_name: "stripe" }],
      migrations: [
        { tag: "v1", new_sqlite_classes: ["NextApp"] },
        { tag: "cfnext-do-RateLimiter", new_sqlite_classes: ["RateLimiter"] },
      ],
    },
    "demo",
  )
  expect(json.durableObjects).toEqual([{ binding: "RATE_LIMITER", className: "RateLimiter" }])
  expect(json.workflows).toEqual([{ name: "orders", binding: "ORDERS", className: "OrderWorkflow" }])
  expect(json.cron).toEqual(["0 * * * *"])
  expect(json.secrets?.required).toEqual(["CLERK_SECRET_KEY"])
  expect(json.secrets?.store).toEqual([{ binding: "STRIPE", storeId: "demo", secretName: "stripe" }])
  expect(json.migrations).toEqual([
    { tag: "v1", newSqliteClasses: ["NextApp"] },
    { tag: "cfnext-do-RateLimiter", newSqliteClasses: ["RateLimiter"] },
  ])
})

test("wranglerToCfnextJson copies container v1 migrations without synthesizing NEXT_APP as a user DO", () => {
  const json = wranglerToCfnextJson(
    {
      name: "demo",
      main: "worker.ts",
      compatibility_date: "2026-08-16",
      containers: [{ class_name: "NextApp" }],
      durable_objects: { bindings: [{ name: "NEXT_APP", class_name: "NextApp" }] },
      migrations: [{ tag: "v1", new_sqlite_classes: ["NextApp"] }],
    },
    "demo",
  )
  expect(json.target).toBe("container")
  expect(json.durableObjects).toBeUndefined()
  expect(json.migrations).toEqual([{ tag: "v1", newSqliteClasses: ["NextApp"] }])
})

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

test("wranglerToCfnextJson maps send_email, images, stream, and media", () => {
  const json = wranglerToCfnextJson(
    {
      name: "demo",
      main: "worker.ts",
      compatibility_date: "2026-08-16",
      send_email: [{ name: "EMAIL", allowed_sender_addresses: ["noreply@acme.com"] }],
      images: { binding: "IMAGES" },
      stream: { binding: "STREAM" },
      media: { binding: "MEDIA", remote: true },
    },
    "demo",
  )
  expect(json.email?.sending).toEqual({ binding: "EMAIL", allowedSenders: ["noreply@acme.com"] })
  expect(json.media?.images?.binding).toBe("IMAGES")
  expect(json.media?.stream).toEqual({ binding: "STREAM" })
  expect(json.media?.transforms).toEqual({ binding: "MEDIA", remote: true })
  expect(json.passthrough?.send_email).toBeUndefined()
  expect(json.passthrough?.images).toBeUndefined()
})

test("wranglerToCfnextJson maps env.staging and observability", () => {
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
  expect(json.observability).toEqual({ enabled: true, headSamplingRate: 0.5 })
  expect(json.passthrough?.observability).toBeUndefined()
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
