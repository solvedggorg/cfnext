import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { expect, test } from "bun:test"

import { REGISTRY_URL } from "../src/constants"
import { ensureBunfigRegistry } from "../src/cli/commands/init"
import { renderFiles } from "../src/templates/app"

test("init scaffold bunfig installs cfnext from the solved registry", () => {
  const files = renderFiles({
    dirName: "demo",
    name: "demo",
    target: "workers",
    bindings: [],
    packageSpecifier: "cfnext@0.6.0",
  })
  const bunfig = files["bunfig.toml"]
  expect(bunfig).toContain("[install]")
  expect(bunfig).toContain(`registry = "${REGISTRY_URL}"`)
})

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "cfnext-bunfig-"))
}

test("ensureBunfigRegistry creates the file when missing", async () => {
  const dir = await tempDir()
  await ensureBunfigRegistry(dir)
  const text = await readFile(join(dir, "bunfig.toml"), "utf8")
  expect(text).toContain("[run]")
  expect(text).toContain(`registry = "${REGISTRY_URL}"`)
})

test("ensureBunfigRegistry appends to an existing file without [install]", async () => {
  const dir = await tempDir()
  const path = join(dir, "bunfig.toml")
  await writeFile(path, "[run]\nbun = true\n")
  await ensureBunfigRegistry(dir)
  const text = await readFile(path, "utf8")
  expect(text).toContain("[run]\nbun = true\n")
  expect(text).toContain(`registry = "${REGISTRY_URL}"`)
})

test("ensureBunfigRegistry leaves an existing registry untouched", async () => {
  const dir = await tempDir()
  const path = join(dir, "bunfig.toml")
  const before = `[install]\nregistry = "https://registry.npmjs.org"\n`
  await writeFile(path, before)
  await ensureBunfigRegistry(dir)
  expect(await readFile(path, "utf8")).toBe(before)
})
