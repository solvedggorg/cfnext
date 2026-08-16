import { CATALOG, findVersion } from "./catalog"
import { buildPackument, buildVersionManifest } from "./packument"
import { enforceLimits, type Limiters } from "./rate-limit"
import { parseRegistryPath } from "./routes"
import { packVersionTarball } from "./tar"

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60",
}

function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extra },
  })
}

function wantsAbbreviated(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes("application/vnd.npm.install-v1+json")
}

export async function handleRegistry(request: Request, env: Limiters): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method not allowed — this registry is read-only" }, 405, {
      allow: "GET, HEAD",
    })
  }

  const url = new URL(request.url)
  const parsed = parseRegistryPath(url.pathname)
  const tarball = parsed.kind === "tarball"
  const skipLimit = parsed.kind === "root"

  if (!skipLimit) {
    const blocked = await enforceLimits(request, env, tarball ? "tarball" : "meta")
    if (blocked) return blocked
  }

  switch (parsed.kind) {
    case "root":
      return json({
        name: "solved-registry1",
        registry: "https://registry1.solved.gg",
        package: "cfnext",
        versions: CATALOG.versions.map((item) => item.version),
        "dist-tags": CATALOG.distTags,
        limits: {
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
          origin: url.origin,
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
        origin: url.origin,
        version: parsed.spec,
      })
      if (!manifest) return json({ error: "version not found" }, 404)
      return json(manifest)
    }
    case "tarball": {
      if (!findVersion(CATALOG, parsed.version)) {
        return json({ error: "version not found" }, 404)
      }
      const bytes = packVersionTarball(CATALOG, parsed.version)
      return new Response(Uint8Array.from(bytes), {
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
      return json({ error: `package not found: ${parsed.name}` }, 404)
  }
}
