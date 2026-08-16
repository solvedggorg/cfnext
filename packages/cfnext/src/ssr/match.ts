import type { SsrHandlerRecord } from "./types"

export type { SsrHandlerRecord } from "./types"

export type MatchResult = {
  handler: SsrHandlerRecord
  params: Record<string, string | string[]>
  invocationPathname: string
}

export function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1)
  return pathname || "/"
}

export function stripRscSuffix(pathname: string): string {
  if (!pathname.endsWith(".rsc")) return pathname
  const stripped = pathname.slice(0, -4)
  return stripped || "/"
}

export function matchRoute(pathname: string, handlers: SsrHandlerRecord[]): MatchResult | null {
  const clean = stripRscSuffix(normalizePathname(pathname))
  let best: { result: MatchResult; specificity: number } | null = null

  for (const handler of handlers) {
    const pattern = stripRscSuffix(normalizePathname(handler.pathname))
    const hit = matchPattern(pattern, clean)
    if (!hit) continue
    if (!best || hit.specificity > best.specificity) {
      best = {
        specificity: hit.specificity,
        result: {
          handler,
          params: hit.params,
          invocationPathname: clean,
        },
      }
    }
  }

  return best?.result ?? null
}

function matchPattern(
  pattern: string,
  pathname: string,
): { params: Record<string, string | string[]>; specificity: number } | null {
  const patternSegs = splitPath(pattern)
  const pathSegs = splitPath(pathname)
  const params: Record<string, string | string[]> = {}
  let specificity = 0
  let pathIndex = 0

  for (let i = 0; i < patternSegs.length; i++) {
    const part = patternSegs[i]!

    if (part.startsWith("[[...") && part.endsWith("]]")) {
      params[part.slice(5, -2)] = pathSegs.slice(pathIndex)
      specificity += 1
      return { params, specificity }
    }

    if (part.startsWith("[...") && part.endsWith("]")) {
      if (pathIndex >= pathSegs.length) return null
      params[part.slice(4, -1)] = pathSegs.slice(pathIndex)
      specificity += 10
      return { params, specificity }
    }

    if (part.startsWith("[") && part.endsWith("]")) {
      if (pathIndex >= pathSegs.length) return null
      params[part.slice(1, -1)] = pathSegs[pathIndex]!
      specificity += 100
      pathIndex += 1
      continue
    }

    if (pathIndex >= pathSegs.length || pathSegs[pathIndex] !== part) return null
    specificity += 1000
    pathIndex += 1
  }

  if (pathIndex !== pathSegs.length) return null
  return { params, specificity }
}

function splitPath(pathname: string): string[] {
  if (pathname === "/") return []
  return pathname.replace(/^\//, "").split("/")
}
