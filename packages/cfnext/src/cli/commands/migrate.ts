import { GenerateError } from "../../generate"
import { migrateWrangler } from "../../generate/migrate"
import type { Args } from "../args"
import { fail } from "../run"
import { findProjectRoot } from "../find-root"

export async function migrateCommand(args: Args): Promise<void> {
  const what = args.positionals[0] ?? "wrangler"
  if (what !== "wrangler") fail("Usage: cfnext migrate wrangler")
  const root = findProjectRoot()
  try {
    await migrateWrangler(root)
    console.log("wrote cfnext.json and regenerated wrangler.jsonc (backup: wrangler.jsonc.bak)")
  } catch (error) {
    if (error instanceof GenerateError) fail(error.message)
    throw error
  }
}
