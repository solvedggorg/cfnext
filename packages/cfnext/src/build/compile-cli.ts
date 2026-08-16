import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"

export async function compileCli(opts: {
  packageRoot: string
  outfile: string
}): Promise<{ ok: boolean; outfile: string; logs: string }> {
  await mkdir(dirname(opts.outfile), { recursive: true })
  const pkg = (await Bun.file(join(opts.packageRoot, "package.json")).json()) as {
    version: string
  }
  const entry = join(opts.packageRoot, "src/cli/index.ts")

  const result = await Bun.build({
    entrypoints: [entry],
    compile: {
      outfile: opts.outfile,
    },
    define: {
      CFNEXT_COMPILED: "true",
      CFNEXT_VERSION: JSON.stringify(pkg.version),
    },
  })

  if (result.success) {
    return { ok: true, outfile: opts.outfile, logs: "" }
  }

  const fallback = Bun.spawn(
    [
      "bun",
      "build",
      entry,
      "--compile",
      "--outfile",
      opts.outfile,
      "--define",
      "CFNEXT_COMPILED=true",
      "--define",
      `CFNEXT_VERSION=${JSON.stringify(pkg.version)}`,
    ],
    { cwd: opts.packageRoot, stdout: "pipe", stderr: "pipe" },
  )
  const code = await fallback.exited
  const stdout = await new Response(fallback.stdout).text()
  const stderr = await new Response(fallback.stderr).text()
  return {
    ok: code === 0,
    outfile: opts.outfile,
    logs: result.logs.map(String).concat(stdout, stderr).join("\n"),
  }
}

if (import.meta.main) {
  const root = join(import.meta.dir, "../..")
  const result = await compileCli({
    packageRoot: root,
    outfile: join(root, "dist/bin/cfnext"),
  })
  if (!result.ok) {
    console.error(result.logs)
    process.exit(1)
  }
  console.log(`compiled ${result.outfile}`)
}
