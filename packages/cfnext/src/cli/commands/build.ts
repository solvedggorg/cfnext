import { mkdir } from "node:fs/promises"
import { join } from "node:path"

import { GenerateError, generate } from "../../generate"
import { fail, run } from "../run"
import { findProjectRoot } from "../find-root"

export async function buildCommand(): Promise<void> {
  const root = findProjectRoot()
  try {
    await generate(root, { implicit: true })
  } catch (error) {
    if (error instanceof GenerateError) fail(error.message)
    throw error
  }
  await mkdir(join(root, ".cloudflare/assets"), { recursive: true })
  await run(["bun", "--bun", "next", "build"], root)
}
