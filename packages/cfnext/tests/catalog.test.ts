import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { BINDING_KINDS } from "../src/bindings"
import { CATALOG, P0_BINDING_KINDS, presentUnimplementedPaths } from "../src/catalog"
import { CFNEXT_VERSION } from "../src/constants"
import { exampleA, exampleB } from "./fixtures/cfnext-json"

const wranglerPkg = Bun.resolveSync("wrangler/package.json", import.meta.dir)
const wranglerSchema = JSON.parse(
  readFileSync(join(dirname(wranglerPkg), "config-schema.json"), "utf8"),
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

test("P4 emitImplemented includes P3 plus AI, agents, and MCP kinds", () => {
  const implemented = CATALOG.filter((k) => k.emitImplemented).map((k) => k.kind).sort()
  expect(implemented).toEqual([
    "access",
    "agent",
    "ai",
    "ai-gateway",
    "ai-search",
    "cron",
    "d1",
    "do",
    "email",
    "email-routing",
    "flagship",
    "hyperdrive",
    "image-loader",
    "images",
    "kv",
    "logpush",
    "mcp-portal",
    "media",
    "model",
    "observability",
    "queue",
    "r2",
    "realtime",
    "secret",
    "secret-store",
    "stream",
    "var",
    "vectorize",
    "version-metadata",
    "web-analytics",
    "websearch",
    "workflow",
  ])
})

test("Example A present paths are implemented in P3", () => {
  expect(presentUnimplementedPaths(exampleA)).toEqual([])
})

test("Example B present paths are implemented in P4", () => {
  expect(presentUnimplementedPaths(exampleB)).toEqual([])
})

test("P0_BINDING_KINDS matches legacy BINDING_KINDS", () => {
  expect([...P0_BINDING_KINDS].sort() as string[]).toEqual([...BINDING_KINDS].sort())
})

test("CFNEXT_VERSION matches package.json", () => {
  const pkg = JSON.parse(
    readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
  ) as { version: string }
  expect(CFNEXT_VERSION).toBe(pkg.version)
})
