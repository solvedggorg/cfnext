import { mkdir, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"

import {
  applyBinding,
  BINDING_KINDS,
  provisionCommand,
  type BindingKind,
} from "../../bindings"
import { loadConfig } from "../../config"
import { ensureWrangler, mergeWrangler } from "../../wrangler"
import { type Args, flagBool, flagString } from "../args"
import { fail, run } from "../run"
import { findProjectRoot } from "../find-root"

export async function addCommand(args: Args): Promise<void> {
  const kind = args.positionals[0]
  if (!kind || !BINDING_KINDS.includes(kind as BindingKind)) {
    fail(`Usage: cfnext add ${BINDING_KINDS.join("|")}`)
  }
  const root = findProjectRoot()
  const config = await loadConfig(root)
  await ensureWrangler(root, config)

  let applied = {
    binding: "",
    resourceName: "",
  }
  await mergeWrangler(root, (current) => {
    const next = applyBinding(current, {
      kind: kind as BindingKind,
      binding: flagString(args.flags, "binding"),
      resourceName: flagString(args.flags, "name"),
    })
    applied = { binding: next.binding, resourceName: next.resourceName }
    return next.wrangler
  })

  if (kind === "d1") {
    const migrations = join(root, "migrations")
    if (!existsSync(migrations)) {
      await mkdir(migrations, { recursive: true })
      await writeFile(
        join(migrations, "0001_init.sql"),
        "-- Apply with: bun x wrangler d1 migrations apply DB --local\n",
      )
    }
  }

  const provision = provisionCommand(kind as BindingKind, applied.resourceName)
  console.log(`added ${kind} binding ${applied.binding} (${applied.resourceName})`)

  if (flagBool(args.flags, "provision") && provision) {
    await run(provision.split(" "), root)
    return
  }

  if (provision) {
    console.log(`Provision with:\n  ${provision}`)
    if (kind === "d1" || kind === "kv" || kind === "hyperdrive") {
      console.log("Then paste the returned id into wrangler.jsonc.")
    }
  }
}
