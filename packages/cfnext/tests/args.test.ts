import { expect, test } from "bun:test"

import { flagBool, flagString, parseArgs } from "../src/cli/args"

test("parses command, positionals, and flags", () => {
  const args = parseArgs([
    "bun",
    "cfnext",
    "init",
    "my-app",
    "--target",
    "container",
    "--yes",
    "--bindings",
    "d1,r2",
  ])
  expect(args.command).toBe("init")
  expect(args.positionals).toEqual(["my-app"])
  expect(flagString(args.flags, "target")).toBe("container")
  expect(flagString(args.flags, "bindings")).toBe("d1,r2")
  expect(flagBool(args.flags, "yes", "y")).toBe(true)
})

test("treats --help as a boolean even when a positional follows", () => {
  const args = parseArgs(["bun", "cfnext", "init", "--help"])
  expect(flagBool(args.flags, "help", "h")).toBe(true)
})

test("treats --inbound as a boolean", () => {
  const args = parseArgs(["bun", "cfnext", "add", "email", "--inbound", "--addresses", "a@b.c"])
  expect(flagBool(args.flags, "inbound")).toBe(true)
  expect(flagString(args.flags, "addresses")).toBe("a@b.c")
})
