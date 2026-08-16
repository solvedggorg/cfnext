import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

export type DeployTarget = "workers" | "ssr" | "container"

export type ProtectShell = {
  prefix: string
  asset: string
}

export type ProtectConfig = {
  prefixes: string[]
  signInPath: string
  sessionCookiePattern: string
  shells: ProtectShell[]
}

export type CfnextConfig = {
  name: string
  target: DeployTarget
  protect: ProtectConfig
  images: {
    unoptimized: boolean
  }
  securityHeaders: boolean
}

export type CfnextUserConfig = {
  name?: string
  target?: DeployTarget
  protect?: Partial<Omit<ProtectConfig, "shells">> & {
    shells?: ProtectShell[]
  }
  images?: {
    unoptimized?: boolean
  }
  securityHeaders?: boolean
}

export const DEFAULT_PROTECT: ProtectConfig = {
  prefixes: [],
  signInPath: "/sign-in",
  sessionCookiePattern: "(?:^|;\\s*)(__session|__client_uat)=",
  shells: [],
}

export function defaultConfig(name = "app"): CfnextConfig {
  return {
    name,
    target: "workers",
    protect: { ...DEFAULT_PROTECT, shells: [] },
    images: { unoptimized: true },
    securityHeaders: true,
  }
}

export function normalizeConfig(
  input: CfnextUserConfig | undefined,
  fallbackName = "app",
): CfnextConfig {
  const base = defaultConfig(fallbackName)
  if (!input) return base
  return {
    name: input.name ?? base.name,
    target: input.target ?? base.target,
    protect: {
      prefixes: input.protect?.prefixes ?? base.protect.prefixes,
      signInPath: input.protect?.signInPath ?? base.protect.signInPath,
      sessionCookiePattern:
        input.protect?.sessionCookiePattern ?? base.protect.sessionCookiePattern,
      shells: input.protect?.shells ?? [],
    },
    images: {
      unoptimized: input.images?.unoptimized ?? (input.target === "container" ? false : true),
    },
    securityHeaders: input.securityHeaders ?? base.securityHeaders,
  }
}

const CONFIG_FILES = ["cfnext.config.ts", "cfnext.config.mjs", "cfnext.config.js"]

export async function loadConfig(projectDir: string, fallbackName?: string): Promise<CfnextConfig> {
  const inferred = fallbackName ?? inferName(projectDir)
  for (const file of CONFIG_FILES) {
    const path = join(projectDir, file)
    if (!existsSync(path)) continue
    const mod = (await import(pathToFileURL(path).href)) as {
      default?: CfnextUserConfig
    }
    return normalizeConfig(mod.default, inferred)
  }
  return defaultConfig(inferred)
}

export function inferName(projectDir: string): string {
  const base = projectDir.replace(/\\/g, "/").split("/").filter(Boolean).at(-1)
  const slug = (base ?? "app")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "app"
}
