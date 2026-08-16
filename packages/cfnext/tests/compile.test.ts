import { expect, test } from "bun:test"
import { chmod } from "node:fs/promises"
import { join } from "node:path"

import { compileCli } from "../src/build/compile-cli"

const pkgRoot = join(import.meta.dir, "..")

test("compileCli writes a runnable cfnext binary", async () => {
  const outfile = join(pkgRoot, "dist/bin/cfnext")
  const result = await compileCli({ packageRoot: pkgRoot, outfile })
  expect(result.ok).toBe(true)
  expect(result.outfile).toBe(outfile)

  await chmod(outfile, 0o755)
  const proc = Bun.spawn([outfile, "--help"], { stdout: "pipe", stderr: "pipe" })
  const code = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  expect(code).toBe(0)
  expect(stdout).toContain("cfnext init")
  expect(stdout).toContain("--target workers|ssr|container")
}, 120_000)
