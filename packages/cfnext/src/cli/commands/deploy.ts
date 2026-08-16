import { loadConfig } from "../../config"
import { ensureWrangler } from "../../wrangler"
import { type Args, flagBool } from "../args"
import { run } from "../run"
import { findProjectRoot } from "../find-root"
import { buildCommand } from "./build"

export async function deployCommand(args: Args, preview: boolean): Promise<void> {
  const root = findProjectRoot()
  const config = await loadConfig(root)
  await ensureWrangler(root, config)
  if (preview || flagBool(args.flags, "preview")) {
    await buildCommand()
    await run(["bun", "x", "wrangler", "versions", "upload"], root)
    return
  }
  await run(["bun", "x", "wrangler", "deploy"], root)
}

export async function devCommand(): Promise<void> {
  const root = findProjectRoot()
  const config = await loadConfig(root)
  await ensureWrangler(root, config)
  await buildCommand()
  await run(["bun", "x", "wrangler", "dev"], root)
}
