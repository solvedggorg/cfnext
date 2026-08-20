import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { BINDING_KINDS } from "../src/bindings"
import { CATALOG, P0_BINDING_KINDS, presentUnimplementedPaths } from "../src/catalog"
import { CFNEXT_VERSION } from "../src/constants"
import { exampleA } from "./fixtures/cfnext-json"

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

test("P2 emitImplemented includes P1 plus Access, Flagship, observability, logpush, web-analytics", () => {
  const implemented = CATALOG.filter((k) => k.emitImplemented).map((k) => k.kind).sort()
  expect(implemented).toEqual([
    "access",
    "ai",
    "cron",
    "d1",
    "do",
    "flagship",
    "hyperdrive",
    "kv",
    "logpush",
    "observability",
    "queue",
    "r2",
    "secret",
    "secret-store",
    "var",
    "vectorize",
    "version-metadata",
    "web-analytics",
    "workflow",
  ])
})

test("Example A present paths include unimplemented catalog kinds", () => {
  expect(presentUnimplementedPaths(exampleA).sort()).toEqual([
    "email.routing",
    "email.sending",
    "media.images.binding",
    "media.images.loader",
  ])
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
