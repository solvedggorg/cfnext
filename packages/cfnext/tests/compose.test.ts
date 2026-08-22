import { expect, test } from "bun:test"

import { composeWorker } from "../src/worker/compose"

const req = () => new Request("https://app.example/api/ping")

test("composeWorker passes through when no extra handlers exist", async () => {
  const base = { fetch: () => new Response("base") }
  const worker = composeWorker(base, {})
  expect(worker.email).toBeUndefined()
  expect(await worker.fetch(req(), {}, {})).toBeInstanceOf(Response)
})

test("composeWorker tries edgeFetch first and falls back to the user worker", async () => {
  const base = {
    fetch: (request: Request) => new Response(`base:${new URL(request.url).pathname}`),
  }
  const edgeFetch = (request: Request) =>
    new URL(request.url).pathname === "/api/ping" ? new Response("edge") : null
  const worker = composeWorker(base as never, { edgeFetch })
  const hit = await worker.fetch(req(), {}, {})
  expect(await hit.text()).toBe("edge")
  const miss = await worker.fetch(new Request("https://app.example/other"), {}, {})
  expect(await miss.text()).toBe("base:/other")
})

test("composeWorker still rejects a user-owned fetch in extras and keeps named handlers", () => {
  expect(() => composeWorker({}, { fetch: () => new Response() })).toThrow(/owns fetch/)
  const base = { fetch: () => new Response("x") }
  const scheduled = { cron: "0 * * * *" }
  const worker = composeWorker(base as never, { scheduled })
  expect(worker.scheduled).toBe(scheduled)
})
