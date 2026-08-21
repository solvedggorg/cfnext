import { EMBEDDED } from "./generated/cfnext-package"

export type EmbeddedPackage = {
  version: string
  description: string
  publishedAt: string
  readme: string
  manifest: Record<string, unknown> & { name: string }
  tarballBase64: string
  shasum: string
  integrity: string
  fileCount: number
  unpackedSize: number
}

export const EMBEDDED_PACKAGE = EMBEDDED as EmbeddedPackage

export function embeddedTarball(): Buffer {
  return Buffer.from(EMBEDDED_PACKAGE.tarballBase64, "base64")
}
