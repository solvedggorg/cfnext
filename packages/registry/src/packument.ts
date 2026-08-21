import { CATALOG, findVersion, type Catalog } from "./catalog"
import { EMBEDDED_PACKAGE } from "./embedded"

export type Dist = {
  tarball: string
  shasum: string
  integrity: string
  fileCount: number
  unpackedSize: number
}

export type VersionManifest = {
  name: string
  version: string
  description: string
  license: string
  _id: string
  dist: Dist
  directories: Record<string, never>
  _hasShrinkwrap: false
  [key: string]: unknown
}

export function tarballUrl(origin: string, name: string, version: string): string {
  return `${origin.replace(/\/$/, "")}/${name}/-/${name}-${version}.tgz`
}

// Hashes are computed once at build time over the exact embedded bytes; the
// Worker runtime never re-packs or re-hashes.
export function buildVersionManifest(opts: {
  catalog: Catalog
  origin: string
  version: string
}): VersionManifest | null {
  const entry = findVersion(opts.catalog, opts.version)
  if (!entry || entry.version !== EMBEDDED_PACKAGE.version) return null
  const base = EMBEDDED_PACKAGE.manifest as Record<string, unknown>
  return {
    ...base,
    _id: `${opts.catalog.name}@${entry.version}`,
    name: opts.catalog.name,
    version: entry.version,
    dist: {
      tarball: tarballUrl(opts.origin, opts.catalog.name, entry.version),
      shasum: EMBEDDED_PACKAGE.shasum,
      integrity: EMBEDDED_PACKAGE.integrity,
      fileCount: EMBEDDED_PACKAGE.fileCount,
      unpackedSize: EMBEDDED_PACKAGE.unpackedSize,
    },
    directories: {},
    _hasShrinkwrap: false,
  } as unknown as VersionManifest
}

export function buildPackument(opts: {
  catalog: Catalog
  origin: string
  abbreviated: boolean
}) {
  const versions: Record<string, VersionManifest> = {}
  for (const item of opts.catalog.versions) {
    const manifest = buildVersionManifest({
      catalog: opts.catalog,
      origin: opts.origin,
      version: item.version,
    })
    if (manifest) versions[item.version] = manifest
  }

  const created = opts.catalog.versions[0]?.publishedAt ?? new Date().toISOString()
  const modified =
    opts.catalog.versions[opts.catalog.versions.length - 1]?.publishedAt ?? created

  if (opts.abbreviated) {
    return {
      name: opts.catalog.name,
      modified,
      "dist-tags": { ...opts.catalog.distTags },
      versions,
    }
  }

  return {
    _id: opts.catalog.name,
    name: opts.catalog.name,
    description: opts.catalog.description,
    license: opts.catalog.license,
    "dist-tags": { ...opts.catalog.distTags },
    versions,
    time: {
      created,
      modified,
      ...Object.fromEntries(opts.catalog.versions.map((item) => [item.version, item.publishedAt])),
    },
    readme: opts.catalog.readme,
  }
}
