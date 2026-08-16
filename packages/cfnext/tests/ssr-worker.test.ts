import { expect, test } from "bun:test"

import { createSsrWorker } from "../src/worker/ssr"
import type { SsrHandlerRecord } from "../src/ssr/match"
import type { NodeIncomingMessage, NodeServerResponse } from "../src/ssr/node-http"
import type { SsrLoader } from "../src/ssr/types"

const handlers: SsrHandlerRecord[] = [
  { id: "about", pathname: "/about", runtime: "nodejs", kind: "app-page" },
  { id: "health", pathname: "/api/health", runtime: "nodejs", kind: "app-route" },
  { id: "edge", pathname: "/edge", runtime: "edge", kind: "app-route" },
]

const loaders: Record<string, SsrLoader> = {
  about: async () => ({
    handler: async (req: NodeIncomingMessage, res: NodeServerResponse) => {
      res.setHeader("content-type", "text/html")
      res.end(`ssr:${req.url}`)
    },
  }),
  health: async () => ({
    handler: async (_req: NodeIncomingMessage, res: NodeServerResponse) => {
      res.setHeader("content-type", "application/json")
      res.end(JSON.stringify({ ok: true }))
    },
  }),
  edge: async () => ({
    handler: async (request: Request) =>
      new Response(`edge:${new URL(request.url).pathname}`, { status: 200 }),
  }),
}

function assets(map: Record<string, { status?: number; body?: string }> = {}) {
  return {
    ASSETS: {
      async fetch(input: Request | URL | string) {
        const url = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(input.url)
        const hit = map[url.pathname]
        if (!hit) return new Response("missing", { status: 404 })
        return new Response(hit.body ?? "asset", { status: hit.status ?? 200 })
      },
    },
  }
}

test("serves hashed static files from ASSETS without invoking SSR", async () => {
  let invoked = false
  const worker = createSsrWorker({
    config: { target: "ssr" },
    handlers,
    loaders: {
      ...loaders,
      about: async () => {
        invoked = true
        return loaders.about!()
      },
    },
  })
  const response = await worker.fetch(
    new Request("https://example.com/_next/static/chunks/app.js"),
    assets({ "/_next/static/chunks/app.js": { body: "chunk" } }),
  )
  expect(await response.text()).toBe("chunk")
  expect(invoked).toBe(false)
})

test("invokes a Node.js page handler for a dynamic request", async () => {
  const worker = createSsrWorker({
    config: { target: "ssr" },
    handlers,
    loaders,
    prerenders: [],
  })
  const response = await worker.fetch(new Request("https://example.com/about"), assets())
  expect(response.status).toBe(200)
  expect(await response.text()).toBe("ssr:/about")
})

test("invokes an Edge handler with a Fetch Request", async () => {
  const worker = createSsrWorker({
    config: { target: "ssr" },
    handlers,
    loaders,
  })
  const response = await worker.fetch(new Request("https://example.com/edge"), assets())
  expect(await response.text()).toBe("edge:/edge")
})

test("serves a prerendered GET from ASSETS and still SSRs POST", async () => {
  const worker = createSsrWorker({
    config: { target: "ssr" },
    handlers,
    loaders,
    prerenders: ["/about"],
  })
  const env = assets({ "/about": { body: "prerendered" } })
  const get = await worker.fetch(new Request("https://example.com/about"), env)
  expect(await get.text()).toBe("prerendered")

  const post = await worker.fetch(new Request("https://example.com/about", { method: "POST" }), env)
  expect(await post.text()).toBe("ssr:/about")
})

test("makes Cloudflare bindings visible to the invoked handler", async () => {
  const worker = createSsrWorker({
    config: { target: "ssr" },
    handlers,
    loaders: {
      health: async () => ({
        handler: async (_req: NodeIncomingMessage, res: NodeServerResponse) => {
          const { getCloudflareContext } = await import("../src/ssr/context")
          const { env } = getCloudflareContext()
          res.end((env as { FLAG: string }).FLAG)
        },
      }),
    },
  })
  const response = await worker.fetch(new Request("https://example.com/api/health"), {
    ...assets(),
    FLAG: "from-binding",
  })
  expect(await response.text()).toBe("from-binding")
})
