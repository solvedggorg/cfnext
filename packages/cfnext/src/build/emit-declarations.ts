import { mkdir } from "node:fs/promises"
import { join } from "node:path"

export async function emitDeclarations(
  packageRoot: string,
): Promise<{ ok: boolean; output: string }> {
  await mkdir(join(packageRoot, "dist"), { recursive: true })
  const proc = Bun.spawn(["bun", "x", "tsc", "-p", "tsconfig.build.json"], {
    cwd: packageRoot,
    stdout: "pipe",
    stderr: "pipe",
  })
  const code = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  return { ok: code === 0, output: `${stdout}${stderr}` }
}

if (import.meta.main) {
  const root = join(import.meta.dir, "../..")
  const result = await emitDeclarations(root)
  if (!result.ok) {
    console.error(result.output)
    process.exit(1)
  }
  console.log("emitted declarations → dist/")
}
