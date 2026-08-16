import { expect, test } from "bun:test"

import { createAssetsWorker } from "../src/worker/assets"
import { createContainerWorker, isStaticAssetPath } from "../src/worker/container"

test("assets worker redirects unauthenticated protected paths", async () => {
  const worker = createAssetsWorker({
    protect: { prefixes: ["/dashboard"] },
  })
  const response = await worker.fetch(new Request("https://example.com/dashboard"), {
    ASSETS: { fetch: async () => new Response("ok") },
  })
  expect(response.status).toBe(307)
})

test("assets worker serves assets when present", async () => {
  const worker = createAssetsWorker({})
  const response = await worker.fetch(new Request("https://example.com/"), {
    ASSETS: { fetch: async () => new Response("hello", { status: 200 }) },
  })
  expect(response.status).toBe(200)
  expect(await response.text()).toBe("hello")
  expect(response.headers.get("X-Frame-Options")).toBe("DENY")
})

test("container worker proxies misses to the container", async () => {
  const worker = createContainerWorker({})
  let started = false
  const response = await worker.fetch(new Request("https://example.com/live"), {
    ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
    NEXT_APP: {
      getByName: () => ({
        startAndWaitForPorts: async () => {
          started = true
        },
        fetch: async () => new Response("from-container"),
      }),
    },
  })
  expect(started).toBe(true)
  expect(await response.text()).toBe("from-container")
})

test("classifies static asset paths", () => {
  expect(isStaticAssetPath("/_next/static/chunks/app.js")).toBe(true)
  expect(isStaticAssetPath("/favicon.ico")).toBe(true)
  expect(isStaticAssetPath("/dashboard")).toBe(false)
})
