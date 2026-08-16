import type { ProtectConfig, ProtectShell } from "./config"

export function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function isProtectedPath(pathname: string, prefixes: string[]): boolean {
  return matchesPrefix(pathname, prefixes)
}

export function shellAsset(pathname: string, shells: ProtectShell[]): string | null {
  const hit = shells.find(
    (item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`),
  )
  return hit?.asset ?? null
}

export function hasSessionCookie(request: Request, pattern: string): boolean {
  const cookie = request.headers.get("cookie") ?? ""
  return new RegExp(pattern).test(cookie)
}

export function signInRedirect(request: Request, signInPath: string): Response {
  const url = new URL(request.url)
  const next = `${url.pathname}${url.search}`
  const dest = new URL(signInPath, url)
  dest.searchParams.set("redirect_url", next)
  return Response.redirect(dest.toString(), 307)
}

export function runWorkerFirstFromPrefixes(prefixes: string[]): string[] {
  const rules: string[] = []
  for (const prefix of prefixes) {
    const clean = prefix.startsWith("/") ? prefix : `/${prefix}`
    rules.push(clean)
    rules.push(`${clean}/*`)
  }
  return rules
}

export function protectDecision(
  request: Request,
  protect: ProtectConfig,
): { redirect: Response } | { ok: true } {
  const pathname = new URL(request.url).pathname
  if (
    isProtectedPath(pathname, protect.prefixes) &&
    !hasSessionCookie(request, protect.sessionCookiePattern)
  ) {
    return { redirect: signInRedirect(request, protect.signInPath) }
  }
  return { ok: true }
}
