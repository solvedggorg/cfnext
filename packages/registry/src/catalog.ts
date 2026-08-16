export type Channel = "previous" | "current" | "beta" | "nightly"

export type CatalogVersion = {
  version: string
  channel: Channel
  description: string
  publishedAt: string
}

export const VERSIONS: CatalogVersion[] = [
  {
    version: "0.0.1",
    channel: "previous",
    description: "cfnext previous release (static Workers packer).",
    publishedAt: "2026-07-15T00:00:00.000Z",
  },
  {
    version: "0.0.2",
    channel: "previous",
    description: "cfnext previous release (container target).",
    publishedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    version: "0.1.0",
    channel: "current",
    description:
      "Next.js adapter and CLI for Cloudflare Workers compute and Containers. Bun-first. No OpenNext.",
    publishedAt: "2026-08-16T00:00:00.000Z",
  },
  {
    version: "0.2.0-beta.1",
    channel: "beta",
    description: "cfnext beta: worker-side SSR Adapter API.",
    publishedAt: "2026-08-16T12:00:00.000Z",
  },
  {
    version: "0.2.0-nightly.20260816",
    channel: "nightly",
    description: "cfnext nightly from 2026-08-16.",
    publishedAt: "2026-08-16T18:00:00.000Z",
  },
]

export const DIST_TAGS = {
  latest: "0.1.0",
  beta: "0.2.0-beta.1",
  nightly: "0.2.0-nightly.20260816",
} as const

export const CATALOG = {
  name: "cfnext",
  description:
    "Next.js adapter and CLI for Cloudflare Workers compute and Containers. Bun-first. No OpenNext.",
  license: "MIT",
  homepage: "https://registry1.solved.gg",
  versions: VERSIONS,
  distTags: DIST_TAGS,
  readme: `# cfnext

Served from the solved.gg micro registry (\`registry1.solved.gg\`).

- \`npm install cfnext --registry https://registry1.solved.gg\` (latest / current)
- \`npm install cfnext@beta --registry https://registry1.solved.gg\`
- \`npm install cfnext@nightly --registry https://registry1.solved.gg\`
`,
}

export type Catalog = typeof CATALOG

export function findVersion(catalog: Catalog, spec: string) {
  if (spec in catalog.distTags) {
    const version = catalog.distTags[spec as keyof typeof catalog.distTags]
    return catalog.versions.find((item) => item.version === version)
  }
  return catalog.versions.find((item) => item.version === spec)
}
