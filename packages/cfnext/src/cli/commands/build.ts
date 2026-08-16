import { mkdir } from "node:fs/promises"
import { join } from "node:path"

import { loadConfig } from "../../config"
import { ensureWrangler } from "../../wrangler"
import { run } from "../run"
import { findProjectRoot } from "../find-root"

export async function buildCommand(): Promise<void> {
  const root = findProjectRoot()
  const config = await loadConfig(root)
  await ensureWrangler(root, config)
  await mkdir(join(root, ".cloudflare/assets"), { recursive: true })
  await run(["bun", "--bun", "next", "build"], root)
}
