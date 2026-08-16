import { expect, test } from "bun:test"

import { matchRoute, type SsrHandlerRecord } from "../src/ssr/match"

const handlers: SsrHandlerRecord[] = [
  { id: "home", pathname: "/", runtime: "nodejs", kind: "app-page" },
  { id: "about", pathname: "/about", runtime: "nodejs", kind: "app-page" },
  { id: "blog", pathname: "/blog/[slug]", runtime: "nodejs", kind: "app-page" },
  { id: "docs", pathname: "/docs/[...path]", runtime: "nodejs", kind: "app-page" },
  { id: "shop", pathname: "/shop/[[...slug]]", runtime: "nodejs", kind: "app-page" },
  { id: "health", pathname: "/api/health", runtime: "nodejs", kind: "app-route" },
]

test("matches exact static routes", () => {
  expect(matchRoute("/about", handlers)?.handler.id).toBe("about")
  expect(matchRoute("/api/health", handlers)?.handler.id).toBe("health")
  expect(matchRoute("/", handlers)?.handler.id).toBe("home")
})

test("matches dynamic [slug] and exposes params", () => {
  const hit = matchRoute("/blog/hello-world", handlers)
  expect(hit?.handler.id).toBe("blog")
  expect(hit?.params).toEqual({ slug: "hello-world" })
  expect(hit?.invocationPathname).toBe("/blog/hello-world")
})

test("matches catch-all and optional catch-all", () => {
  const docs = matchRoute("/docs/a/b", handlers)
  expect(docs?.handler.id).toBe("docs")
  expect(docs?.params).toEqual({ path: ["a", "b"] })

  expect(matchRoute("/shop", handlers)?.handler.id).toBe("shop")
  expect(matchRoute("/shop/hats", handlers)?.params).toEqual({ slug: ["hats"] })
})

test("prefers a static route over a competing dynamic one", () => {
  const mixed: SsrHandlerRecord[] = [
    { id: "dyn", pathname: "/blog/[slug]", runtime: "nodejs", kind: "app-page" },
    { id: "static", pathname: "/blog/about", runtime: "nodejs", kind: "app-page" },
  ]
  expect(matchRoute("/blog/about", mixed)?.handler.id).toBe("static")
})

test("maps .rsc requests onto the page handler", () => {
  const hit = matchRoute("/about.rsc", handlers)
  expect(hit?.handler.id).toBe("about")
})

test("returns null when nothing matches", () => {
  expect(matchRoute("/nope", handlers)).toBeNull()
})
