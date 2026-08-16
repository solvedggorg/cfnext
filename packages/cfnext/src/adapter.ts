import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { loadConfig } from "./config"
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

const adapter = {
  name: "cfnext",

  async modifyConfig(config: NextConfigLike, ctx: { phase?: string }) {
    const projectDir = typeof process.cwd === "function" ? process.cwd() : "."
    const cf = await loadConfig(projectDir)
    const images = {
      ...(config.images ?? {}),
      ...(cf.images.unoptimized ? { unoptimized: true } : {}),
    }
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
    await packBuild(packed)
    if (config.target === "ssr") {
      await packSsrHandlers(packed)
    }
  },
}

export default adapter
