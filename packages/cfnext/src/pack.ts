import { copyFile, mkdir, writeFile, access } from "node:fs/promises"
import { dirname, join, relative } from "node:path"

import { ADAPTER_NAME, OUT_DIR } from "./constants"
import type { CfnextConfig } from "./config"
import { assetsHeadersFile } from "./security"

export type PackFile = {
  pathname: string
  filePath: string
}

export type PackPrerender = {
  pathname: string
  fallback?: { filePath?: string }
}

export type PackHandler = {
  pathname: string
  runtime: "nodejs" | "edge"
  filePath?: string
  id?: string
  assets?: Record<string, string>
  entryKey?: string
  handlerExport?: string
}

export type PackOutputs = {
  staticFiles: PackFile[]
  prerenders: PackPrerender[]
  appPages: PackHandler[]
  appRoutes: PackHandler[]
  pages: PackHandler[]
  pagesApi: PackHandler[]
  middleware?: { runtime: string; filePath?: string; config?: { matchers?: unknown } }
}

export type PackRouting = {
  dynamicRoutes: Array<{ source?: string; sourceRegex?: string }>
}

export type CopiedAsset = {
  pathname: string
  file: string
  kind: string
}

export function assetRel(pathname: string): string {
  const clean =
    pathname
      .split("?")[0]
      ?.replace(/\/\[\[\.\.\.[^\]]+\]\]/g, "")
      .replace(/\/\[\.\.\.[^\]]+\]/g, "")
      .replace(/\/\[[^\]]+\]/g, "") || "/"
  if (clean === "/") return "index.html"
  const trimmed = clean.replace(/^\//, "").replace(/\/$/, "")
  if (clean.endsWith("/")) return `${trimmed}/index.html`
  if (/\.[a-zA-Z0-9]+$/.test(trimmed)) return trimmed
  return `${trimmed}/index.html`
}

export async function copyTo(src: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true })
  await copyFile(src, dest)
}

export function collectHandlers(outputs: PackOutputs): {
  prerendered: Set<string>
  nodeHandlers: PackHandler[]
  edgeHandlers: PackHandler[]
} {
  const prerendered = new Set(outputs.prerenders.map((item) => item.pathname))
  const all = [...outputs.appPages, ...outputs.appRoutes, ...outputs.pages, ...outputs.pagesApi]
  const nodeHandlers = all.filter(
    (item) =>
      item.runtime === "nodejs" &&
      !prerendered.has(item.pathname) &&
      item.pathname !== "/_not-found" &&
      item.pathname !== "/_not-found.rsc",
  )
  const edgeHandlers = all.filter((item) => item.runtime === "edge")
  return { prerendered, nodeHandlers, edgeHandlers }
}

export async function packBuild(opts: {
  outputs: PackOutputs
  routing: PackRouting
  projectDir: string
  distDir: string
  buildId: string
  nextVersion: string
  config: CfnextConfig
}): Promise<{ copied: CopiedAsset[]; nodeHandlers: PackHandler[]; edgeHandlers: PackHandler[] }> {
  const root = join(opts.projectDir, OUT_DIR)
  const assetsDir = join(root, "assets")
  await mkdir(assetsDir, { recursive: true })

  const copied: CopiedAsset[] = []

  for (const file of opts.outputs.staticFiles) {
    const rel = file.pathname.startsWith("/") ? file.pathname.slice(1) : file.pathname
    await copyTo(file.filePath, join(assetsDir, rel))
    copied.push({ pathname: file.pathname, file: rel, kind: "static" })
  }

  for (const prerender of opts.outputs.prerenders) {
    const fallback = prerender.fallback?.filePath
    if (!fallback) continue
    const rel = assetRel(prerender.pathname)
    await copyTo(fallback, join(assetsDir, rel))
    copied.push({ pathname: prerender.pathname, file: rel, kind: "prerender" })
  }

  const notFoundCandidates = [
    opts.outputs.prerenders.find((item) => item.pathname === "/_not-found")?.fallback?.filePath,
    join(opts.distDir, "server/app/_not-found.html"),
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

  const { nodeHandlers, edgeHandlers } = collectHandlers(opts.outputs)

  const manifest = {
    adapter: ADAPTER_NAME,
    target: opts.config.target,
    bun: true,
    openNext: false,
    nodejsCompat: opts.config.target === "ssr",
    buildId: opts.buildId,
    nextVersion: opts.nextVersion,
    generatedAt: new Date().toISOString(),
    protectedPrefixes: opts.config.protect.prefixes,
    staticFiles: copied.length,
    prerenders: opts.outputs.prerenders.map((item) => item.pathname),
    edgeHandlers: edgeHandlers.map((item) => item.pathname),
    nodeHandlers: nodeHandlers.map((item) => item.pathname),
    middleware: opts.outputs.middleware
      ? {
          runtime: opts.outputs.middleware.runtime,
          matchers: opts.outputs.middleware.config?.matchers,
        }
      : null,
    routing: {
      dynamic: opts.routing.dynamicRoutes.map((route) => route.source ?? route.sourceRegex),
    },
  }

  if (opts.config.target === "workers" && nodeHandlers.length > 0) {
    console.warn(
      `[cfnext] ${nodeHandlers.length} Node.js handlers were built. The Workers target does not run Node. Prerender those routes, set runtime = "edge", or init with --target ssr or container.\n` +
        nodeHandlers
          .slice(0, 12)
          .map((item) => `  - ${item.pathname}`)
          .join("\n"),
    )
  }

  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2))
  if (opts.config.securityHeaders) {
    await writeFile(join(assetsDir, "_headers"), assetsHeadersFile())
  }

  console.log(
    `[cfnext] packed ${copied.length} assets → ${relative(opts.projectDir, assetsDir)} (build ${opts.buildId}, target ${opts.config.target})`,
  )

  return { copied, nodeHandlers, edgeHandlers }
}
