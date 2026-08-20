import { expect, test } from "bun:test"

import { getBooleanValue, resolveOpenFeature } from "../src/server/flags"
import { runWithCloudflareContext } from "../src/ssr/context"

test("getBooleanValue uses env.FLAGS binding", async () => {
  const calls: unknown[] = []
  const FLAGS = {
    getBooleanValue: async (key: string, fallback: boolean, context?: Record<string, unknown>) => {
      calls.push({ key, fallback, context })
      return key === "new-checkout"
    },
  }
  const value = await runWithCloudflareContext(
    { request: new Request("https://example.com"), env: { FLAGS }, ctx: { waitUntil() {} } },
    () => getBooleanValue("new-checkout", false, { userId: "user-42" }),
  )
  expect(value).toBe(true)
  expect(calls).toEqual([{ key: "new-checkout", fallback: false, context: { userId: "user-42" } }])
})

test("getBooleanValue throws when FLAGS is missing", async () => {
  await runWithCloudflareContext(
    { request: new Request("https://example.com"), env: {}, ctx: { waitUntil() {} } },
    async () => {
      await expect(getBooleanValue("x", false)).rejects.toThrow(/FLAGS/)
    },
  )
})

test("resolveOpenFeature is null when @cloudflare/flagship is not installed", () => {
  expect(resolveOpenFeature()).toBeNull()
})
