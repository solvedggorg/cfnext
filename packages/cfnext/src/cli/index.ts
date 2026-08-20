#!/usr/bin/env bun

import { parseArgs } from "./args"
import { addCommand } from "./commands/add"
import { buildCommand } from "./commands/build"
import { deployCommand, devCommand } from "./commands/deploy"
import { envCommand } from "./commands/env"
import { HELP } from "./commands/help"
import { initCommand } from "./commands/init"
import { generateCommand } from "./commands/generate"
import { migrateCommand } from "./commands/migrate"
import { rmCommand } from "./commands/rm"
import { typesCommand } from "./commands/types"
import { requireBun } from "./run"

requireBun()

const args = parseArgs(process.argv)
if (args.flags.help === true || args.flags.h === true) {
  console.log(HELP)
  process.exit(0)
}

switch (args.command) {
  case "init":
    await initCommand(args)
    break
  case "add":
    await addCommand(args)
    break
  case "rm":
  case "remove":
    await rmCommand(args)
    break
  case "generate":
    await generateCommand(args)
    break
  case "migrate":
    await migrateCommand(args)
    break
  case "build":
  case "pack":
    await buildCommand()
    break
  case "deploy":
    await deployCommand(args, false)
    break
  case "preview":
    await deployCommand(args, true)
    break
  case "dev":
    await devCommand()
    break
  case "env":
    await envCommand(args)
    break
  case "types":
  case "typegen":
    await typesCommand()
    break
  default:
    console.log(HELP)
}
