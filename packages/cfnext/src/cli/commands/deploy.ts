import { GenerateError, generate } from "../../generate"
import { type Args, flagBool } from "../args"
import { fail, run } from "../run"
import { findProjectRoot } from "../find-root"
import { buildCommand } from "./build"

async function implicitGenerate(root: string): Promise<void> {
  try {
    await generate(root, { implicit: true })
  } catch (error) {
    if (error instanceof GenerateError) fail(error.message)
    throw error
  }
}

export async function deployCommand(args: Args, preview: boolean): Promise<void> {
  const root = findProjectRoot()
  await implicitGenerate(root)
  if (preview || flagBool(args.flags, "preview")) {
    await buildCommand()
    await run(["bun", "x", "wrangler", "versions", "upload"], root)
    return
  }
  await run(["bun", "x", "wrangler", "deploy"], root)
}

export async function devCommand(): Promise<void> {
  const root = findProjectRoot()
  await implicitGenerate(root)
  await buildCommand()
  await run(["bun", "x", "wrangler", "dev"], root)
}
