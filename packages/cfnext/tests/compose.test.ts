import { expect, test } from "bun:test"

import { asExportedHandler, composeWorker } from "../src/worker/compose"

test("asExportedHandler accepts a fetch-only worker", async () => {
  const worker = {
    fetch: () => new Response("ok"),
  }
  const handler = asExportedHandler(worker)
  const res = await handler.fetch!(new Request("https://example.com"), {}, {})
  expect(await res.text()).toBe("ok")
})

test("asExportedHandler rejects a missing fetch", () => {
  expect(() => asExportedHandler({})).toThrow(/fetch/)
})

test("composeWorker copies queue and scheduled from extra onto the user fetch", async () => {
  const base = asExportedHandler({
    fetch: () => new Response("app"),
  })
  const composed = composeWorker(base, {
    queue: async () => {},
    scheduled: async () => {},
  })
  expect(composed.queue).toBeDefined()
  expect(composed.scheduled).toBeDefined()
  const res = await composed.fetch!(new Request("https://example.com"), {}, {})
  expect(await res.text()).toBe("app")
})

test("composeWorker rejects extra fetch so the user owns fetch", () => {
  const base = asExportedHandler({
    fetch: () => new Response("app"),
  })
  expect(() =>
    composeWorker(base, {
      fetch: () => new Response("hijack"),
    }),
  ).toThrow(/fetch/)
})

test("composeWorker copies email from extra", () => {
  const base = asExportedHandler({
    fetch: () => new Response("app"),
  })
  const email = async () => {}
  const composed = composeWorker(base, { email })
  expect(composed.email).toBe(email)
})
