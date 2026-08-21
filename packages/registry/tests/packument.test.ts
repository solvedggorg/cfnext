import { expect, test } from "bun:test"

import { CATALOG } from "../src/catalog"
import { EMBEDDED_PACKAGE, embeddedTarball } from "../src/embedded"
import { buildPackument, buildVersionManifest } from "../src/packument"

const origin = "https://registry1.solved.gg"
const latest = EMBEDDED_PACKAGE.version

test("full packument lists the real version and npm dist-tags", () => {
  const doc = buildPackument({ catalog: CATALOG, origin, abbreviated: false })
  expect(doc._id).toBe("cfnext")
  expect(doc.name).toBe("cfnext")
  expect(Object.keys(doc.versions)).toEqual([latest])
  expect(doc["dist-tags"]).toEqual({ latest })
  const dist = doc.versions[latest]?.dist
  expect(dist?.tarball).toBe(`${origin}/cfnext/-/cfnext-${latest}.tgz`)
  expect(dist?.integrity).toBe(EMBEDDED_PACKAGE.integrity)
})

test("abbreviated packument omits readme and _id", () => {
  const doc = buildPackument({ catalog: CATALOG, origin, abbreviated: true })
  expect(doc.name).toBe("cfnext")
  expect(doc.modified).toBeString()
  expect((doc as { _id?: string })._id).toBeUndefined()
  expect((doc as { readme?: string }).readme).toBeUndefined()
  expect(Object.keys(doc.versions)).toHaveLength(1)
})

test("manifest carries the real package metadata installers need", () => {
  const manifest = buildVersionManifest({ catalog: CATALOG, origin, version: latest })
  expect(manifest?.name).toBe("cfnext")
  expect(manifest?.version).toBe(latest)
  const raw = manifest as unknown as Record<string, Record<string, string>>
  expect(raw.engines?.bun).toBe(">=1.2.0")
  expect(raw.bin?.cfnext).toBe("./bin/cfnext")
  expect(raw.peerDependencies?.next).toContain("16.2")
  expect(Object.keys(raw.exports ?? {})).toContain("./server")
})

test("advertised hashes match the exact served tarball bytes", async () => {
  const bytes = embeddedTarball()
  const manifest = buildVersionManifest({ catalog: CATALOG, origin, version: latest })
  expect(manifest?.dist.shasum).toBe(new Bun.CryptoHasher("sha1").update(bytes).digest("hex"))
  expect(manifest?.dist.integrity).toBe(
    `sha512-${new Bun.CryptoHasher("sha512").update(bytes).digest("base64")}`,
  )
})

test("unknown versions return null manifests", () => {
  expect(buildVersionManifest({ catalog: CATALOG, origin, version: "9.9.9" })).toBeNull()
})
