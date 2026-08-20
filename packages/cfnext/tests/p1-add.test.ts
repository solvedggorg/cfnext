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

async function tmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p1-add-"))
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

async function seed(dir: string, json: CfnextJson = { name: "demo", target: "ssr" }): Promise<void> {
  await writeFile(join(dir, "cfnext.json"), JSON.stringify(json, null, 2))
  await writeFile(
    join(dir, "worker.ts"),
    `import { createSsrWorker } from "cfnext/worker/ssr"
export default createSsrWorker({ handlers: [], loaders: {} })
`,
  )
  await generate(dir)
}

test("cfnext add do writes class, stub, and append-only migration", async () => {
  const dir = await tmpDir()
  await seed(dir)
  const workerBefore = await readFile(join(dir, "worker.ts"), "utf8")
  const result = await runCli(dir, ["add", "do", "--binding", "RATE_LIMITER", "--class", "RateLimiter"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.durableObjects).toEqual([{ binding: "RATE_LIMITER", className: "RateLimiter" }])
  expect(json.migrations).toEqual([{ tag: "cfnext-do-RateLimiter", newSqliteClasses: ["RateLimiter"] }])
  expect(existsSync(join(dir, "durable-objects/RateLimiter.ts"))).toBe(true)
  expect(await readFile(join(dir, "durable-objects/RateLimiter.ts"), "utf8")).toContain(
    "export class RateLimiter extends DurableObject",
  )
  expect(await readFile(join(dir, "worker.ts"), "utf8")).toBe(workerBefore)
})

test("cfnext add workflow/queue --consume/cron/secret-store write stubs and wrangler keys", async () => {
  const dir = await tmpDir()
  await seed(dir)
  const workerBefore = await readFile(join(dir, "worker.ts"), "utf8")

  expect(
    (await runCli(dir, ["add", "workflow", "--name", "orders", "--binding", "ORDERS", "--class", "OrderWorkflow"])).code,
  ).toBe(0)
  expect((await runCli(dir, ["add", "queue", "--consume"])).code).toBe(0)
  expect((await runCli(dir, ["add", "cron", "--expr", "0 * * * *"])).code).toBe(0)
  expect(
    (await runCli(dir, ["add", "secret-store", "--binding", "STRIPE", "--store-id", "demo", "--secret-name", "stripe"]))
      .code,
  ).toBe(0)

  expect(await readFile(join(dir, "worker.ts"), "utf8")).toBe(workerBefore)
  expect(existsSync(join(dir, "workflows/OrderWorkflow.ts"))).toBe(true)
  expect(await readFile(join(dir, "workflows/OrderWorkflow.ts"), "utf8")).toContain("WorkflowEntrypoint")
  expect(existsSync(join(dir, "queue.ts"))).toBe(true)
  expect(existsSync(join(dir, "scheduled.ts"))).toBe(true)

  const wrangler = parseJsonc<{
    main?: string
    workflows?: Array<{ binding: string }>
    queues?: { consumers?: Array<{ queue: string }> }
    triggers?: { crons?: string[] }
    secrets_store_secrets?: Array<{ binding: string }>
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.main).toBe(".cloudflare/generated/worker.ts")
  expect(wrangler.workflows?.[0]?.binding).toBe("ORDERS")
  expect(wrangler.queues?.consumers?.[0]?.queue).toBe("demo-queue")
  expect(wrangler.triggers?.crons).toEqual(["0 * * * *"])
  expect(wrangler.secrets_store_secrets?.[0]?.binding).toBe("STRIPE")
})

test("cfnext rm do removes the live class and appends deletedClasses", async () => {
  const dir = await tmpDir()
  await seed(dir)
  expect((await runCli(dir, ["add", "do", "--binding", "RATE_LIMITER", "--class", "RateLimiter"])).code).toBe(0)
  const result = await runCli(dir, ["rm", "do", "--class", "RateLimiter"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.durableObjects ?? []).toEqual([])
  expect(json.migrations).toEqual([
    { tag: "cfnext-do-RateLimiter", newSqliteClasses: ["RateLimiter"] },
    { tag: "cfnext-do-RateLimiter-del", deletedClasses: ["RateLimiter"] },
  ])
  const wrangler = parseJsonc<{
    durable_objects?: { bindings?: Array<{ class_name: string }> }
    migrations?: Array<{ tag: string; deleted_classes?: string[] }>
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.durable_objects?.bindings ?? []).toEqual([])
  expect(wrangler.migrations?.map((row) => row.tag)).toEqual([
    "cfnext-do-RateLimiter",
    "cfnext-do-RateLimiter-del",
  ])
  expect(wrangler.migrations?.[1]?.deleted_classes).toEqual(["RateLimiter"])
})

test("cfnext add do --rename appends renamedClasses", async () => {
  const dir = await tmpDir()
  await seed(dir)
  expect((await runCli(dir, ["add", "do", "--binding", "RATE_LIMITER", "--class", "RateLimiter"])).code).toBe(0)
  const result = await runCli(dir, ["add", "do", "--rename", "RateLimiter:Limiter"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.durableObjects?.[0]?.className).toBe("Limiter")
  expect(json.migrations?.at(-1)).toEqual({
    tag: "cfnext-do-RateLimiter-Limiter",
    renamedClasses: [{ from: "RateLimiter", to: "Limiter" }],
  })
})

test("cfnext add secret and var write JSON fields", async () => {
  const dir = await tmpDir()
  await seed(dir)
  expect((await runCli(dir, ["add", "secret", "--name", "STRIPE_SECRET_KEY"])).code).toBe(0)
  expect((await runCli(dir, ["add", "var", "--name", "APP_ENV", "--value", "production"])).code).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.secrets?.required).toEqual(["STRIPE_SECRET_KEY"])
  expect(json.vars).toEqual({ APP_ENV: "production" })
})

test("cfnext add do refuses reserved NEXT_APP / NextApp", async () => {
  const dir = await tmpDir()
  await seed(dir)
  const binding = await runCli(dir, ["add", "do", "--binding", "NEXT_APP", "--class", "Limiter"])
  expect(binding.code).toBe(1)
  expect(binding.stderr).toMatch(/NEXT_APP|NextApp/)
  const klass = await runCli(dir, ["add", "do", "--binding", "APP", "--class", "NextApp"])
  expect(klass.code).toBe(1)
  expect(klass.stderr).toMatch(/NEXT_APP|NextApp/)
})

test("cfnext add do --no-sqlite appends newClasses instead of newSqliteClasses", async () => {
  const dir = await tmpDir()
  await seed(dir)
  const result = await runCli(dir, ["add", "do", "--binding", "LEGACY", "--class", "Legacy", "--no-sqlite"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.durableObjects?.[0]).toEqual({ binding: "LEGACY", className: "Legacy", sqlite: false })
  expect(json.migrations).toEqual([{ tag: "cfnext-do-Legacy", newClasses: ["Legacy"] }])
})

test("cfnext add do is idempotent for the same binding and class", async () => {
  const dir = await tmpDir()
  await seed(dir)
  expect((await runCli(dir, ["add", "do", "--binding", "RATE_LIMITER", "--class", "RateLimiter"])).code).toBe(0)
  const second = await runCli(dir, ["add", "do", "--binding", "RATE_LIMITER", "--class", "RateLimiter"])
  expect(second.code, `${second.stdout}\n${second.stderr}`).toBe(0)
  expect(second.stdout + second.stderr).toMatch(/already/)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.migrations).toEqual([{ tag: "cfnext-do-RateLimiter", newSqliteClasses: ["RateLimiter"] }])
})

test("cfnext add do refuses to reuse a binding for a different class", async () => {
  const dir = await tmpDir()
  await seed(dir)
  expect((await runCli(dir, ["add", "do", "--binding", "RATE_LIMITER", "--class", "RateLimiter"])).code).toBe(0)
  const result = await runCli(dir, ["add", "do", "--binding", "RATE_LIMITER", "--class", "Other"])
  expect(result.code).toBe(1)
  expect(result.stderr).toMatch(/RATE_LIMITER|rename/i)
})

test("cfnext add workflow --expr emits schedules as an array", async () => {
  const dir = await tmpDir()
  await seed(dir)
  const result = await runCli(dir, [
    "add",
    "workflow",
    "--name",
    "orders",
    "--binding",
    "ORDERS",
    "--class",
    "OrderWorkflow",
    "--expr",
    "0 * * * *",
  ])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.workflows?.[0]?.schedules).toEqual(["0 * * * *"])
  const wrangler = parseJsonc<{ workflows?: Array<{ schedules?: string[] }> }>(
    splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body,
  )
  expect(wrangler.workflows?.[0]?.schedules).toEqual(["0 * * * *"])
})

test("cfnext add do adds @cloudflare/workers-types when missing", async () => {
  const dir = await tmpDir()
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "demo", private: true, devDependencies: {} }, null, 2),
  )
  await seed(dir)
  const result = await runCli(dir, ["add", "do", "--binding", "RATE_LIMITER", "--class", "RateLimiter"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as {
    devDependencies?: Record<string, string>
  }
  expect(pkg.devDependencies?.["@cloudflare/workers-types"]).toBeDefined()
})

test("container rm do keeps NEXT_APP and the v1 migration tag", async () => {
  const dir = await tmpDir()
  await writeFile(
    join(dir, "worker.ts"),
    `export class NextApp {}\nexport default { fetch() { return new Response("ok") } }\n`,
  )
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "container" }, null, 2))
  await generate(dir)
  expect((await runCli(dir, ["add", "do", "--binding", "RATE_LIMITER", "--class", "RateLimiter"])).code).toBe(0)
  const result = await runCli(dir, ["rm", "do", "--class", "RateLimiter"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
  const wrangler = parseJsonc<{
    durable_objects?: { bindings?: Array<{ name: string; class_name: string }> }
    migrations?: Array<{ tag: string }>
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.durable_objects?.bindings).toEqual([{ name: "NEXT_APP", class_name: "NextApp" }])
  expect(wrangler.migrations?.map((row) => row.tag)).toEqual([
    "v1",
    "cfnext-do-RateLimiter",
    "cfnext-do-RateLimiter-del",
  ])
})
