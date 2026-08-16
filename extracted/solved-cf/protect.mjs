export const CLERK_APP_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/account",
  "/organization",
  "/oauth",
]

export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/account",
  "/organization",
  "/organizations",
  "/create-organization",
  "/api-keys",
]

export function matchesPrefix(pathname, prefixes) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function clerkShellPath(pathname) {
  const prefix = CLERK_APP_PREFIXES.find(
    (item) => pathname === item || pathname.startsWith(`${item}/`),
  )
  return prefix ? `${prefix}/index.html` : null
}

export function isProtectedPath(pathname) {
  return matchesPrefix(pathname, PROTECTED_PREFIXES)
}

export function hasClerkSession(request) {
  const cookie = request.headers.get("cookie") ?? ""
  return /(?:^|;\s*)(__session|__client_uat)=/.test(cookie)
}

export function signInRedirect(request) {
  const url = new URL(request.url)
  const next = `${url.pathname}${url.search}`
  const dest = new URL("/sign-in", url)
  dest.searchParams.set("redirect_url", next)
  return Response.redirect(dest, 307)
}
