import { createHash } from "node:crypto"

import { findVersion, type Catalog } from "./catalog"
import { packVersionTarball } from "./tar"

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
}

export function hashTarball(tarball: Buffer): { shasum: string; integrity: string } {
  return {
    shasum: createHash("sha1").update(tarball).digest("hex"),
    integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
  }
}

export function tarballUrl(origin: string, name: string, version: string): string {
  return `${origin.replace(/\/$/, "")}/${name}/-/${name}-${version}.tgz`
}

export function buildVersionManifest(opts: {
  catalog: Catalog
  origin: string
  version: string
}): VersionManifest | null {
  const entry = findVersion(opts.catalog, opts.version)
  if (!entry) return null
  const tarball = packVersionTarball(opts.catalog, entry.version)
  const files = [
    { content: JSON.stringify({ name: opts.catalog.name, version: entry.version }) },
    { content: opts.catalog.readme },
    { content: "" },
  ]
  return {
    name: opts.catalog.name,
    version: entry.version,
    description: entry.description,
    license: opts.catalog.license,
    _id: `${opts.catalog.name}@${entry.version}`,
    directories: {},
    _hasShrinkwrap: false,
    dist: {
      tarball: tarballUrl(opts.origin, opts.catalog.name, entry.version),
      ...hashTarball(tarball),
      fileCount: 3,
      unpackedSize: files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0),
    },
  }
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
