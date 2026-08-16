export const SECURITY_HEADERS: [string, string][] = [
  ["X-Frame-Options", "DENY"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  [
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  ],
]

export function withSecurity(response: Response): Response {
  const next = new Response(response.body, response)
  for (const [key, value] of SECURITY_HEADERS) {
    if (!next.headers.has(key)) next.headers.set(key, value)
  }
  return next
}

export function assetsHeadersFile(): string {
  return `/*\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`
}
