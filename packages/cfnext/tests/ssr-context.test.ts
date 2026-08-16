import { expect, test } from "bun:test"

import { getCloudflareContext, runWithCloudflareContext } from "../src/ssr/context"

test("getCloudflareContext throws outside a request", () => {
  expect(() => getCloudflareContext()).toThrow(/outside a request/)
})

test("runWithCloudflareContext exposes env and request to SSR code", async () => {
  const request = new Request("https://example.com/live")
  const env = { DB: { tag: "d1" } }
  const value = await runWithCloudflareContext({ request, env, ctx: { waitUntil() {} } }, () => {
    const store = getCloudflareContext()
    return (store.env as { DB: { tag: string } }).DB.tag
  })
  expect(value).toBe("d1")
})
