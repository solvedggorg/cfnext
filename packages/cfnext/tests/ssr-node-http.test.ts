import { expect, test } from "bun:test"

import { invokeNodeHandler, type NodeIncomingMessage, type NodeServerResponse } from "../src/ssr/node-http"

test("invokes a Node handler and returns its body and status", async () => {
  async function handler(req: NodeIncomingMessage, res: NodeServerResponse) {
    res.statusCode = 201
    res.setHeader("content-type", "text/plain")
    res.setHeader("x-url", req.url ?? "")
    res.end(`hello ${req.method}`)
  }

  const response = await invokeNodeHandler(
    new Request("https://example.com/api/health", { method: "POST" }),
    handler,
  )
  expect(response.status).toBe(201)
  expect(await response.text()).toBe("hello POST")
  expect(response.headers.get("content-type")).toBe("text/plain")
  expect(response.headers.get("x-url")).toBe("/api/health")
})

test("forwards the request body to the Node handler", async () => {
  async function handler(req: NodeIncomingMessage, res: NodeServerResponse) {
    const chunks: Uint8Array[] = []
    await new Promise<void>((resolve, reject) => {
      req.on("data", (chunk: Uint8Array) => chunks.push(chunk))
      req.on("end", () => resolve())
      req.on("error", reject)
    })
    const body = new TextDecoder().decode(Buffer.concat(chunks))
    res.end(body.toUpperCase())
  }

  const response = await invokeNodeHandler(
    new Request("https://example.com/echo", {
      method: "POST",
      body: "ping",
    }),
    handler,
  )
  expect(await response.text()).toBe("PING")
})

test("streams multiple res.write chunks", async () => {
  async function handler(_req: NodeIncomingMessage, res: NodeServerResponse) {
    res.write("a")
    res.write("b")
    res.end("c")
  }

  const response = await invokeNodeHandler(new Request("https://example.com/"), handler)
  expect(await response.text()).toBe("abc")
})
