import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { CATALOG, presentUnimplementedPaths } from "../src/catalog"
import { exampleA } from "./fixtures/cfnext-json"

const wranglerSchema = JSON.parse(
  readFileSync(
    join(import.meta.dir, "../node_modules/wrangler/config-schema.json"),
    "utf8",
  ),
) as {
  definitions: { RawConfig: { properties: Record<string, unknown> } }
}

const wranglerKeys = new Set(Object.keys(wranglerSchema.definitions.RawConfig.properties))

test("every non-virtual wranglerKey exists on vendored wrangler schema", () => {
  const missing: string[] = []
  for (const kind of CATALOG) {
    if (kind.virtual || !kind.wranglerKey) continue
    if (!wranglerKeys.has(kind.wranglerKey)) missing.push(`${kind.kind} → ${kind.wranglerKey}`)
  }
  expect(missing).toEqual([])
})

test("P0 emitImplemented is true only for the seven binding kinds", () => {
  const implemented = CATALOG.filter((k) => k.emitImplemented).map((k) => k.kind).sort()
  expect(implemented).toEqual(["ai", "d1", "hyperdrive", "kv", "queue", "r2", "vectorize"])
})

test("Example A present paths include unimplemented catalog kinds", () => {
  const paths = presentUnimplementedPaths(exampleA)
  expect(paths.some((p) => p.startsWith("email") || p.startsWith("access") || p.startsWith("media"))).toBe(
    true,
  )
})
