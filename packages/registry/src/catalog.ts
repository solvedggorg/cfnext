import { EMBEDDED_PACKAGE } from "./embedded"

export type Channel = "current" | "previous" | "beta" | "nightly"

export type CatalogVersion = {
  version: string
  channel: Channel
  description: string
  publishedAt: string
}

// One real version: the package embedded at build time by
// src/build/embed-package.ts. Additional channels return when there are real
// builds to serve; stub versions were removed so every install works.
export const VERSIONS: CatalogVersion[] = [
  {
    version: EMBEDDED_PACKAGE.version,
    channel: "current",
    description: EMBEDDED_PACKAGE.description,
    publishedAt: EMBEDDED_PACKAGE.publishedAt,
  },
]

export const DIST_TAGS = {
  latest: EMBEDDED_PACKAGE.version,
} as const

export const CATALOG = {
  name: EMBEDDED_PACKAGE.manifest.name,
  description: EMBEDDED_PACKAGE.description,
  license: String(EMBEDDED_PACKAGE.manifest.license ?? "MIT"),
  homepage: "https://registry1.solved.gg",
  versions: VERSIONS,
  distTags: DIST_TAGS,
  readme: EMBEDDED_PACKAGE.readme,
}

export type Catalog = typeof CATALOG

export function findVersion(catalog: Catalog, spec: string) {
  if (spec in catalog.distTags) {
    const version = catalog.distTags[spec as keyof typeof catalog.distTags]
    return catalog.versions.find((item) => item.version === version)
  }
  return catalog.versions.find((item) => item.version === spec)
}
