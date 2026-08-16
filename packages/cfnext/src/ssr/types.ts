import type { NodeHandler } from "./node-http"

export type SsrHandlerKind = "app-page" | "app-route" | "pages" | "pages-api" | "middleware"

export type SsrHandlerRecord = {
  id: string
  pathname: string
  runtime: "nodejs" | "edge"
  kind: SsrHandlerKind
}

export type EdgeHandler = (
  request: Request,
  ctx?: { waitUntil?: (promise: Promise<void>) => void; signal?: AbortSignal },
) => Promise<Response> | Response

export type SsrLoader = () => Promise<{
  handler: NodeHandler | EdgeHandler
  default?: NodeHandler | EdgeHandler
}>

export type SsrManifestHandler = SsrHandlerRecord & {
  module: string
}

export type SsrManifest = {
  adapter: string
  target: "ssr"
  bun: true
  openNext: false
  nodejsCompat: true
  buildId: string
  nextVersion: string
  handlers: SsrManifestHandler[]
  prerenders: string[]
  routing: { dynamic: Array<string | undefined> }
}
