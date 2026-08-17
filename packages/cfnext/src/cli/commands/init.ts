import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve } from "node:path"

import { BINDING_KINDS, type BindingKind } from "../../bindings"
import { inferName, type DeployTarget } from "../../config"
import { renderFiles, type InitOptions } from "../../templates/app"
import { type Args, flagBool, flagString } from "../args"
import { packageSpecifier } from "../package-spec"
import { fail, run } from "../run"

function parseBindings(raw: string | undefined): BindingKind[] {
  if (!raw) return []
  const kinds = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  const unknown = kinds.filter((item) => !BINDING_KINDS.includes(item as BindingKind))
  if (unknown.length > 0) {
    fail(`Unknown binding(s): ${unknown.join(", ")}. Use ${BINDING_KINDS.join(", ")}`)
  }
  return kinds as BindingKind[]
}

function parseTarget(raw: string | undefined): DeployTarget {
  if (!raw || raw === "workers") return "workers"
  if (raw === "ssr") return "ssr"
  if (raw === "container") return "container"
  fail(`Unknown --target ${raw}. Use workers, ssr, or container.`)
}

export async function initCommand(args: Args): Promise<void> {
  const destArg = args.positionals[0] ?? "."
  const dest = isAbsolute(destArg) ? destArg : resolve(process.cwd(), destArg)
  const existing = flagBool(args.flags, "existing")
  const allowNonEmpty = flagBool(args.flags, "yes", "y") || existing
  const skipInstall = flagBool(args.flags, "skip-install")
  const name = flagString(args.flags, "name") ?? inferName(dest)
  const target = parseTarget(flagString(args.flags, "target"))
  const bindings = parseBindings(flagString(args.flags, "bindings"))
  const auth = flagString(args.flags, "auth")
  if (auth && auth !== "clerk") fail(`Unknown --auth ${auth}. Use clerk or omit.`)

  if (existsSync(dest)) {
    const listing = Array.from(new Bun.Glob("*").scanSync({ cwd: dest })).filter(
      (item) => item !== "." && item !== "..",
    )
    if (listing.length > 0 && !allowNonEmpty) {
      fail(`${dest} is not empty. Pass --yes to write into it, or --existing to attach.`)
    }
  } else {
    await mkdir(dest, { recursive: true })
  }

  const opts: InitOptions = {
    dirName: inferName(dest),
    name,
    target,
    bindings,
    auth: auth === "clerk" ? "clerk" : undefined,
    packageSpecifier: packageSpecifier(),
  }

  if (existing) {
    await attachExisting(dest, opts)
  } else {
    const files = renderFiles(opts)
    for (const [rel, contents] of Object.entries(files)) {
      const path = join(dest, rel)
      await mkdir(dirname(path), { recursive: true })
      if (existsSync(path) && !allowNonEmpty) continue
      await writeFile(path, contents)
    }
    console.log(`wrote ${Object.keys(files).length} files → ${dest}`)
  }

  if (!skipInstall) {
    await run(["bun", "install"], dest)
  }

  console.log(`
Next:
  cd ${destArg}
  bun run dev
  bun run deploy

Target: ${target}
Add bindings later with: bunx cfnext add d1
`)
}

async function attachExisting(dest: string, opts: InitOptions): Promise<void> {
  const files = renderFiles(opts)
  const skip = new Set(["app/layout.tsx", "app/page.tsx", "app/globals.css", "package.json"])
  for (const [rel, contents] of Object.entries(files)) {
    if (skip.has(rel) && existsSync(join(dest, rel))) continue
    const path = join(dest, rel)
    if (existsSync(path) && (rel === "next.config.ts" || rel === "tsconfig.json")) {
      continue
    }
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, contents)
  }
  await patchPackageJson(dest)
  await noteNextConfig(dest)
  console.log(`attached cfnext to ${dest}`)
}

async function patchPackageJson(dest: string): Promise<void> {
  const path = join(dest, "package.json")
  if (!existsSync(path)) return
  const pkg = JSON.parse(await readFile(path, "utf8")) as {
    scripts?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  pkg.scripts = {
    ...pkg.scripts,
    deploy: pkg.scripts?.deploy ?? "cfnext deploy",
    preview: pkg.scripts?.preview ?? "cfnext preview",
    "cf:dev": "cfnext dev",
    "cf:env": "cfnext env",
    "cf:types": "cfnext types",
    "cf:generate": "cfnext generate",
  }
  pkg.devDependencies = {
    ...pkg.devDependencies,
    cfnext: packageSpecifier(),
    wrangler: pkg.devDependencies?.wrangler ?? "^4.123.0",
  }
  await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`)
}

async function noteNextConfig(dest: string): Promise<void> {
  const path = join(dest, "next.config.ts")
  if (!existsSync(path)) return
  const text = await readFile(path, "utf8")
  if (text.includes("withCfnext") || text.includes("adapterPath")) return
  console.log(`Update next.config.ts:

  import { withCfnext } from "cfnext"
  export default withCfnext(nextConfig)
`)
}
