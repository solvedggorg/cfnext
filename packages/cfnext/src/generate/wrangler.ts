import { CatalogError, emitImplementedBindings, ensureP2ObservabilityDefaults } from "../catalog"
import { COMPATIBILITY_DATE } from "../constants"
import type { CfnextConfig } from "../config"
import { assertMigrationsMatchLive, MigrationError, seedContainerMigration } from "../migrations"
import type { CfnextBindings, CfnextEnvOverlay, CfnextJson } from "../schema"
import { buildWrangler, type WranglerConfig } from "../wrangler"
import { GenerateError } from "./errors"
import { GENERATED_WORKER } from "./worker"

const FORBIDDEN_ENV = new Set(["preview", "production"])

const NON_INHERITABLE = [
  "vars",
  "secrets",
  "secrets_store_secrets",
  "d1_databases",
  "kv_namespaces",
  "r2_buckets",
  "hyperdrive",
  "vectorize",
  "queues",
  "ai",
  "durable_objects",
  "workflows",
  "migrations",
  "triggers",
  "version_metadata",
  "flagship",
  "send_email",
  "images",
  "stream",
  "media",
] as const

function mergeBindingArrays<T extends { binding: string; omit?: boolean }>(
  base: T[] | undefined,
  overlay: T[] | undefined,
): T[] | undefined {
  if (!overlay) return base
  const map = new Map<string, T>()
  for (const item of base ?? []) map.set(item.binding, { ...item })
  for (const item of overlay) {
    if (item.omit) {
      map.delete(item.binding)
      continue
    }
    map.set(item.binding, { ...map.get(item.binding), ...item })
  }
  return [...map.values()]
}

export function mergeBindings(
  base: CfnextBindings | undefined,
  overlay: CfnextBindings | undefined,
): CfnextBindings | undefined {
  if (!overlay) return base
  return {
    ...base,
    d1: mergeBindingArrays(base?.d1, overlay.d1),
    kv: mergeBindingArrays(base?.kv, overlay.kv),
    r2: mergeBindingArrays(base?.r2, overlay.r2),
    hyperdrive: mergeBindingArrays(base?.hyperdrive, overlay.hyperdrive),
    vectorize: mergeBindingArrays(base?.vectorize, overlay.vectorize),
    queues: mergeBindingArrays(base?.queues, overlay.queues),
  }
}

function emptyWrangler(name: string): WranglerConfig {
  return { name, main: "worker.ts", compatibility_date: COMPATIBILITY_DATE }
}

function pickNonInheritable(source: WranglerConfig): Partial<WranglerConfig> {
  const out: Partial<WranglerConfig> = {}
  for (const key of NON_INHERITABLE) {
    const value = source[key]
    if (value !== undefined) (out as Record<string, unknown>)[key] = value
  }
  return out
}

export function compileWrangler(config: CfnextConfig, json: CfnextJson): WranglerConfig {
  if (json.env) {
    for (const key of Object.keys(json.env)) {
      if (FORBIDDEN_ENV.has(key)) {
        throw new GenerateError(
          `env.${key} is illegal. Use env.staging for a second Worker, previewId for local IDs, access.protectPreview for preview URLs.`,
        )
      }
    }
  }

  const wrangler = buildWrangler(config)
  if (json.compatibilityDate) wrangler.compatibility_date = json.compatibilityDate
  if (json.compatibilityFlags) wrangler.compatibility_flags = json.compatibilityFlags
  if (json.workersDev !== undefined) wrangler.workers_dev = json.workersDev
  if (json.previewUrls !== undefined) wrangler.preview_urls = json.previewUrls

  const resolved = seedContainerMigration({ ...json, target: json.target ?? config.target })
  try {
    assertMigrationsMatchLive(resolved)
    emitImplementedBindings(resolved, wrangler, config.name)
  } catch (error) {
    if (error instanceof CatalogError || error instanceof MigrationError) {
      throw new GenerateError(error.message)
    }
    throw error
  }

  ensureP2ObservabilityDefaults(wrangler)

  if (json.passthrough) {
    Object.assign(wrangler, json.passthrough)
  }

  if (json.env) {
    wrangler.env = { ...wrangler.env }
    for (const [name, overlay] of Object.entries(json.env)) {
      wrangler.env[name] = compileEnvBlock(config.name, json, overlay, name)
    }
  }

  if ("previews" in wrangler) delete (wrangler as { previews?: unknown }).previews
  if (!wrangler.build?.command) {
    wrangler.build = { ...wrangler.build, command: "bun --bun next build" }
  }
  wrangler.main = GENERATED_WORKER
  return wrangler
}

const UNIMPLEMENTED_OVERLAY = [
  "durableObjects",
  "workflows",
  "agents",
  "cron",
  "analytics",
] as const

function compileEnvBlock(
  app: string,
  base: CfnextJson,
  overlay: CfnextEnvOverlay,
  envName: string,
): Partial<WranglerConfig> {
  if ("name" in overlay || "target" in overlay) {
    throw new GenerateError("env overlays must not set name or target")
  }
  if (overlay.access !== undefined) {
    throw new GenerateError(
      `env.${envName}.access is not supported. Access is configured at the top level.`,
    )
  }
  for (const key of UNIMPLEMENTED_OVERLAY) {
    if (overlay[key] !== undefined) {
      throw new GenerateError(`env.${envName}.${key} is not implemented in this version`)
    }
  }
  const merged: CfnextJson = {
    name: app,
    target: base.target,
    bindings: mergeBindings(base.bindings, overlay.bindings),
    ai: overlay.ai ?? base.ai,
    vars: overlay.vars ?? base.vars,
    secrets: overlay.secrets ?? base.secrets,
    durableObjects: base.durableObjects,
    workflows: base.workflows,
    cron: base.cron,
    flagship: overlay.flagship ?? base.flagship,
    observability: overlay.observability,
    logpush: overlay.logpush,
    email: overlay.email ?? base.email,
    media: overlay.media ?? base.media,
  }
  const fragment = emptyWrangler(app)
  try {
    emitImplementedBindings(merged, fragment, app)
  } catch (error) {
    if (error instanceof CatalogError || error instanceof MigrationError) {
      throw new GenerateError(error.message)
    }
    throw error
  }
  const block = pickNonInheritable(fragment)
  if (overlay.observability) block.observability = fragment.observability
  if (overlay.logpush) block.logpush = fragment.logpush
  if (overlay.vars) block.vars = overlay.vars
  if (overlay.compatibilityDate) block.compatibility_date = overlay.compatibilityDate
  if (overlay.compatibilityFlags) block.compatibility_flags = overlay.compatibilityFlags
  if (overlay.workersDev !== undefined) block.workers_dev = overlay.workersDev
  if (overlay.previewUrls !== undefined) block.preview_urls = overlay.previewUrls
  if (overlay.passthrough) Object.assign(block, overlay.passthrough)
  return block
}
