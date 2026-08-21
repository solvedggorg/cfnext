import { CATALOG, findVersion } from "./catalog"
import { buildPackument, buildVersionManifest } from "./packument"
import { enforceLimits, type Limiters } from "./rate-limit"
import { parseRegistryPath } from "./routes"
import { embeddedTarball } from "./embedded"

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60",
}

const NPM_UPSTREAM = "https://registry.npmjs.org"
const UPSTREAM_HEADERS = ["content-type", "cache-control", "etag", "last-modified"]

function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extra },
  })
}

function wantsAbbreviated(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes("application/vnd.npm.install-v1+json")
}

// Tarball/dist URLs follow the inbound Host (like npm itself), so installs
// against localhost or any mirror get self-consistent absolute URLs.
// wrangler dev presents the custom-domain URL even on 127.0.0.1.
function requestOrigin(request: Request, url: URL): string {
  const host = request.headers.get("host")
  if (!host) return url.origin
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
  const scheme = isLocal ? "http" : url.protocol.replace(":", "")
  return `${scheme}://${host}`
}

// Every package except cfnext streams through to npm. This is what makes a
// global/project-wide registry override safe: non-cfnext deps resolve
// normally. Proxied traffic skips the cfnext rate limits.
async function proxyUpstream(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const headers = new Headers()
  const accept = request.headers.get("accept")
  if (accept) headers.set("accept", accept)
  let upstream: Response
  try {
    upstream = await fetch(`${NPM_UPSTREAM}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      redirect: "follow",
    })
  } catch (error) {
    console.error(`proxy ${url.pathname} failed:`, error)
    return json({ error: "upstream registry unavailable" }, 502)
  }
  const responseHeaders = new Headers()
  for (const key of UPSTREAM_HEADERS) {
    const value = upstream.headers.get(key)
    if (value) responseHeaders.set(key, value)
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}

export async function handleRegistry(request: Request, env: Limiters): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method not allowed — this registry is read-only" }, 405, {
      allow: "GET, HEAD",
    })
  }

  const url = new URL(request.url)
  const origin = requestOrigin(request, url)
  const parsed = parseRegistryPath(url.pathname)

  // root, ping, and proxied packages bypass the cfnext budgets.
  const limited =
    parsed.kind === "packument" ||
    parsed.kind === "manifest" ||
    parsed.kind === "tarball" ||
    parsed.kind === "dist-tags"
  if (limited) {
    const blocked = await enforceLimits(request, env, parsed.kind === "tarball" ? "tarball" : "meta")
    if (blocked) return blocked
  }

  switch (parsed.kind) {
    case "root":
      return json({
        name: "solved-registry1",
        registry: "https://registry1.solved.gg",
        package: CATALOG.name,
        versions: CATALOG.versions.map((item) => item.version),
        "dist-tags": CATALOG.distTags,
        passthrough: NPM_UPSTREAM,
        limits: {
          scope: "cfnext endpoints only; passthrough traffic is unlimited here",
          metadata: "8 / 60s / IP",
          tarball: "2 / 60s / IP",
          global: "10 / 60s / IP",
        },
      })
    case "ping":
      return json({})
    case "packument":
      return json(
        buildPackument({
          catalog: CATALOG,
          origin,
          abbreviated: wantsAbbreviated(request),
        }),
        200,
        wantsAbbreviated(request)
          ? { "content-type": "application/vnd.npm.install-v1+json; charset=utf-8" }
          : {},
      )
    case "manifest": {
      const manifest = buildVersionManifest({
        catalog: CATALOG,
        origin,
        version: parsed.spec,
      })
      if (!manifest) return json({ error: "version not found" }, 404)
      return json(manifest)
    }
    case "tarball": {
      if (!findVersion(CATALOG, parsed.version)) {
        return json({ error: "version not found" }, 404)
      }
      return new Response(Uint8Array.from(embeddedTarball()), {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": `attachment; filename="cfnext-${parsed.version}.tgz"`,
          "cache-control": "public, max-age=31536000, immutable",
        },
      })
    }
    case "dist-tags":
      return json({ ...CATALOG.distTags })
    case "unknown-package":
      return proxyUpstream(request)
  }
}
