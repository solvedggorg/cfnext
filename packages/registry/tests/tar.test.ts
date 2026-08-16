import { expect, test } from "bun:test"
import { gunzipSync } from "node:zlib"

import { CATALOG } from "../src/catalog"
import { packVersionTarball } from "../src/tar"

test("tarball is gzipped ustar with package/package.json", () => {
  const gz = packVersionTarball(CATALOG, CATALOG.distTags.latest)
  const raw = gunzipSync(gz)
  const text = raw.toString("utf8")
  expect(text).toContain("package/package.json")
  expect(text).toContain(`"name": "cfnext"`)
  expect(text).toContain(`"version": "${CATALOG.distTags.latest}"`)
})
