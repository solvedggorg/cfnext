import {
  clerkShellPath,
  hasClerkSession,
  isProtectedPath,
  signInRedirect,
} from "./protect.mjs"

export type WorkerEnv = {
  ASSETS: {
    fetch: (
      input: Request | URL | string,
      init?: RequestInit
    ) => Promise<Response>
  }
}

const SECURITY_HEADERS: [string, string][] = [
  ["X-Frame-Options", "DENY"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  [
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  ],
]

function withSecurity(response: Response) {
  const next = new Response(response.body, response)
  for (const [key, value] of SECURITY_HEADERS) {
    if (!next.headers.has(key)) next.headers.set(key, value)
  }
  return next
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url)

    if (isProtectedPath(url.pathname) && !hasClerkSession(request)) {
      return signInRedirect(request)
    }

    const asset = await env.ASSETS.fetch(request)
    if (asset.status !== 404) return withSecurity(asset)

    const shell = clerkShellPath(url.pathname)
    if (shell) {
      const fallback = await env.ASSETS.fetch(new URL(`/${shell}`, url.origin))
      if (fallback.ok) return withSecurity(fallback)
    }

    return withSecurity(asset)
  },
}
