import { expect, test } from "bun:test"
import { join } from "node:path"

const pkgRoot = join(import.meta.dir, "..")

test("public exports declare types for next.config.ts-style imports", async () => {
  const pkg = (await Bun.file(join(pkgRoot, "package.json")).json()) as {
    types?: string
    exports: Record<string, unknown>
  }
  expect(pkg.types).toMatch(/\.d\.ts$/)
  for (const key of [
    ".",
    "./adapter",
    "./server",
    "./worker/compose",
    "./access",
    "./flags",
    "./analytics",
    "./email",
    "./ai",
    "./image-loader",
    "./stream",
  ]) {
    const entry = pkg.exports[key]
    expect(entry && typeof entry === "object").toBe(true)
    expect((entry as { types?: string }).types).toMatch(/\.d\.ts$/)
  }
})
