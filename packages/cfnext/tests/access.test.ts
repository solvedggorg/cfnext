import { expect, test } from "bun:test"

import { getAccessIdentity } from "../src/server/access"
import { getCloudflareContext, runWithCloudflareContext, type AccessIdentity } from "../src/ssr/context"

test("getAccessIdentity returns null when Access did not run", () => {
  const identity = runWithCloudflareContext(
    { request: new Request("https://example.com"), env: {}, ctx: { waitUntil() {} } },
    () => getAccessIdentity(),
  )
  expect(identity).resolves.toBeNull()
})

test("getAccessIdentity reads ctx.access", async () => {
  const expected: AccessIdentity = { email: "eng@acme.com", name: "Eng" }
  const value = await runWithCloudflareContext(
    {
      request: new Request("https://example.com"),
      env: {},
      ctx: {
        waitUntil() {},
        access: {
          aud: "demo",
          getIdentity: async () => expected,
        },
      },
    },
    async () => {
      expect(getCloudflareContext().ctx.access?.aud).toBe("demo")
      return getAccessIdentity()
    },
  )
  expect(value).toEqual(expected)
})
