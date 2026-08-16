export interface RateLimit {
  limit: (options: { key: string }) => Promise<{ success: boolean }>
}

export type Limiters = {
  META_LIMIT: RateLimit
  TARBALL_LIMIT: RateLimit
  GLOBAL_LIMIT: RateLimit
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("cf-connecting-ip")
  if (forwarded) return forwarded
  const xff = request.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0]?.trim() || "local"
  return "local"
}

export function tooManyRequests(): Response {
  return new Response(JSON.stringify({ error: "rate limit exceeded" }), {
    status: 429,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "retry-after": "60",
      "cache-control": "no-store",
    },
  })
}

export async function enforceLimits(
  request: Request,
  env: Limiters,
  kind: "meta" | "tarball",
): Promise<Response | null> {
  const actor = clientKey(request)
  const global = await env.GLOBAL_LIMIT.limit({ key: `global:${actor}` })
  if (!global.success) return tooManyRequests()
  const bucket = kind === "tarball" ? env.TARBALL_LIMIT : env.META_LIMIT
  const specific = await bucket.limit({ key: `${kind}:${actor}` })
  if (!specific.success) return tooManyRequests()
  return null
}
