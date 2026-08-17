import { GenerateError, generate } from "../../generate"
import { findProjectRoot } from "../find-root"
import { fail, run } from "../run"

export async function typesCommand(): Promise<void> {
  const root = findProjectRoot()
  try {
    await generate(root, { implicit: true })
  } catch (error) {
    if (error instanceof GenerateError) fail(error.message)
    throw error
  }
  await run(
    ["bun", "x", "wrangler", "types", "--env-interface", "CloudflareEnv", "cloudflare-env.d.ts"],
    root,
  )
}
