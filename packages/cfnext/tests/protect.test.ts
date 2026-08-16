import { expect, test } from "bun:test"

import { hasSessionCookie, isProtectedPath, protectDecision, shellAsset } from "../src/protect"
import {
  clerkShellPath,
  hasClerkSession,
  isProtectedPath as clerkIsProtected,
} from "../src/protect-clerk"
import { DEFAULT_PROTECT } from "../src/config"

test("protects configured prefixes only", () => {
  expect(isProtectedPath("/dashboard", ["/dashboard"])).toBe(true)
  expect(isProtectedPath("/account/security", ["/account"])).toBe(true)
  expect(isProtectedPath("/figure", ["/dashboard"])).toBe(false)
  expect(isProtectedPath("/", ["/dashboard"])).toBe(false)
})

test("maps shells the same way clerk nested paths did", () => {
  expect(
    shellAsset("/sign-in/factor-one", [{ prefix: "/sign-in", asset: "/sign-in/index.html" }]),
  ).toBe("/sign-in/index.html")
  expect(shellAsset("/figure", [{ prefix: "/sign-in", asset: "/sign-in/index.html" }])).toBe(null)
})

test("extracted clerk helpers still match the original package", () => {
  expect(clerkIsProtected("/dashboard")).toBe(true)
  expect(clerkIsProtected("/account/security")).toBe(true)
  expect(clerkIsProtected("/figure")).toBe(false)
  expect(clerkShellPath("/sign-in/factor-one")).toBe("/sign-in/index.html")
  expect(clerkShellPath("/figure")).toBe(null)
})

test("reads session cookies", () => {
  const yes = new Request("https://example.com/dashboard", {
    headers: { cookie: "__session=abc; Path=/" },
  })
  const no = new Request("https://example.com/dashboard")
  expect(hasSessionCookie(yes, DEFAULT_PROTECT.sessionCookiePattern)).toBe(true)
  expect(hasSessionCookie(no, DEFAULT_PROTECT.sessionCookiePattern)).toBe(false)
  expect(hasClerkSession(yes)).toBe(true)
  expect(hasClerkSession(no)).toBe(false)
})

test("redirects unauthenticated protected requests", () => {
  const request = new Request("https://example.com/dashboard/settings")
  const decision = protectDecision(request, {
    ...DEFAULT_PROTECT,
    prefixes: ["/dashboard"],
  })
  expect("redirect" in decision).toBe(true)
  if ("redirect" in decision) {
    expect(decision.redirect.status).toBe(307)
    expect(decision.redirect.headers.get("location")).toContain("/sign-in")
    expect(decision.redirect.headers.get("location")).toContain("redirect_url")
  }
})
