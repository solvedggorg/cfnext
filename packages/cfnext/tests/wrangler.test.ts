import { expect, test } from "bun:test"

import { applyBinding } from "../src/bindings"
import { normalizeConfig } from "../src/config"
import { buildWrangler } from "../src/wrangler"

test("workers wrangler config packs assets and skips containers", () => {
  const wrangler = buildWrangler(
    normalizeConfig({
      name: "demo",
      target: "workers",
      protect: { prefixes: ["/dashboard"] },
    }),
  )
  expect(wrangler.name).toBe("demo")
  expect(wrangler.assets?.directory).toBe(".cloudflare/assets")
  expect(wrangler.assets?.run_worker_first).toContain("/dashboard")
  expect(wrangler.assets?.run_worker_first).toContain("/dashboard/*")
  expect(wrangler.containers).toBeUndefined()
})

test("container wrangler config adds the NextApp Durable Object", () => {
  const wrangler = buildWrangler(normalizeConfig({ name: "demo", target: "container" }))
  expect(wrangler.containers?.[0]?.class_name).toBe("NextApp")
  expect(wrangler.durable_objects?.bindings[0]?.name).toBe("NEXT_APP")
  expect(wrangler.assets?.run_worker_first).toBe(true)
})

test("ssr wrangler config enables nodejs_compat and always runs the worker first", () => {
  const wrangler = buildWrangler(normalizeConfig({ name: "demo", target: "ssr" }))
  expect(wrangler.compatibility_flags).toContain("nodejs_compat")
  expect(wrangler.assets?.run_worker_first).toBe(true)
  expect(wrangler.containers).toBeUndefined()
})

test("applyBinding scaffolds D1, R2, and KV", () => {
  let wrangler = buildWrangler(normalizeConfig({ name: "demo", target: "workers" }))
  wrangler = applyBinding(wrangler, { kind: "d1" }).wrangler
  wrangler = applyBinding(wrangler, { kind: "r2" }).wrangler
  wrangler = applyBinding(wrangler, { kind: "kv" }).wrangler
  expect(wrangler.d1_databases?.[0]?.binding).toBe("DB")
  expect(wrangler.r2_buckets?.[0]?.bucket_name).toBe("demo-bucket")
  expect(wrangler.kv_namespaces?.[0]?.binding).toBe("KV")
})
