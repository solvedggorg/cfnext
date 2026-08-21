import { expect, test } from "bun:test"

import { resolvePackageSpecifier } from "../src/cli/package-spec"

test("source installs link the local package directory", () => {
  expect(
    resolvePackageSpecifier({
      compiled: false,
      version: "0.1.0",
      packageDir: "/tmp/cfnext",
    }),
  ).toBe("file:/tmp/cfnext")
})

test("compiled binaries pin a bare semver range (no doubled name)", () => {
  expect(
    resolvePackageSpecifier({
      compiled: true,
      version: "0.1.0",
      packageDir: "/tmp/cfnext",
    }),
  ).toBe("^0.1.0")
})

test("installs under node_modules publish a range, not a file path", () => {
  expect(
    resolvePackageSpecifier({
      compiled: false,
      version: "0.7.2",
      packageDir: "/home/me/app/node_modules/cfnext",
    }),
  ).toBe("^0.7.2")
})

test("CFNEXT_PACKAGE overrides both modes", () => {
  expect(
    resolvePackageSpecifier({
      compiled: true,
      version: "0.1.0",
      packageDir: "/tmp/cfnext",
      override: "file:../cfnext",
    }),
  ).toBe("file:../cfnext")
})
