import { expect, test } from "bun:test"
import { mkdtemp, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildSsrManifest, packSsrHandlers } from "../src/ssr/pack"
import { normalizeConfig } from "../src/config"

test("buildSsrManifest lists node and edge handlers with ids", () => {
  const manifest = buildSsrManifest({
    buildId: "abc",
    nextVersion: "16.2.6",
    config: normalizeConfig({ name: "demo", target: "ssr" }),
    outputs: {
      staticFiles: [],
      prerenders: [{ pathname: "/about" }],
      appPages: [
        { pathname: "/about", runtime: "nodejs", filePath: "/tmp/about.js", id: "about" },
        { pathname: "/live", runtime: "nodejs", filePath: "/tmp/live.js", id: "live" },
      ],
      appRoutes: [
        { pathname: "/api/health", runtime: "edge", filePath: "/tmp/health.js", id: "health" },
      ],
      pages: [],
      pagesApi: [],
    },
    routing: { dynamicRoutes: [{ source: "/blog/[slug]" }] },
  })

  expect(manifest.target).toBe("ssr")
  expect(manifest.nodejsCompat).toBe(true)
  expect(manifest.handlers.map((item) => item.pathname).sort()).toEqual([
    "/about",
    "/api/health",
    "/live",
  ])
  expect(manifest.prerenders).toEqual(["/about"])
  expect(manifest.handlers.find((item) => item.pathname === "/api/health")?.runtime).toBe("edge")
})

test("packSsrHandlers copies entry files and writes the manifest", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-ssr-pack-"))
  const src = join(dir, "src-handler.js")
  await writeFile(src, "export function handler() {}")
  await mkdir(join(dir, "project"), { recursive: true })

  const result = await packSsrHandlers({
    projectDir: join(dir, "project"),
    outputs: {
      staticFiles: [],
      prerenders: [],
      appPages: [],
      appRoutes: [
        {
          pathname: "/api/health",
          runtime: "nodejs",
          filePath: src,
          id: "health",
        },
      ],
      pages: [],
      pagesApi: [],
    },
    routing: { dynamicRoutes: [] },
    buildId: "b1",
    nextVersion: "16.2.6",
    config: normalizeConfig({ name: "demo", target: "ssr" }),
  })

  expect(result.manifest.handlers).toHaveLength(1)
  const copied = Bun.file(join(dir, "project", ".cloudflare", "server", result.manifest.handlers[0]!.module))
  expect(await copied.exists()).toBe(true)
  expect(await copied.text()).toContain("export function handler")
})
