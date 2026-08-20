export type CfnextImageLoaderProps = {
  src: string
  width: number
  quality?: number
}

export type CfnextRemotePattern = {
  protocol?: string
  hostname?: string
  port?: string
  pathname?: string
}

export type CfnextImageLoaderConfig = {
  kind: "cdn-cgi" | "imagedelivery"
  zoneOrigin?: string
  accountHash?: string
  remotePatterns?: CfnextRemotePattern[]
}

function wildcardHost(pattern: string, host: string): boolean {
  if (pattern === host) return true
  if (!pattern.startsWith("*.")) return false
  const suffix = pattern.slice(1)
  return host.endsWith(suffix) && host.length > suffix.length
}

function matchRemotePattern(pattern: CfnextRemotePattern, url: URL): boolean {
  if (pattern.protocol && url.protocol !== `${pattern.protocol}:`) return false
  if (pattern.hostname && !wildcardHost(pattern.hostname, url.hostname)) return false
  if (pattern.port && url.port !== pattern.port) return false
  if (pattern.pathname) {
    const prefix = pattern.pathname.replace(/\*.*$/, "")
    if (!url.pathname.startsWith(prefix)) return false
  }
  return true
}

function zoneOriginHost(zoneOrigin: string): string | null {
  try {
    return new URL(zoneOrigin).hostname
  } catch {
    return null
  }
}

export function srcAllowed(src: string, config: CfnextImageLoaderConfig): boolean {
  if (!src.startsWith("http://") && !src.startsWith("https://")) {
    return src.startsWith("/")
  }
  let url: URL
  try {
    url = new URL(src)
  } catch {
    return false
  }
  const originHost = config.zoneOrigin ? zoneOriginHost(config.zoneOrigin) : null
  if (originHost && url.hostname === originHost) return true
  return (config.remotePatterns ?? []).some((pattern) => matchRemotePattern(pattern, url))
}

function stripLeadingSlash(path: string): string {
  return path.replace(/^\/+/, "")
}

export function buildCfnextImageUrl(
  { src, width, quality }: CfnextImageLoaderProps,
  config: CfnextImageLoaderConfig,
): string {
  const q = quality ?? 75
  if (config.kind === "imagedelivery") {
    if (!config.accountHash) return src
    const id = stripLeadingSlash(src)
    return `https://imagedelivery.net/${config.accountHash}/${id}/w=${width},q=${q}`
  }
  if (!config.zoneOrigin) return src
  if (!srcAllowed(src, config)) return src
  const origin = config.zoneOrigin.replace(/\/+$/, "")
  const source = src.startsWith("http://") || src.startsWith("https://") ? src : stripLeadingSlash(src)
  return `${origin}/cdn-cgi/image/width=${width},quality=${q},format=auto/${source}`
}

export default function cfnextImageLoader(props: CfnextImageLoaderProps): string {
  return props.src
}
