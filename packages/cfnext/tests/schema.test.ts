import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import Ajv2020 from "ajv/dist/2020"
import addFormats from "ajv-formats"

import schema from "../schema/cfnext.schema.json"
import { exampleA, exampleB, p0Fixture } from "./fixtures/cfnext-json"

const pkgRoot = join(import.meta.dir, "..")

function compile() {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats(ajv)
  return ajv.compile(schema)
}

test("JSON Schema is valid draft 2020-12 and compiles", () => {
  const validate = compile()
  expect(typeof validate).toBe("function")
})

test("P0 fixture (name, target, seven bindings) validates", () => {
  const validate = compile()
  const ok = validate(p0Fixture)
  expect(validate.errors ?? []).toEqual([])
  expect(ok).toBe(true)
})

test("Example A (SaaS target-state) validates as schema-only", () => {
  const validate = compile()
  const ok = validate(exampleA)
  expect(validate.errors ?? []).toEqual([])
  expect(ok).toBe(true)
})

test("Example B (AI target-state) validates as schema-only", () => {
  const validate = compile()
  const ok = validate(exampleB)
  expect(validate.errors ?? []).toEqual([])
  expect(ok).toBe(true)
})

test("top-level preview overlay is a schema error", () => {
  const validate = compile()
  expect(validate({ name: "acme", preview: { vars: { X: "1" } } })).toBe(false)
})

test("schema file is shipped next to the package", () => {
  const text = readFileSync(join(pkgRoot, "schema/cfnext.schema.json"), "utf8")
  expect(text).toContain("CfnextJson")
  const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")) as {
    exports: Record<string, unknown>
    files: string[]
  }
  expect(pkg.exports["./schema"]).toBeDefined()
  expect(pkg.files).toContain("schema")
})
