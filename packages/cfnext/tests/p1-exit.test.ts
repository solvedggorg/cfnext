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

async function runCli(dir: string, argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", cli, ...argv], { cwd: dir, stdout: "pipe", stderr: "pipe" })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  return { code: await proc.exited, stdout, stderr }
}

test("P1 exit criterion: add do/workflow/queue/cron/secret-store, rm do, types", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p1-exit-"))
  dirs.push(dir)
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "ssr" }, null, 2))
  const worker = `import { createSsrWorker } from "cfnext/worker/ssr"
export default createSsrWorker({ handlers: [], loaders: {} })
`
  await writeFile(join(dir, "worker.ts"), worker)
  await generate(dir)

  for (const argv of [
    ["add", "do", "--binding", "RATE_LIMITER", "--class", "RateLimiter"],
    ["add", "workflow", "--name", "orders", "--binding", "ORDERS", "--class", "OrderWorkflow"],
    ["add", "queue", "--consume"],
    ["add", "cron", "--expr", "0 * * * *"],
    ["add", "secret-store", "--binding", "STRIPE", "--store-id", "demo", "--secret-name", "stripe"],
  ]) {
    const result = await runCli(dir, argv)
    expect(result.code, `${argv.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(0)
  }

  expect(await readFile(join(dir, "worker.ts"), "utf8")).toBe(worker)
  expect(existsSync(join(dir, "workflows/OrderWorkflow.ts"))).toBe(true)
  expect(await readFile(join(dir, "workflows/OrderWorkflow.ts"), "utf8")).toContain("WorkflowEntrypoint")

  const jsonAfterAdd = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(jsonAfterAdd.migrations?.some((row) => row.tag === "cfnext-do-RateLimiter")).toBe(true)

  const generated = await readFile(join(dir, ".cloudflare/generated/worker.ts"), "utf8")
  expect(generated).toContain("composeWorker")
  expect(generated).toContain('export * from "./handlers"')
  expect(generated).toContain('export * from "../../worker"')

  const rm = await runCli(dir, ["rm", "do", "--class", "RateLimiter"])
  expect(rm.code, `${rm.stdout}\n${rm.stderr}`).toBe(0)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.durableObjects ?? []).toEqual([])
  expect(json.migrations).toEqual([
    { tag: "cfnext-do-RateLimiter", newSqliteClasses: ["RateLimiter"] },
    { tag: "cfnext-do-RateLimiter-del", deletedClasses: ["RateLimiter"] },
  ])

  const wrangler = parseJsonc<{
    main?: string
    durable_objects?: { bindings?: Array<{ class_name: string }> }
    workflows?: Array<{ binding: string }>
    queues?: { consumers?: Array<{ queue: string }> }
    triggers?: { crons?: string[] }
    secrets_store_secrets?: Array<{ binding: string }>
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.main).toBe(".cloudflare/generated/worker.ts")
  expect(wrangler.durable_objects?.bindings ?? []).toEqual([])
  expect(wrangler.workflows?.some((row) => row.binding === "ORDERS")).toBe(true)
  expect(wrangler.queues?.consumers?.length).toBeGreaterThan(0)
  expect(wrangler.triggers?.crons).toEqual(["0 * * * *"])
  expect(wrangler.secrets_store_secrets?.some((row) => row.binding === "STRIPE")).toBe(true)

  const types = await runCli(dir, ["types"])
  expect(types.code, `${types.stdout}\n${types.stderr}`).toBe(0)
  const env = await readFile(join(dir, "cloudflare-env.d.ts"), "utf8")
  expect(env).toContain("interface CloudflareEnv")
  expect(env).toContain("ORDERS")
  expect(env).toContain("QUEUE")
  expect(env).toContain("STRIPE")
  expect(env).not.toContain("RateLimiter")
  expect(env).not.toContain("RATE_LIMITER")
}, 120_000)
