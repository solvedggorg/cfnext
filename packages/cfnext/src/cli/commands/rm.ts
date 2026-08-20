import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"

import { catalogKind } from "../../catalog"
import { findCfnextJson } from "../../config"
import { generate, splitGenerated } from "../../generate"
import { parseJsonc, stringifyJsonc } from "../../jsonc"
import type { CfnextJson } from "../../schema"
import { wranglerPath } from "../../wrangler"
import { type Args, flagString } from "../args"
import { failIfGenerate } from "../fail-generate"
import { findProjectRoot } from "../find-root"
import { removeDurableObject } from "../p1-mutate"
import { fail } from "../run"

export async function rmCommand(args: Args): Promise<void> {
  const kind = args.positionals[0]
  const catalog = kind ? catalogKind(kind) : undefined
  if (!kind || catalog?.kind !== "do") {
    fail("Usage: cfnext rm do --class ClassName")
  }
  const className = flagString(args.flags, "class")
  if (!className) fail("Usage: cfnext rm do --class ClassName")

  const root = findProjectRoot()
  const dest = findCfnextJson(root)
  if (!dest) fail("cfnext.json is required. Run `cfnext migrate wrangler` first.")
  const wranglerFile = wranglerPath(root)
  const wranglerText = existsSync(wranglerFile) ? await readFile(wranglerFile, "utf8") : ""
  if (wranglerText && !splitGenerated(wranglerText).generated) {
    fail("wrangler.jsonc is not @generated. Run `cfnext migrate wrangler` first.")
  }

  const json = parseJsonc<CfnextJson>(await readFile(dest, "utf8"))
  let next: CfnextJson
  try {
    next = removeDurableObject(json, className)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
  await writeFile(dest, stringifyJsonc(next))
  console.log(`removed durable object ${className} → ${dest}`)
  try {
    await generate(root)
  } catch (error) {
    failIfGenerate(error)
  }
}
