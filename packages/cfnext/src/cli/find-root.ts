import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

export function findProjectRoot(start = process.cwd()): string {
  let dir = start
  while (true) {
    if (
      existsSync(join(dir, "cfnext.json")) ||
      existsSync(join(dir, "cfnext.jsonc")) ||
      existsSync(join(dir, "cfnext.hooks.ts")) ||
      existsSync(join(dir, "cfnext.config.ts")) ||
      existsSync(join(dir, "wrangler.jsonc"))
    ) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) return start
    dir = parent
  }
}
