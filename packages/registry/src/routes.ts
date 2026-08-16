export type RegistryPath =
  | { kind: "root" }
  | { kind: "ping" }
  | { kind: "packument"; name: string }
  | { kind: "manifest"; name: string; spec: string }
  | { kind: "tarball"; name: string; version: string }
  | { kind: "dist-tags"; name: string }
  | { kind: "unknown-package"; name: string }

const PACKAGE = "cfnext"

function onlyCfnext<T extends { name: string }>(
  parsed: T,
): T | { kind: "unknown-package"; name: string } {
  return parsed.name === PACKAGE ? parsed : { kind: "unknown-package", name: parsed.name }
}

export function parseRegistryPath(pathname: string): RegistryPath {
  const path = decodeURIComponent(pathname.replace(/\/+$/, "") || "/")
  if (path === "/") return { kind: "root" }
  if (path === "/-/ping") return { kind: "ping" }

  const distTags = /^\/-\/package\/([^/]+)\/dist-tags$/.exec(path)
  if (distTags?.[1]) {
    return onlyCfnext({ kind: "dist-tags" as const, name: distTags[1] })
  }

  const tarball = /^\/([^/]+)\/-\/\1-(.+)\.tgz$/.exec(path)
  if (tarball?.[1] && tarball[2]) {
    return onlyCfnext({ kind: "tarball" as const, name: tarball[1], version: tarball[2] })
  }

  const two = /^\/([^/]+)\/([^/]+)$/.exec(path)
  if (two?.[1] && two[2] && !two[1].startsWith("-")) {
    return onlyCfnext({ kind: "manifest" as const, name: two[1], spec: two[2] })
  }

  const one = /^\/([^/]+)$/.exec(path)
  if (one?.[1] && !one[1].startsWith("-")) {
    return onlyCfnext({ kind: "packument" as const, name: one[1] })
  }

  return { kind: "unknown-package", name: path.replace(/^\//, "") }
}
