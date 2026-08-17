import { mkdir } from "node:fs/promises"
import { join } from "node:path"

import { generate } from "../../generate"
import { failIfGenerate } from "../fail-generate"
import { run } from "../run"
import { findProjectRoot } from "../find-root"

export async function buildCommand(): Promise<void> {
  const root = findProjectRoot()
  try {
    await generate(root, { implicit: true })
  } catch (error) {
    failIfGenerate(error)
  }
  await mkdir(join(root, ".cloudflare/assets"), { recursive: true })
  await run(["bun", "--bun", "next", "build"], root)
}
