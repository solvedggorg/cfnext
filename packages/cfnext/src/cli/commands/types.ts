import { findProjectRoot } from "../find-root"
import { run } from "../run"

export async function typesCommand(): Promise<void> {
  const root = findProjectRoot()
  await run(
    ["bun", "x", "wrangler", "types", "--env-interface", "CloudflareEnv", "cloudflare-env.d.ts"],
    root,
  )
}
