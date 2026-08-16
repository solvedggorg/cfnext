import { expect, test } from "bun:test"
import { createHash } from "node:crypto"

import { CATALOG } from "../src/catalog"
import { buildPackument, buildVersionManifest } from "../src/packument"
import { packVersionTarball } from "../src/tar"

const origin = "https://registry1.solved.gg"

test("full packument lists all five versions and npm dist-tags", () => {
  const doc = buildPackument({ catalog: CATALOG, origin, abbreviated: false })
  expect(doc._id).toBe("cfnext")
  expect(doc.name).toBe("cfnext")
  expect(Object.keys(doc.versions).sort()).toEqual(
    CATALOG.versions.map((item) => item.version).sort(),
  )
  expect(doc["dist-tags"]).toEqual({
    latest: CATALOG.distTags.latest,
    beta: CATALOG.distTags.beta,
    nightly: CATALOG.distTags.nightly,
  })
  expect(doc.versions[CATALOG.distTags.latest]?.dist.tarball).toBe(
    `${origin}/cfnext/-/cfnext-${CATALOG.distTags.latest}.tgz`,
  )
})

test("abbreviated packument omits readme and _id", () => {
  const doc = buildPackument({ catalog: CATALOG, origin, abbreviated: true })
  expect(doc.name).toBe("cfnext")
  expect(doc.modified).toBeString()
  expect((doc as { _id?: string })._id).toBeUndefined()
  expect((doc as { readme?: string }).readme).toBeUndefined()
  expect(Object.keys(doc.versions)).toHaveLength(5)
})

test("version manifest dist hashes match the packed tarball", async () => {
  const version = CATALOG.distTags.latest
  const tarball = packVersionTarball(CATALOG, version)
  const manifest = buildVersionManifest({ catalog: CATALOG, origin, version })
  expect(manifest?.name).toBe("cfnext")
  expect(manifest?.version).toBe(version)
  expect(manifest?.dist.shasum).toBe(createHash("sha1").update(tarball).digest("hex"))
  expect(manifest?.dist.integrity).toBe(
    `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
  )
})
