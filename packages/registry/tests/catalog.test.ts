import { expect, test } from "bun:test"

import { CATALOG, DIST_TAGS, VERSIONS } from "../src/catalog"
import { EMBEDDED_PACKAGE } from "../src/embedded"

test("catalog serves exactly the embedded real version", () => {
  expect(VERSIONS).toHaveLength(1)
  expect(VERSIONS[0]?.version).toBe(EMBEDDED_PACKAGE.version)
  expect(VERSIONS[0]?.channel).toBe("current")
  expect(DIST_TAGS.latest).toBe(EMBEDDED_PACKAGE.version)
  expect(CATALOG.name).toBe("cfnext")
})

test("embedded payload is populated", () => {
  expect(EMBEDDED_PACKAGE.tarballBase64.length).toBeGreaterThan(10_000)
  expect(EMBEDDED_PACKAGE.fileCount).toBeGreaterThan(50)
  expect(EMBEDDED_PACKAGE.shasum).toMatch(/^[0-9a-f]{40}$/)
  expect(EMBEDDED_PACKAGE.integrity).toMatch(/^sha512-/)
  expect(EMBEDDED_PACKAGE.manifest.name).toBe("cfnext")
})
