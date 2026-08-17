import { generate } from "../../generate"
import { type Args, flagBool } from "../args"
import { failIfGenerate } from "../fail-generate"
import { findProjectRoot } from "../find-root"

export async function generateCommand(args: Args): Promise<void> {
  const root = findProjectRoot()
  try {
    const result = await generate(root, {
      force: flagBool(args.flags, "force"),
      check: flagBool(args.flags, "check"),
      dryRun: flagBool(args.flags, "dry-run"),
    })
    if (result.skipped) {
      console.log(result.reason ?? "skipped")
      return
    }
    if (flagBool(args.flags, "check")) {
      console.log("wrangler.jsonc is up to date")
      return
    }
    if (flagBool(args.flags, "dry-run")) {
      console.log(result.wranglerText)
      return
    }
    console.log("wrote wrangler.jsonc and cfnext.config.generated.ts")
  } catch (error) {
    failIfGenerate(error)
  }
}
