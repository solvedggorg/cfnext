import { expect, test } from "bun:test"

import { clerkShellPath, hasClerkSession, isProtectedPath } from "./protect.mjs"

test("protects account surfaces", () => {
  expect(isProtectedPath("/dashboard")).toBe(true)
  expect(isProtectedPath("/account/security")).toBe(true)
  expect(isProtectedPath("/figure")).toBe(false)
  expect(isProtectedPath("/")).toBe(false)
})

test("maps clerk nested paths to a shell", () => {
  expect(clerkShellPath("/sign-in/factor-one")).toBe("/sign-in/index.html")
  expect(clerkShellPath("/figure")).toBe(null)
})

test("reads clerk session cookies", () => {
  const yes = new Request("https://solved.gg/dashboard", {
    headers: { cookie: "__session=abc; Path=/" },
  })
  const no = new Request("https://solved.gg/dashboard")
  expect(hasClerkSession(yes)).toBe(true)
  expect(hasClerkSession(no)).toBe(false)
})
