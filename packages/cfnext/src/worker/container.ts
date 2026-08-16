import type { CfnextConfig, CfnextUserConfig } from "../config"
import { defaultConfig, normalizeConfig } from "../config"
import { protectDecision } from "../protect"
import { withSecurity } from "../security"
import type { AssetsEnv } from "./assets"

export type ContainerStub = {
  startAndWaitForPorts: () => Promise<void>
  fetch: (request: Request) => Promise<Response>
}

export type ContainerEnv = AssetsEnv & {
  NEXT_APP: {
    getByName: (name: string) => ContainerStub
  }
}

const STATIC_EXT =
  /\.(?:js|css|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|txt|xml|json|webmanifest)$/i

export function isStaticAssetPath(pathname: string): boolean {
  if (pathname.startsWith("/_next/static/")) return true
  if (pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    return true
  }
  return STATIC_EXT.test(pathname)
}

export function createContainerWorker(config: CfnextUserConfig | CfnextConfig = defaultConfig()) {
  const resolved = normalizeConfig(config)
  return {
    async fetch(request: Request, env: ContainerEnv): Promise<Response> {
      const url = new URL(request.url)
      const gate = protectDecision(request, resolved.protect)
      if ("redirect" in gate) return gate.redirect

      if (env.ASSETS && isStaticAssetPath(url.pathname)) {
        const asset = await env.ASSETS.fetch(request)
        if (asset.status !== 404) {
          return resolved.securityHeaders ? withSecurity(asset) : asset
        }
      }

      const container = env.NEXT_APP.getByName("app")
      await container.startAndWaitForPorts()
      const response = await container.fetch(request)
      return resolved.securityHeaders ? withSecurity(response) : response
    },
  }
}

export default createContainerWorker()
