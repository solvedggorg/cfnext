import { expect, test } from "bun:test"

import { CfnextAnalytics } from "../src/analytics/web"

test("CfnextAnalytics renders the Web Analytics beacon snippet", () => {
  const el = CfnextAnalytics({ token: "site-token" }) as {
    type: string
    props: Record<string, unknown>
  }
  expect(el.type).toBe("script")
  expect(el.props.src).toBe("https://static.cloudflareinsights.com/beacon.min.js")
  expect(el.props.type).toBe("module")
  expect(el.props["data-cf-beacon"]).toBe(JSON.stringify({ token: "site-token", spa: true }))
})

test("CfnextAnalytics can disable SPA measurement", () => {
  const el = CfnextAnalytics({ token: "site-token", spa: false }) as {
    props: Record<string, unknown>
  }
  expect(el.props["data-cf-beacon"]).toBe(JSON.stringify({ token: "site-token", spa: false }))
})
