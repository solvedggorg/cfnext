import { expect, test } from "bun:test"

import { getAi, getAiGateway, queryVectorize, runAi } from "../src/server/ai"
import { runWithCloudflareContext } from "../src/ssr/context"

test("runAi wraps env.AI.run", async () => {
  const calls: unknown[] = []
  const AI = {
    run: async (model: string, input: unknown, options?: unknown) => {
      calls.push({ model, input, options })
      return { response: "ok" }
    },
  }
  const result = await runWithCloudflareContext(
    { request: new Request("https://example.com"), env: { AI }, ctx: { waitUntil() {} } },
    () => runAi("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { prompt: "hi" }),
  )
  expect(result).toEqual({ response: "ok" })
  expect(calls).toEqual([
    { model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", input: { prompt: "hi" }, options: undefined },
  ])
})

test("getAi throws when AI is missing", () => {
  runWithCloudflareContext(
    { request: new Request("https://example.com"), env: {}, ctx: { waitUntil() {} } },
    () => {
      expect(() => getAi()).toThrow(/AI/)
    },
  )
})

test("getAiGateway uses AI_GATEWAY_ID and optional account URL", () => {
  const info = runWithCloudflareContext(
    {
      request: new Request("https://example.com"),
      env: { AI_GATEWAY_ID: "default" },
      ctx: { waitUntil() {} },
    },
    () => getAiGateway(undefined, { accountId: "abc123" }),
  )
  expect(info.id).toBe("default")
  expect(info.url).toBe("https://gateway.ai.cloudflare.com/v1/abc123/default")
  expect(info.options).toEqual({ gateway: { id: "default" } })
})

test("queryVectorize wraps env.VECTORIZE.query", async () => {
  const VECTORIZE = {
    query: async (vector: number[], options?: { topK?: number }) => ({ matches: vector.length, topK: options?.topK }),
  }
  const result = await queryVectorize([0.1, 0.2], { topK: 3 }, { VECTORIZE })
  expect(result).toEqual({ matches: 2, topK: 3 })
})
