import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { CFNEXT_JSON_FILES, HOOKS_FILE, LEGACY_CONFIG_FILES } from "./constants"
import { parseJsonc } from "./jsonc"
import type { CfnextJson } from "./schema"

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

const CONFIG_FILES = [...LEGACY_CONFIG_FILES]

export type LoadedProject = {
  dir: string
  json: CfnextJson | null
  jsonPath: string | null
  jsonRaw: string | null
  hooksPath: string | null
  hooksHasClerkShells: boolean
  config: CfnextConfig
}

export function findCfnextJson(projectDir: string): string | null {
  for (const file of CFNEXT_JSON_FILES) {
    const path = join(projectDir, file)
    if (existsSync(path)) return path
  }
  return null
}

const PRODUCT_HOOK_KEYS = [
  "bindings",
  "access",
  "observability",
  "email",
  "ai",
  "media",
  "flagship",
  "agents",
  "workflows",
  "durableObjects",
  "migrations",
  "secrets",
  "vars",
  "env",
  "cron",
  "logpush",
  "passthrough",
] as const

export async function loadProject(projectDir: string, fallbackName?: string): Promise<LoadedProject> {
  const inferred = fallbackName ?? inferName(projectDir)
  const jsonPath = findCfnextJson(projectDir)
  let json: CfnextJson | null = null
  let jsonRaw: string | null = null
  if (jsonPath) {
    jsonRaw = await readFile(jsonPath, "utf8")
    json = parseJsonc<CfnextJson>(jsonRaw)
  }

  const hooksPath = join(projectDir, HOOKS_FILE)
  const hasHooks = existsSync(hooksPath)
  type HooksModule = {
    clerkShells?: () => CfnextConfig["protect"]["shells"]
    protect?: CfnextUserConfig["protect"]
    [key: string]: unknown
  }
  let hooksMod: HooksModule | null = null
  if (hasHooks) {
    hooksMod = (await import(pathToFileURL(hooksPath).href)) as HooksModule
    for (const key of PRODUCT_HOOK_KEYS) {
      if (key in hooksMod) {
        throw new Error(`cfnext.hooks.ts must not set product field "${key}". Put it in cfnext.json.`)
      }
    }
  }

  let tsConfig: CfnextUserConfig | undefined
  for (const file of CONFIG_FILES) {
    const path = join(projectDir, file)
    if (!existsSync(path)) continue
    const mod = (await import(pathToFileURL(path).href)) as { default?: CfnextUserConfig }
    tsConfig = mod.default
    break
  }

  const fromJson: CfnextUserConfig | undefined = json
    ? {
        name: json.name,
        target: json.target,
        protect: json.protect,
        images: json.images,
        securityHeaders: json.securityHeaders,
      }
    : undefined

  const merged: CfnextUserConfig = {
    ...fromJson,
    ...tsConfig,
    name: fromJson?.name ?? tsConfig?.name,
    target: fromJson?.target ?? tsConfig?.target,
    protect: {
      ...fromJson?.protect,
      ...tsConfig?.protect,
      ...hooksMod?.protect,
    },
    images: fromJson?.images ?? tsConfig?.images,
    securityHeaders: fromJson?.securityHeaders ?? tsConfig?.securityHeaders,
  }

  const config = normalizeConfig(merged, inferred)
  if (hooksMod?.clerkShells && config.protect.shells.length === 0) {
    config.protect.shells = hooksMod.clerkShells()
  }

  return {
    dir: projectDir,
    json,
    jsonPath,
    jsonRaw,
    hooksPath: hasHooks ? hooksPath : null,
    hooksHasClerkShells: Boolean(hooksMod?.clerkShells),
    config,
  }
}

export async function loadConfig(projectDir: string, fallbackName?: string): Promise<CfnextConfig> {
  const project = await loadProject(projectDir, fallbackName)
  return project.config
}

export function inferName(projectDir: string): string {
  const base = projectDir.replace(/\\/g, "/").split("/").filter(Boolean).at(-1)
  const slug = (base ?? "app")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "app"
}
