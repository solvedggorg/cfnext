import { copyFile, mkdir, writeFile, access } from "node:fs/promises"
import { dirname, join, relative } from "node:path"

import { PROTECTED_PREFIXES } from "./protect.mjs"

const OUT_DIR = ".cloudflare"

function assetRel(pathname) {
  const clean = pathname
    .split("?")[0]
    .replace(/\/\[\[\.\.\.[^\]]+\]\]/g, "")
    .replace(/\/\[\.\.\.[^\]]+\]/g, "")
    .replace(/\/\[[^\]]+\]/g, "") || "/"
  if (clean === "/") return "index.html"
  const trimmed = clean.replace(/^\//, "").replace(/\/$/, "")
  if (clean.endsWith("/")) return `${trimmed}/index.html`
  if (/\.[a-zA-Z0-9]+$/.test(trimmed)) return trimmed
  return `${trimmed}/index.html`
}

async function copyTo(src, dest) {
  await mkdir(dirname(dest), { recursive: true })
  await copyFile(src, dest)
}

/** @type {import('next').NextAdapter} */
const adapter = {
  name: "solved-cf",

  modifyConfig(config) {
    return {
      ...config,
      images: {
        ...config.images,
        unoptimized: true,
      },
    }
  },

  async onBuildComplete({ outputs, projectDir, distDir, buildId, nextVersion, routing }) {
    const root = join(projectDir, OUT_DIR)
    const assetsDir = join(root, "assets")
    await mkdir(assetsDir, { recursive: true })

    /** @type {{ pathname: string; file: string; kind: string }[]} */
    const copied = []

    for (const file of outputs.staticFiles) {
      const rel = file.pathname.startsWith("/") ? file.pathname.slice(1) : file.pathname
      const dest = join(assetsDir, rel)
      await copyTo(file.filePath, dest)
      copied.push({ pathname: file.pathname, file: rel, kind: "static" })
    }

    for (const prerender of outputs.prerenders) {
      const fallback = prerender.fallback?.filePath
      if (!fallback) continue
      const rel = assetRel(prerender.pathname)
      await copyTo(fallback, join(assetsDir, rel))
      copied.push({ pathname: prerender.pathname, file: rel, kind: "prerender" })
    }

    const notFoundCandidates = [
      outputs.prerenders.find((item) => item.pathname === "/_not-found")?.fallback?.filePath,
      join(distDir, "server/app/_not-found.html"),
    ]
    for (const candidate of notFoundCandidates) {
      if (!candidate) continue
      try {
        await access(candidate)
        await copyTo(candidate, join(assetsDir, "404.html"))
        break
      } catch {
        // try the next candidate
      }
    }

    const prerendered = new Set(outputs.prerenders.map((item) => item.pathname))
    const nodeHandlers = [
      ...outputs.appPages,
      ...outputs.appRoutes,
      ...outputs.pages,
      ...outputs.pagesApi,
    ].filter(
      (item) =>
        item.runtime === "nodejs" &&
        !prerendered.has(item.pathname) &&
        item.pathname !== "/_not-found" &&
        item.pathname !== "/_not-found.rsc",
    )

    const edgeHandlers = [
      ...outputs.appPages,
      ...outputs.appRoutes,
      ...outputs.pages,
      ...outputs.pagesApi,
    ].filter((item) => item.runtime === "edge")

    const manifest = {
      adapter: "solved-cf",
      bun: true,
      openNext: false,
      nodejsCompat: false,
      buildId,
      nextVersion,
      generatedAt: new Date().toISOString(),
      protectedPrefixes: PROTECTED_PREFIXES,
      staticFiles: copied.length,
      prerenders: outputs.prerenders.map((item) => item.pathname),
      edgeHandlers: edgeHandlers.map((item) => item.pathname),
      nodeHandlers: nodeHandlers.map((item) => item.pathname),
      middleware: outputs.middleware
        ? { runtime: outputs.middleware.runtime, matchers: outputs.middleware.config?.matchers }
        : null,
      routing: {
        dynamic: routing.dynamicRoutes.map((route) => route.source ?? route.sourceRegex),
      },
    }

    if (nodeHandlers.length > 0) {
      console.warn(
        `[solved-cf] ${nodeHandlers.length} Node.js handlers were built. The Worker does not run Node. Those routes must prerender or use runtime = "edge".\n` +
          nodeHandlers
            .slice(0, 12)
            .map((item) => `  - ${item.pathname}`)
            .join("\n"),
      )
    }

    await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2))
    await writeFile(
      join(assetsDir, "_headers"),
      `/*\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`,
    )

    console.log(
      `[solved-cf] packed ${copied.length} assets → ${relative(projectDir, assetsDir)} (build ${buildId})`,
    )
  },
}

export default adapter
