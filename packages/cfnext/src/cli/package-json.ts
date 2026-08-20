import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

export const WORKERS_TYPES_SPEC = "^4.20250816.0"

export async function ensureDevDependency(root: string, name: string, spec: string): Promise<boolean> {
  const path = join(root, "package.json")
  if (!existsSync(path)) return false
  const pkg = JSON.parse(await readFile(path, "utf8")) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  if (pkg.dependencies?.[name] || pkg.devDependencies?.[name]) return false
  pkg.devDependencies = { ...pkg.devDependencies, [name]: spec }
  await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`)
  return true
}
