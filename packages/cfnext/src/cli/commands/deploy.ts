import { generate } from "../../generate"
import { type Args, flagBool } from "../args"
import { failIfGenerate } from "../fail-generate"
import { run } from "../run"
import { findProjectRoot } from "../find-root"
import { buildCommand } from "./build"

async function implicitGenerate(root: string): Promise<void> {
  try {
    await generate(root, { implicit: true })
  } catch (error) {
    failIfGenerate(error)
  }
}

export async function deployCommand(args: Args, preview: boolean): Promise<void> {
  const root = findProjectRoot()
  // Production deploy does not call buildCommand(); wrangler runs build.command.
  await implicitGenerate(root)
  if (preview || flagBool(args.flags, "preview")) {
    await buildCommand()
    await run(["bun", "x", "wrangler", "versions", "upload"], root)
    return
  }
  await run(["bun", "x", "wrangler", "deploy"], root)
}

export async function devCommand(): Promise<void> {
  await buildCommand()
  await run(["bun", "x", "wrangler", "dev"], findProjectRoot())
}
