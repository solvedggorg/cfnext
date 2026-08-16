import type { CfnextConfig, CfnextUserConfig } from "../config"
import { defaultConfig, normalizeConfig } from "../config"
import { protectDecision } from "../protect"
import { withSecurity } from "../security"
import { runWithCloudflareContext } from "../ssr/context"
import { matchRoute, type SsrHandlerRecord } from "../ssr/match"
import { invokeNodeHandler, type NodeHandler } from "../ssr/node-http"
import type { EdgeHandler, SsrLoader } from "../ssr/types"
import type { AssetsEnv } from "./assets"
import { isStaticAssetPath } from "./container"

export type { SsrLoader } from "../ssr/types"

export type SsrEnv = AssetsEnv & Record<string, unknown>

export type SsrExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void
}

export type SsrWorkerOptions = {
  config?: CfnextUserConfig | CfnextConfig
  handlers: SsrHandlerRecord[]
  loaders: Record<string, SsrLoader>
  prerenders?: string[]
}

export function shouldBypassPrerender(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return true
  const url = new URL(request.url)
  if (url.pathname.endsWith(".rsc")) return true
  if (request.headers.has("rsc")) return true
  if (request.headers.get("next-action")) return true
  const accept = request.headers.get("accept") ?? ""
  return accept.includes("text/x-component")
}

export function createSsrWorker(opts: SsrWorkerOptions) {
  const resolved = normalizeConfig(opts.config ?? defaultConfig())
  const prerenders = new Set(opts.prerenders ?? [])

  return {
    async fetch(
      request: Request,
      env: SsrEnv,
      ctx: SsrExecutionContext = { waitUntil() {} },
    ): Promise<Response> {
      return runWithCloudflareContext({ request, env, ctx }, async () => {
        const url = new URL(request.url)
        const gate = protectDecision(request, resolved.protect)
        if ("redirect" in gate) return gate.redirect

        if (env.ASSETS && isStaticAssetPath(url.pathname)) {
          const asset = await env.ASSETS.fetch(request)
          if (asset.status !== 404) {
            return resolved.securityHeaders ? withSecurity(asset) : asset
          }
        }

        const match = matchRoute(url.pathname, opts.handlers)
        if (
          match &&
          !shouldBypassPrerender(request) &&
          prerenders.has(match.handler.pathname) &&
          env.ASSETS
        ) {
          const asset = await env.ASSETS.fetch(request)
          if (asset.status !== 404) {
            return resolved.securityHeaders ? withSecurity(asset) : asset
          }
        }

        if (match) {
          const loader = opts.loaders[match.handler.id]
          if (!loader) {
            return new Response("SSR handler missing", { status: 500 })
          }
          const mod = await loader()
          const handler = mod.handler ?? mod.default
          if (!handler) {
            return new Response("SSR handler export missing", { status: 500 })
          }

          const waitUntil = (promise: Promise<void>) => {
            ctx.waitUntil(promise)
          }

          const response =
            match.handler.runtime === "edge"
              ? await (handler as EdgeHandler)(request, { waitUntil })
              : await invokeNodeHandler(request, handler as NodeHandler, {
                  waitUntil,
                  requestMeta: {
                    hostname: url.hostname,
                    relativeProjectDir: ".",
                  },
                })
          return resolved.securityHeaders ? withSecurity(response) : response
        }

        if (env.ASSETS) {
          const asset = await env.ASSETS.fetch(request)
          return resolved.securityHeaders ? withSecurity(asset) : asset
        }
        return new Response("Not Found", { status: 404 })
      })
    },
  }
}

export default createSsrWorker({ handlers: [], loaders: {} })
