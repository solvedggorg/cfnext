import type { CfnextConfig, CfnextUserConfig } from "../config"
import { defaultConfig, normalizeConfig } from "../config"
import { protectDecision, shellAsset } from "../protect"
import { withSecurity } from "../security"

export type AssetsEnv = {
  ASSETS: {
    fetch: (input: Request | URL | string, init?: RequestInit) => Promise<Response>
  }
}

export function createAssetsWorker(config: CfnextUserConfig | CfnextConfig = defaultConfig()) {
  const resolved = normalizeConfig(config)
  return {
    async fetch(request: Request, env: AssetsEnv): Promise<Response> {
      const url = new URL(request.url)
      const gate = protectDecision(request, resolved.protect)
      if ("redirect" in gate) return gate.redirect

      const asset = await env.ASSETS.fetch(request)
      if (asset.status !== 404) {
        return resolved.securityHeaders ? withSecurity(asset) : asset
      }

      const shell = shellAsset(url.pathname, resolved.protect.shells)
      if (shell) {
        const fallback = await env.ASSETS.fetch(new URL(`/${shell.replace(/^\//, "")}`, url.origin))
        if (fallback.ok) {
          return resolved.securityHeaders ? withSecurity(fallback) : fallback
        }
      }

      return resolved.securityHeaders ? withSecurity(asset) : asset
    },
  }
}

export default createAssetsWorker()
