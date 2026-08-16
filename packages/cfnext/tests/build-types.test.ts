import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { emitDeclarations } from "../src/build/emit-declarations"

const pkgRoot = join(import.meta.dir, "..")

test("declaration emit includes withCfnext and CfnextUserConfig", async () => {
  const result = await emitDeclarations(pkgRoot)
  expect(result.ok).toBe(true)
  const dts = await Bun.file(join(pkgRoot, "dist/index.d.ts")).text()
  expect(dts).toContain("withCfnext")
  expect(dts).toContain("CfnextUserConfig")
  expect(dts).toContain("adapterPath")
})

test("a next.config.ts consumer typechecks against emitted types", async () => {
  await emitDeclarations(pkgRoot)
  const dir = await mkdtemp(join(tmpdir(), "cfnext-types-"))
  await writeFile(
    join(dir, "next.config.ts"),
    `import { withCfnext } from "cfnext"
import type { CfnextUserConfig } from "cfnext"

const nextConfig = {
  poweredByHeader: false,
}

export default withCfnext(nextConfig)

export const cf = {
  name: "demo",
  target: "ssr",
} satisfies CfnextUserConfig
`,
  )
  await writeFile(
    join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          paths: {
            cfnext: [join(pkgRoot, "dist/index.d.ts")],
          },
        },
        include: ["next.config.ts"],
      },
      null,
      2,
    ),
  )

  const tsc = join(pkgRoot, "../../node_modules/typescript/bin/tsc")
  const proc = Bun.spawn([tsc, "--noEmit", "-p", join(dir, "tsconfig.json")], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  })
  const code = await proc.exited
  const stderr = await new Response(proc.stderr).text()
  const stdout = await new Response(proc.stdout).text()
  expect(stdout + stderr).toBe("")
  expect(code).toBe(0)
}, 30_000)
