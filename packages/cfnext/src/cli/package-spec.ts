import { readFileSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

export type PackageSpecifierInput = {
  compiled: boolean
  version: string
  packageDir: string
  override?: string
}

export function resolvePackageSpecifier(input: PackageSpecifierInput): string {
  if (input.override) return input.override
  // Dependency VALUE: bare range. "cfnext@x" doubles the name, and absolute
  // file: paths leak the CLI's install location into user projects — so both
  // compiled binaries and anything running out of node_modules publish a
  // range. file: is only correct inside the cfnext monorepo checkout.
  if (input.compiled || input.packageDir.includes("/node_modules/")) {
    return `^${input.version}`
  }
  return `file:${input.packageDir}`
}

export function isCompiledBinary(): boolean {
  return typeof CFNEXT_COMPILED !== "undefined" && CFNEXT_COMPILED === true
}

export function packageDirFromMeta(metaUrl: string): string {
  return dirname(fileURLToPath(new URL("../../package.json", metaUrl)))
}

export function readPackageVersion(metaUrl: string): string {
  if (typeof CFNEXT_VERSION !== "undefined" && CFNEXT_VERSION.length > 0) {
    return CFNEXT_VERSION
  }
  try {
    const path = fileURLToPath(new URL("../../package.json", metaUrl))
    const pkg = JSON.parse(readFileSync(path, "utf8")) as { version?: string }
    return pkg.version ?? "0.1.0"
  } catch {
    return "0.1.0"
  }
}

export function packageSpecifier(metaUrl = import.meta.url): string {
  return resolvePackageSpecifier({
    compiled: isCompiledBinary(),
    version: readPackageVersion(metaUrl),
    packageDir: packageDirFromMeta(metaUrl),
    override: process.env.CFNEXT_PACKAGE,
  })
}
