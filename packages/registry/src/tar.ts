import { gzipSync } from "node:zlib"

import { findVersion, type Catalog } from "./catalog"

const BLOCK = 512
const MTIME = 1_723_766_400 // 2024-08-16T00:00:00Z — fixed for stable hashes

function octal(value: number, length: number): string {
  return `${value.toString(8).padStart(length - 1, "0")}\0`
}

function tarHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(BLOCK, 0)
  Buffer.from(name).copy(header, 0, 0, 100)
  header.write(octal(0o644, 8), 100, 8, "latin1")
  header.write(octal(0, 8), 108, 8, "latin1")
  header.write(octal(0, 8), 116, 8, "latin1")
  header.write(octal(size, 12), 124, 12, "latin1")
  header.write(octal(MTIME, 12), 136, 12, "latin1")
  header.write("        ", 148, 8, "latin1")
  header.write("0", 156, 1, "latin1")
  header.write("ustar\0", 257, 6, "latin1")
  header.write("00", 263, 2, "latin1")
  let sum = 0
  for (let i = 0; i < BLOCK; i++) sum += header[i] ?? 0
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "latin1")
  return header
}

function padBlock(data: Buffer): Buffer {
  const extra = (BLOCK - (data.length % BLOCK)) % BLOCK
  return extra === 0 ? data : Buffer.concat([data, Buffer.alloc(extra)])
}

export function createTarGz(files: Array<{ name: string; content: string }>): Buffer {
  const parts: Buffer[] = []
  for (const file of files) {
    const body = Buffer.from(file.content, "utf8")
    parts.push(tarHeader(file.name, body.length), padBlock(body))
  }
  parts.push(Buffer.alloc(BLOCK * 2))
  const gz = gzipSync(Buffer.concat(parts), { level: 9 })
  gz.writeUInt32LE(0, 4)
  return gz
}

export function packageFiles(catalog: Catalog, version: string): Array<{ name: string; content: string }> {
  const entry = findVersion(catalog, version)
  if (!entry) throw new Error(`unknown version ${version}`)
  const pkg = {
    name: catalog.name,
    version: entry.version,
    description: entry.description,
    license: catalog.license,
    type: "module",
    main: "index.js",
    engines: { bun: ">=1.2.0" },
  }
  return [
    { name: "package/package.json", content: `${JSON.stringify(pkg, null, 2)}\n` },
    {
      name: "package/README.md",
      content: `${catalog.readme}\n\nThis tarball is **${entry.version}** (\`${entry.channel}\`).\n`,
    },
    {
      name: "package/index.js",
      content: `export const version = ${JSON.stringify(entry.version)}\nexport const channel = ${JSON.stringify(entry.channel)}\n`,
    },
  ]
}

export function packVersionTarball(catalog: Catalog, version: string): Buffer {
  return createTarGz(packageFiles(catalog, version))
}
