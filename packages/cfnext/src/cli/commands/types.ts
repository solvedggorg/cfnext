import { existsSync } from "node:fs"
import { unlink } from "node:fs/promises"
import { join } from "node:path"

import { generate } from "../../generate"
import { failIfGenerate } from "../fail-generate"
import { findProjectRoot } from "../find-root"
import { run } from "../run"

export async function typesCommand(): Promise<void> {
  const root = findProjectRoot()
  try {
    await generate(root, { implicit: true })
  } catch (error) {
    failIfGenerate(error)
  }
  const dest = join(root, "cloudflare-env.d.ts")
  if (existsSync(dest)) await unlink(dest)
  await run(
    ["bun", "x", "wrangler", "types", "--env-interface", "CloudflareEnv", "cloudflare-env.d.ts"],
    root,
  )
}
