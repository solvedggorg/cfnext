import { expect, test } from "bun:test"

import { assetRel, collectHandlers } from "../src/pack"

test("assetRel maps routes onto Workers Assets paths", () => {
  expect(assetRel("/")).toBe("index.html")
  expect(assetRel("/about")).toBe("about/index.html")
  expect(assetRel("/about/")).toBe("about/index.html")
  expect(assetRel("/blog/[slug]")).toBe("blog/index.html")
  expect(assetRel("/file.json")).toBe("file.json")
})

test("collectHandlers ignores prerendered node pages", () => {
  const { nodeHandlers, edgeHandlers } = collectHandlers({
    staticFiles: [],
    prerenders: [{ pathname: "/about" }],
    appPages: [
      { pathname: "/about", runtime: "nodejs" },
      { pathname: "/live", runtime: "nodejs" },
      { pathname: "/edge", runtime: "edge" },
      { pathname: "/_not-found", runtime: "nodejs" },
    ],
    appRoutes: [],
    pages: [],
    pagesApi: [],
  })
  expect(nodeHandlers.map((item) => item.pathname)).toEqual(["/live"])
  expect(edgeHandlers.map((item) => item.pathname)).toEqual(["/edge"])
})
