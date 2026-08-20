import { expect, test } from "bun:test"

import { getCloudflareContext, runWithCloudflareContext } from "../src/ssr/context"

test("getCloudflareContext throws outside a request", () => {
  expect(() => getCloudflareContext()).toThrow(/outside a request/)
})

test("getCloudflareContext throws Worker-only inside the container process", () => {
  const previous = process.env.CFNEXT_TARGET
  process.env.CFNEXT_TARGET = "container"
  try {
    expect(() => getCloudflareContext()).toThrow(/Worker-only/)
  } finally {
    if (previous === undefined) delete process.env.CFNEXT_TARGET
    else process.env.CFNEXT_TARGET = previous
  }
})

test("runWithCloudflareContext exposes env and request to SSR code", async () => {
  const request = new Request("https://example.com/live")
  const env = { DB: { tag: "d1" } }
  const value = await runWithCloudflareContext({ request, env, ctx: { waitUntil() {} } }, () => {
    const { env: bound } = getCloudflareContext<{ DB: { tag: string } }>()
    return bound.DB.tag
  })
  expect(value).toBe("d1")
})
