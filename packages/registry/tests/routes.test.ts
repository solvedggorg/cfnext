import { expect, test } from "bun:test"

import { parseRegistryPath } from "../src/routes"

test("parses npm registry paths for cfnext", () => {
  expect(parseRegistryPath("/")).toEqual({ kind: "root" })
  expect(parseRegistryPath("/-/ping")).toEqual({ kind: "ping" })
  expect(parseRegistryPath("/cfnext")).toEqual({ kind: "packument", name: "cfnext" })
  expect(parseRegistryPath("/cfnext/0.1.0")).toEqual({
    kind: "manifest",
    name: "cfnext",
    spec: "0.1.0",
  })
  expect(parseRegistryPath("/cfnext/-/cfnext-0.1.0.tgz")).toEqual({
    kind: "tarball",
    name: "cfnext",
    version: "0.1.0",
  })
  expect(parseRegistryPath("/-/package/cfnext/dist-tags")).toEqual({
    kind: "dist-tags",
    name: "cfnext",
  })
})

test("rejects unknown packages and junk", () => {
  expect(parseRegistryPath("/lodash")).toEqual({ kind: "unknown-package", name: "lodash" })
  expect(parseRegistryPath("/not-a-route")).toEqual({ kind: "unknown-package", name: "not-a-route" })
})
