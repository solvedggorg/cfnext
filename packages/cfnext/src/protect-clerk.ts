/**
 * Clerk helpers extracted from @solved/cf.
 * Opt-in via `cfnext init --auth clerk` or by importing these prefixes into `cfnext.hooks.ts`.
 */

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

export function clerkShells(): { prefix: string; asset: string }[] {
  return CLERK_APP_PREFIXES.map((prefix) => ({
    prefix,
    asset: `${prefix}/index.html`,
  }))
}

export function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function clerkShellPath(pathname: string): string | null {
  const prefix = CLERK_APP_PREFIXES.find(
    (item) => pathname === item || pathname.startsWith(`${item}/`),
  )
  return prefix ? `${prefix}/index.html` : null
}

export function isProtectedPath(pathname: string): boolean {
  return matchesPrefix(pathname, PROTECTED_PREFIXES)
}

export function hasClerkSession(request: Request): boolean {
  const cookie = request.headers.get("cookie") ?? ""
  return /(?:^|;\s*)(__session|__client_uat)=/.test(cookie)
}

export function signInRedirect(request: Request): Response {
  const url = new URL(request.url)
  const next = `${url.pathname}${url.search}`
  const dest = new URL("/sign-in", url)
  dest.searchParams.set("redirect_url", next)
  return Response.redirect(dest.toString(), 307)
}
