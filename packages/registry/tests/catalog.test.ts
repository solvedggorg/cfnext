import { expect, test } from "bun:test"

import { CATALOG, DIST_TAGS, VERSIONS } from "../src/catalog"

test("catalog exposes exactly five cfnext versions", () => {
  expect(VERSIONS).toHaveLength(5)
  expect(VERSIONS.filter((item) => item.channel === "previous")).toHaveLength(2)
  expect(VERSIONS.filter((item) => item.channel === "current")).toHaveLength(1)
  expect(VERSIONS.filter((item) => item.channel === "beta")).toHaveLength(1)
  expect(VERSIONS.filter((item) => item.channel === "nightly")).toHaveLength(1)
})

test("dist-tags point latest/beta/nightly at the matching versions", () => {
  const current = VERSIONS.find((item) => item.channel === "current")
  const beta = VERSIONS.find((item) => item.channel === "beta")
  const nightly = VERSIONS.find((item) => item.channel === "nightly")
  expect(current?.version).toBe(DIST_TAGS.latest)
  expect(beta?.version).toBe(DIST_TAGS.beta)
  expect(nightly?.version).toBe(DIST_TAGS.nightly)
  expect(CATALOG.name).toBe("cfnext")
})
