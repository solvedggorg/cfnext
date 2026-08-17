import { migrateWrangler } from "../../generate/migrate"
import type { Args } from "../args"
import { flagBool } from "../args"
import { failIfGenerate } from "../fail-generate"
import { fail } from "../run"
import { findProjectRoot } from "../find-root"

export async function migrateCommand(args: Args): Promise<void> {
  const what = args.positionals[0] ?? "wrangler"
  if (what !== "wrangler") fail("Usage: cfnext migrate wrangler [--force]")
  const root = findProjectRoot()
  try {
    await migrateWrangler(root, { force: flagBool(args.flags, "force") })
    console.log("wrote cfnext.json and regenerated wrangler.jsonc (backup: wrangler.jsonc.bak)")
  } catch (error) {
    failIfGenerate(error)
  }
}
