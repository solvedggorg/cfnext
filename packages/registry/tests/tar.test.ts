import { expect, test } from "bun:test"
import { gunzipSync } from "node:zlib"

import { createTarGz } from "../src/tar"

test("tarball is gzipped ustar with package/package.json", () => {
  const gz = createTarGz([
    { name: "package/package.json", content: `{"name":"cfnext"}\n` },
    { name: "package/src/index.ts", content: "export {}\n" },
  ])
  const raw = gunzipSync(gz)
  const text = raw.toString("utf8")
  expect(text).toContain("package/package.json")
  expect(text).toContain(`"name":"cfnext"`)
  expect(text).toContain("package/src/index.ts")
})
