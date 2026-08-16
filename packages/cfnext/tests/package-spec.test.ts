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

test("compiled binaries depend on the published package name", () => {
  expect(
    resolvePackageSpecifier({
      compiled: true,
      version: "0.1.0",
      packageDir: "/tmp/cfnext",
    }),
  ).toBe("cfnext@0.1.0")
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
