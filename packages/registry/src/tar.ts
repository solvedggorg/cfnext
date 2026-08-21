import { gzipSync } from "node:zlib"

const BLOCK = 512
const MTIME = 1_723_766_400 // fixed for stable hashes

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

// Build-time only: the Worker serves precomputed bytes from src/embedded.ts,
// so node:zlib never loads at runtime.
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
