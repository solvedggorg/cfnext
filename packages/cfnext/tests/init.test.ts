import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { parseJsonc } from "../src/jsonc"
import { renderFiles } from "../src/templates/app"

test("workers scaffold writes adapter wiring without a Dockerfile", () => {
  const files = renderFiles({
    dirName: "demo",
    name: "demo",
    target: "workers",
    bindings: ["d1"],
    packageSpecifier: "file:../cfnext",
  })
  expect(files["next.config.ts"]).toContain("withCfnext")
  expect(files["worker.ts"]).toContain("createAssetsWorker")
  expect(files.Dockerfile).toBeUndefined()
  expect(files["migrations/0001_init.sql"]).toBeDefined()
  const wrangler = parseJsonc<{ d1_databases?: Array<{ binding: string }> }>(files["wrangler.jsonc"]!)
  expect(wrangler.d1_databases?.[0]?.binding).toBe("DB")
})

test("container scaffold includes the image and NextApp class", () => {
  const files = renderFiles({
    dirName: "demo",
    name: "demo",
    target: "container",
    bindings: ["r2", "kv"],
    packageSpecifier: "file:../cfnext",
  })
  expect(files.Dockerfile).toContain('"next", "start"')
  expect(files.Dockerfile).toContain("CFNEXT_TARGET=container")
  expect(files["worker.ts"]).toContain("export class NextApp")
  const wrangler = parseJsonc<{
    containers?: Array<{ class_name: string }>
    r2_buckets?: Array<{ bucket_name: string }>
  }>(files["wrangler.jsonc"]!)
  expect(wrangler.containers?.[0]?.class_name).toBe("NextApp")
  expect(wrangler.r2_buckets?.[0]?.bucket_name).toBe("demo-bucket")
})

test("ssr scaffold writes the SSR worker and a dynamic health route", () => {
  const files = renderFiles({
    dirName: "demo",
    name: "demo",
    target: "ssr",
    bindings: ["d1"],
    packageSpecifier: "file:../cfnext",
  })
  expect(files["worker.ts"]).toContain("createSsrWorker")
  expect(files["app/api/health/route.ts"]).not.toContain("force-static")
  expect(files["app/api/health/route.ts"]).toContain("env.ASSETS")
  expect(files["app/api/health/route.ts"]).not.toContain("as {")
  expect(files.Dockerfile).toBeUndefined()
  const wrangler = parseJsonc<{
    compatibility_flags?: string[]
    assets?: { run_worker_first?: boolean | string[] }
  }>(files["wrangler.jsonc"]!)
  expect(wrangler.compatibility_flags).toContain("nodejs_compat")
  expect(wrangler.assets?.run_worker_first).toBe(true)
})

test("init --skip-install writes a real directory", async () => {
  const dest = await mkdtemp(join(tmpdir(), "cfnext-init-"))
  const proc = Bun.spawn(
    [
      "bun",
      join(import.meta.dir, "../src/cli/index.ts"),
      "init",
      dest,
      "--yes",
      "--skip-install",
      "--target",
      "workers",
      "--bindings",
      "d1,kv",
    ],
    { stdout: "pipe", stderr: "pipe" },
  )
  const code = await proc.exited
  expect(code).toBe(0)
  expect(existsSync(join(dest, "cfnext.json"))).toBe(true)
  expect(existsSync(join(dest, "cfnext.config.generated.ts"))).toBe(true)
  expect(existsSync(join(dest, "wrangler.jsonc"))).toBe(true)
  expect(existsSync(join(dest, "worker.ts"))).toBe(true)
  expect(existsSync(join(dest, "app/page.tsx"))).toBe(true)
  expect(existsSync(join(dest, "migrations/0001_init.sql"))).toBe(true)
})

test("init --bindings hyperdrive exits 1", async () => {
  const dest = await mkdtemp(join(tmpdir(), "cfnext-init-hd-"))
  const proc = Bun.spawn(
    [
      "bun",
      join(import.meta.dir, "../src/cli/index.ts"),
      "init",
      dest,
      "--yes",
      "--skip-install",
      "--bindings",
      "hyperdrive",
    ],
    { stdout: "pipe", stderr: "pipe" },
  )
  expect(await proc.exited).toBe(1)
  expect(await new Response(proc.stderr).text()).toMatch(/hyperdrive cannot be scaffolded/)
})
