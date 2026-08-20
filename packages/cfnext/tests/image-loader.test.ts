import { expect, test } from "bun:test"

import { nextImagesConfig } from "../src/adapter"
import { defaultConfig } from "../src/config"
import { buildCfnextImageUrl, srcAllowed } from "../src/image-loader"
import type { LoadedProject } from "../src/config"

const cdn = {
  kind: "cdn-cgi" as const,
  zoneOrigin: "https://example.com",
  remotePatterns: [{ protocol: "https", hostname: "images.acme.com" }],
}

test("cdn-cgi same-origin path is rewritten", () => {
  expect(buildCfnextImageUrl({ src: "/hero.png", width: 80, quality: 70 }, cdn)).toBe(
    "https://example.com/cdn-cgi/image/width=80,quality=70,format=auto/hero.png",
  )
})

test("cdn-cgi rejects unmatched absolute URLs", () => {
  expect(buildCfnextImageUrl({ src: "https://evil.example/x.png", width: 10 }, cdn)).toBe(
    "https://evil.example/x.png",
  )
})

test("cdn-cgi allows remotePatterns hosts", () => {
  expect(
    buildCfnextImageUrl({ src: "https://images.acme.com/a.jpg", width: 40, quality: 50 }, cdn),
  ).toBe(
    "https://example.com/cdn-cgi/image/width=40,quality=50,format=auto/https://images.acme.com/a.jpg",
  )
})

test("imagedelivery uses accountHash and image id", () => {
  expect(
    buildCfnextImageUrl(
      { src: "abc123", width: 200, quality: 80 },
      { kind: "imagedelivery", accountHash: "acct" },
    ),
  ).toBe("https://imagedelivery.net/acct/abc123/w=200,q=80")
})

test("srcAllowed treats slash-paths as same-origin", () => {
  expect(srcAllowed("/x.png", cdn)).toBe(true)
  expect(srcAllowed("relative.png", cdn)).toBe(false)
})

test("images.unoptimized wins over an enabled loader", () => {
  const project: LoadedProject = {
    dir: ".",
    json: {
      images: { unoptimized: true },
      media: { images: { loader: { enabled: true, kind: "cdn-cgi", zoneOrigin: "https://example.com" } } },
    },
    jsonPath: "cfnext.json",
    jsonRaw: null,
    hooksPath: null,
    hooksHasClerkShells: false,
    config: { ...defaultConfig("demo"), images: { unoptimized: true } },
  }
  expect(nextImagesConfig({}, project)).toEqual({ unoptimized: true })
})

test("loader is installed when unoptimized is false", () => {
  const project: LoadedProject = {
    dir: ".",
    json: {
      images: { unoptimized: false },
      media: {
        images: {
          loader: {
            enabled: true,
            kind: "cdn-cgi",
            zoneOrigin: "https://example.com",
            remotePatterns: [{ protocol: "https", hostname: "images.acme.com" }],
          },
        },
      },
    },
    jsonPath: "cfnext.json",
    jsonRaw: null,
    hooksPath: null,
    hooksHasClerkShells: false,
    config: { ...defaultConfig("demo"), images: { unoptimized: false } },
  }
  expect(nextImagesConfig({}, project)).toEqual({
    loader: "custom",
    loaderFile: ".cloudflare/generated/image-loader.ts",
    remotePatterns: [{ protocol: "https", hostname: "images.acme.com" }],
  })
})
