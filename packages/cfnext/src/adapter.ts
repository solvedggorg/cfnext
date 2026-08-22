import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { edgePackLog, packEdgeHandlers } from "./edge"
import { loadConfig, loadProject, type LoadedProject } from "./config"
import { IMAGE_LOADER_FILE } from "./generate/next"
import { packBuild, type PackOutputs, type PackRouting } from "./pack"
import { packSsrHandlers } from "./ssr/pack"

export function adapterPath(): string {
  const js = fileURLToPath(new URL("./adapter.js", import.meta.url))
  if (existsSync(js)) return js
  return fileURLToPath(new URL("./adapter.ts", import.meta.url))
}

type NextConfigLike = Record<string, unknown> & {
  images?: Record<string, unknown>
}

export function nextImagesConfig(
  current: Record<string, unknown> | undefined,
  project: LoadedProject,
): Record<string, unknown> {
  const images: Record<string, unknown> = { ...current }
  const loader = project.json?.media?.images?.loader
  if (project.config.images.unoptimized) {
    images.unoptimized = true
    return images
  }
  if (loader?.enabled) {
    images.loader = "custom"
    images.loaderFile = IMAGE_LOADER_FILE
    if (loader.remotePatterns?.length) images.remotePatterns = loader.remotePatterns
  }
  return images
}

const adapter = {
  name: "cfnext",

  async modifyConfig(config: NextConfigLike, ctx: { phase?: string }) {
    const projectDir = typeof process.cwd === "function" ? process.cwd() : "."
    const project = await loadProject(projectDir)
    const images = nextImagesConfig(config.images, project)
    if (ctx.phase === "phase-production-build") {
      return {
        ...config,
        images,
        supportsImmutableAssets: (config as { supportsImmutableAssets?: boolean })
          .supportsImmutableAssets ?? true,
      }
    }
    return { ...config, images }
  },

  async onBuildComplete({
    outputs,
    projectDir,
    distDir,
    buildId,
    nextVersion,
    routing,
  }: {
    outputs: PackOutputs
    projectDir: string
    distDir: string
    buildId: string
    nextVersion: string
    routing: PackRouting
  }) {
    const config = await loadConfig(projectDir)
    const packed = {
      outputs,
      routing,
      projectDir,
      distDir,
      buildId,
      nextVersion,
      config,
    }
    const { edgeHandlers } = await packBuild(packed)
    if (config.target === "ssr") {
      await packSsrHandlers(packed)
    }
    if (config.target === "workers" && edgeHandlers.length > 0) {
      await packEdgeHandlers({ projectDir, routes: edgeHandlers })
      console.log(edgePackLog(projectDir, edgeHandlers.length))
    }
  },
}

export default adapter
