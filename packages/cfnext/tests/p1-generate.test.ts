import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { parseJsonc } from "../src/jsonc"
import type { CfnextJson } from "../src/schema"
import { generate, GenerateError } from "../src/generate"
import { splitGenerated } from "../src/generate/hash"

async function tmpProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), "cfnext-p1-"))
}

async function writeJson(dir: string, json: CfnextJson): Promise<void> {
  await writeFile(join(dir, "cfnext.json"), JSON.stringify(json, null, 2))
}

async function writeStub(dir: string, rel: string, body = "export {}\n"): Promise<void> {
  const path = join(dir, rel)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body)
}

function wranglerBody<T>(text: string): T {
  return parseJsonc<T>(splitGenerated(text).body)
}

test("generate emits DO bindings, workflows, queue consumers, cron, secrets, vars, version_metadata", async () => {
  const dir = await tmpProject()
  await writeJson(dir, {
    name: "demo",
    target: "ssr",
    bindings: {
      queues: [{ binding: "QUEUE", queue: "demo-queue", consume: true }],
    },
    durableObjects: [{ binding: "RATE_LIMITER", className: "RateLimiter" }],
    workflows: [{ name: "orders", binding: "ORDERS", className: "OrderWorkflow" }],
    cron: ["0 * * * *"],
    vars: { APP_ENV: "production" },
    secrets: {
      required: ["CLERK_SECRET_KEY"],
      store: [{ binding: "STRIPE", storeId: "demo", secretName: "stripe" }],
    },
    migrations: [{ tag: "cfnext-do-RateLimiter", newSqliteClasses: ["RateLimiter"] }],
  })
  await writeStub(dir, "durable-objects/RateLimiter.ts")
  await writeStub(dir, "workflows/OrderWorkflow.ts")
  await writeStub(dir, "queue.ts")
  await writeStub(dir, "scheduled.ts")
  await writeFile(join(dir, "worker.ts"), "export default { fetch() { return new Response('ok') } }\n")

  await generate(dir)
  const wrangler = wranglerBody<{
    main?: string
    version_metadata?: { binding: string }
    vars?: Record<string, string>
    secrets?: { required?: string[] }
    secrets_store_secrets?: Array<{ binding: string; store_id: string; secret_name: string }>
    durable_objects?: { bindings: Array<{ name: string; class_name: string }> }
    workflows?: Array<{ name: string; binding: string; class_name: string }>
    queues?: { consumers?: Array<{ queue: string }>; producers?: Array<{ binding: string }> }
    triggers?: { crons?: string[] }
    migrations?: Array<{ tag: string; new_sqlite_classes?: string[] }>
  }>(await readFile(join(dir, "wrangler.jsonc"), "utf8"))

  expect(wrangler.main).toBe(".cloudflare/generated/worker.ts")
  expect(wrangler.version_metadata?.binding).toBe("CF_VERSION_METADATA")
  expect(wrangler.vars?.APP_ENV).toBe("production")
  expect(wrangler.secrets?.required).toEqual(["CLERK_SECRET_KEY"])
  expect(wrangler.secrets_store_secrets).toEqual([
    { binding: "STRIPE", store_id: "demo", secret_name: "stripe" },
  ])
  expect(wrangler.durable_objects?.bindings).toEqual([
    { name: "RATE_LIMITER", class_name: "RateLimiter" },
  ])
  expect(wrangler.workflows).toEqual([
    { name: "orders", binding: "ORDERS", class_name: "OrderWorkflow" },
  ])
  expect(wrangler.queues?.producers?.[0]?.binding).toBe("QUEUE")
  expect(wrangler.queues?.consumers?.[0]?.queue).toBe("demo-queue")
  expect(wrangler.triggers?.crons).toEqual(["0 * * * *"])
  expect(wrangler.migrations).toEqual([
    { tag: "cfnext-do-RateLimiter", new_sqlite_classes: ["RateLimiter"] },
  ])
})

test("generate copies migrations verbatim and refuses a live class missing from the log", async () => {
  const dir = await tmpProject()
  await writeJson(dir, {
    name: "demo",
    target: "workers",
    durableObjects: [{ binding: "RATE_LIMITER", className: "RateLimiter" }],
  })
  await writeStub(dir, "durable-objects/RateLimiter.ts")
  await expect(generate(dir)).rejects.toThrow(/cfnext add do/)
})

test("generate refuses a hand-removed DO that still has no deletedClasses entry", async () => {
  const dir = await tmpProject()
  await writeJson(dir, {
    name: "demo",
    target: "workers",
    migrations: [{ tag: "cfnext-do-RateLimiter", newSqliteClasses: ["RateLimiter"] }],
  })
  await expect(generate(dir)).rejects.toThrow(/cfnext rm do/)
})

test("container generate merges NEXT_APP with user DOs and keeps the v1 tag", async () => {
  const dir = await tmpProject()
  await writeJson(dir, {
    name: "demo",
    target: "container",
    durableObjects: [{ binding: "RATE_LIMITER", className: "RateLimiter" }],
    migrations: [
      { tag: "v1", newSqliteClasses: ["NextApp"] },
      { tag: "cfnext-do-RateLimiter", newSqliteClasses: ["RateLimiter"] },
    ],
  })
  await writeStub(dir, "durable-objects/RateLimiter.ts")
  await writeFile(
    join(dir, "worker.ts"),
    "export class NextApp {}\nexport default { fetch() { return new Response('ok') } }\n",
  )
  await generate(dir)
  const wrangler = wranglerBody<{
    durable_objects?: { bindings: Array<{ name: string; class_name: string }> }
    migrations?: Array<{ tag: string; new_sqlite_classes?: string[]; deleted_classes?: string[] }>
  }>(await readFile(join(dir, "wrangler.jsonc"), "utf8"))
  expect(wrangler.durable_objects?.bindings).toEqual([
    { name: "NEXT_APP", class_name: "NextApp" },
    { name: "RATE_LIMITER", class_name: "RateLimiter" },
  ])
  expect(wrangler.migrations?.map((row) => row.tag)).toEqual(["v1", "cfnext-do-RateLimiter"])
})

test("generate errors when a user DO uses the reserved NextApp class", async () => {
  const dir = await tmpProject()
  await writeJson(dir, {
    name: "demo",
    target: "ssr",
    durableObjects: [{ binding: "APP", className: "NextApp" }],
    migrations: [{ tag: "cfnext-do-NextApp", newSqliteClasses: ["NextApp"] }],
  })
  await writeStub(dir, "durable-objects/NextApp.ts")
  await expect(generate(dir)).rejects.toThrow(/NEXT_APP|NextApp/)
})

test("workers target does not emit version_metadata by default", async () => {
  const dir = await tmpProject()
  await writeJson(dir, { name: "demo", target: "workers" })
  await generate(dir)
  const wrangler = wranglerBody<{ version_metadata?: { binding: string } }>(
    await readFile(join(dir, "wrangler.jsonc"), "utf8"),
  )
  expect(wrangler.version_metadata).toBeUndefined()
})

test("generate writes composed main without patching user worker.ts", async () => {
  const dir = await tmpProject()
  const worker = `import { createSsrWorker } from "cfnext/worker/ssr"
export default createSsrWorker({ handlers: [], loaders: {} })
`
  await writeJson(dir, { name: "demo", target: "ssr" })
  await writeFile(join(dir, "worker.ts"), worker)
  await generate(dir)
  expect(await readFile(join(dir, "worker.ts"), "utf8")).toBe(worker)
  const generated = await readFile(join(dir, ".cloudflare/generated/worker.ts"), "utf8")
  expect(generated).toContain("composeWorker")
  expect(generated).toContain("export * from \"../../worker\"")
  expect(generated).toContain("export * from \"./handlers\"")
  const wrangler = wranglerBody<{ main?: string }>(await readFile(join(dir, "wrangler.jsonc"), "utf8"))
  expect(wrangler.main).toBe(".cloudflare/generated/worker.ts")
})

test("generate exits 1 when a required stub is missing", async () => {
  const dir = await tmpProject()
  await writeJson(dir, {
    name: "demo",
    target: "workers",
    cron: ["0 * * * *"],
  })
  await expect(generate(dir)).rejects.toBeInstanceOf(GenerateError)
  await expect(generate(dir)).rejects.toThrow(/scheduled\.ts/)
})

test("generate exits 1 when a Durable Object stub is missing", async () => {
  const dir = await tmpProject()
  await writeJson(dir, {
    name: "demo",
    target: "workers",
    durableObjects: [{ binding: "RATE_LIMITER", className: "RateLimiter" }],
    migrations: [{ tag: "cfnext-do-RateLimiter", newSqliteClasses: ["RateLimiter"] }],
  })
  await expect(generate(dir)).rejects.toThrow(/durable-objects\/RateLimiter\.ts/)
})

test("generate exits 1 when worker.ts and handlers export the same name", async () => {
  const dir = await tmpProject()
  await writeJson(dir, {
    name: "demo",
    target: "workers",
    durableObjects: [{ binding: "RATE_LIMITER", className: "RateLimiter" }],
    migrations: [{ tag: "cfnext-do-RateLimiter", newSqliteClasses: ["RateLimiter"] }],
  })
  await writeStub(dir, "durable-objects/RateLimiter.ts", "export class RateLimiter {}\n")
  await writeFile(join(dir, "worker.ts"), "export class RateLimiter {}\nexport default { fetch() { return new Response('ok') } }\n")
  await expect(generate(dir)).rejects.toThrow(/RateLimiter/)
})

test("generate --check fails when the handler barrel is stale", async () => {
  const dir = await tmpProject()
  await writeJson(dir, { name: "demo", target: "workers" })
  await generate(dir)
  await writeFile(join(dir, ".cloudflare/generated/handlers.ts"), "// stale\nexport {}\n")
  await expect(generate(dir, { check: true })).rejects.toThrow(/out of date/)
})

test("P1 compiled wrangler validates against vendored wrangler schema", async () => {
  const dir = await tmpProject()
  await writeJson(dir, {
    name: "demo",
    target: "ssr",
    bindings: {
      queues: [{ binding: "QUEUE", queue: "demo-queue", consume: true }],
    },
    durableObjects: [{ binding: "RATE_LIMITER", className: "RateLimiter" }],
    workflows: [
      { name: "orders", binding: "ORDERS", className: "OrderWorkflow", schedules: "0 * * * *" },
    ],
    cron: ["0 * * * *"],
    vars: { APP_ENV: "production" },
    secrets: {
      required: ["CLERK_SECRET_KEY"],
      store: [{ binding: "STRIPE", storeId: "demo", secretName: "stripe" }],
    },
    migrations: [{ tag: "cfnext-do-RateLimiter", newSqliteClasses: ["RateLimiter"] }],
  })
  await writeStub(dir, "durable-objects/RateLimiter.ts")
  await writeStub(dir, "workflows/OrderWorkflow.ts")
  await writeStub(dir, "queue.ts")
  await writeStub(dir, "scheduled.ts")
  await generate(dir)

  const wranglerPkg = Bun.resolveSync("wrangler/package.json", import.meta.dir)
  const schema = JSON.parse(
    await readFile(join(dirname(wranglerPkg), "config-schema.json"), "utf8"),
  ) as object
  const Ajv = (await import("ajv")).default
  const ajv = new Ajv({ strict: false, allErrors: true })
  const validate = ajv.compile(schema)
  const wrangler = wranglerBody<Record<string, unknown>>(await readFile(join(dir, "wrangler.jsonc"), "utf8"))
  expect(validate(wrangler), JSON.stringify(validate.errors, null, 2)).toBe(true)
  expect(wrangler.workflows).toEqual([
    {
      name: "orders",
      binding: "ORDERS",
      class_name: "OrderWorkflow",
      schedules: ["0 * * * *"],
    },
  ])
})
