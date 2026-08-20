import { copyFile, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"

import { inferName } from "../config"
import { parseJsonc, stringifyJsonc } from "../jsonc"
import { importWranglerMigrations } from "../migrations"
import type {
  CfnextBindings,
  CfnextEnvOverlay,
  CfnextFlagship,
  CfnextJson,
  CfnextObservability,
} from "../schema"
import { wranglerPath, type WranglerConfig } from "../wrangler"
import { GenerateError } from "./errors"
import { generate } from "./index"

const COMPILER_OWNED = new Set([
  "$schema",
  "name",
  "main",
  "build",
  "assets",
  "containers",
  "durable_objects",
  "migrations",
])

const MAPPED_KEYS = new Set([
  "compatibility_date",
  "compatibility_flags",
  "preview_urls",
  "workers_dev",
  "d1_databases",
  "r2_buckets",
  "kv_namespaces",
  "hyperdrive",
  "ai",
  "vectorize",
  "queues",
  "env",
  "vars",
  "secrets",
  "secrets_store_secrets",
  "workflows",
  "triggers",
  "version_metadata",
  "access",
  "observability",
  "logpush",
  "flagship",
  "send_email",
  "images",
  "stream",
  "media",
])

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function mapBindings(wrangler: WranglerConfig): CfnextBindings | undefined {
  const bindings: CfnextBindings = {}
  if (wrangler.d1_databases?.length) {
    bindings.d1 = wrangler.d1_databases.map((row) => ({
      binding: String(row.binding),
      databaseName: str(row.database_name),
      id: str(row.database_id),
      previewId: str(row.preview_database_id),
      migrationsDir: str(row.migrations_dir),
    }))
  }
  if (wrangler.r2_buckets?.length) {
    bindings.r2 = wrangler.r2_buckets.map((row) => ({
      binding: String(row.binding),
      bucketName: str(row.bucket_name),
      previewBucketName: str(row.preview_bucket_name),
      jurisdiction: str(row.jurisdiction),
    }))
  }
  if (wrangler.kv_namespaces?.length) {
    bindings.kv = wrangler.kv_namespaces.map((row) => ({
      binding: String(row.binding),
      id: str(row.id),
      previewId: str(row.preview_id),
    }))
  }
  if (wrangler.hyperdrive?.length) {
    bindings.hyperdrive = wrangler.hyperdrive.map((row) => ({
      binding: String(row.binding),
      id: str(row.id),
      localConnectionString: str(row.localConnectionString),
    }))
  }
  if (wrangler.vectorize?.length) {
    bindings.vectorize = wrangler.vectorize.map((row) => ({
      binding: String(row.binding),
      indexName: str(row.index_name),
    }))
  }
  if (wrangler.queues?.producers?.length || wrangler.queues?.consumers?.length) {
    const consumers = new Set((wrangler.queues.consumers ?? []).map((row) => String(row.queue)))
    const producers = wrangler.queues.producers ?? []
    const seen = new Set<string>()
    bindings.queues = []
    for (const row of producers) {
      const queue = String(row.queue)
      seen.add(queue)
      bindings.queues.push({
        binding: String(row.binding),
        queue,
        consume: consumers.has(queue),
      })
    }
    for (const row of wrangler.queues.consumers ?? []) {
      const queue = String(row.queue)
      if (seen.has(queue)) continue
      bindings.queues.push({ binding: queue.toUpperCase(), queue, consume: true, produce: false })
    }
  }
  if (wrangler.version_metadata?.binding) {
    bindings.versionMetadata = { binding: wrangler.version_metadata.binding }
  }
  return Object.keys(bindings).length > 0 ? bindings : undefined
}

function mapP1Fields(wrangler: WranglerConfig | Partial<WranglerConfig>, json: CfnextJson | CfnextEnvOverlay): void {
  if (wrangler.vars) json.vars = wrangler.vars
  if (wrangler.secrets?.required?.length) {
    json.secrets = { ...json.secrets, required: wrangler.secrets.required }
  }
  if (wrangler.secrets_store_secrets?.length) {
    json.secrets = {
      ...json.secrets,
      store: wrangler.secrets_store_secrets.map((row) => ({
        binding: String(row.binding),
        storeId: String(row.store_id),
        secretName: String(row.secret_name),
      })),
    }
  }
  if (wrangler.workflows?.length) {
    json.workflows = wrangler.workflows.map((row) => ({
      name: String(row.name),
      binding: String(row.binding),
      className: String(row.class_name),
      ...(row.script_name ? { scriptName: String(row.script_name) } : {}),
    }))
  }
  if (wrangler.triggers?.crons?.length) json.cron = wrangler.triggers.crons
  const userDos = (wrangler.durable_objects?.bindings ?? []).filter((row) => row.name !== "NEXT_APP")
  if (userDos.length) {
    json.durableObjects = userDos.map((row) => ({
      binding: row.name,
      className: row.class_name,
      ...(row.script_name ? { scriptName: row.script_name } : {}),
    }))
  }
}

function mapObservability(
  obs: NonNullable<WranglerConfig["observability"]>,
): CfnextObservability {
  const out: CfnextObservability = { enabled: obs.enabled }
  if (obs.head_sampling_rate != null) out.headSamplingRate = obs.head_sampling_rate
  if (obs.logs) {
    out.logs = {
      ...(obs.logs.enabled != null ? { enabled: obs.logs.enabled } : {}),
      ...(obs.logs.head_sampling_rate != null ? { headSamplingRate: obs.logs.head_sampling_rate } : {}),
      ...(obs.logs.invocation_logs != null ? { invocationLogs: obs.logs.invocation_logs } : {}),
      ...(obs.logs.persist != null ? { persist: obs.logs.persist } : {}),
      ...(obs.logs.destinations ? { destinations: obs.logs.destinations } : {}),
    }
  }
  if (obs.traces) {
    out.traces = {
      ...(obs.traces.enabled != null ? { enabled: obs.traces.enabled } : {}),
      ...(obs.traces.head_sampling_rate != null ? { headSamplingRate: obs.traces.head_sampling_rate } : {}),
      ...(obs.traces.persist != null ? { persist: obs.traces.persist } : {}),
      ...(obs.traces.destinations ? { destinations: obs.traces.destinations } : {}),
    }
  }
  return out
}

function mapFlagship(rows: NonNullable<WranglerConfig["flagship"]>): CfnextFlagship {
  const mapped = rows.map((row) => ({
    binding: String(row.binding),
    ...(row.app_id ? { appId: String(row.app_id) } : {}),
    ...(row.remote ? { remote: true } : {}),
  }))
  return mapped.length === 1 ? mapped[0]! : mapped
}

function mapP2Fields(wrangler: WranglerConfig | Partial<WranglerConfig>, json: CfnextJson | CfnextEnvOverlay): void {
  if (wrangler.observability) json.observability = mapObservability(wrangler.observability)
  if (typeof wrangler.logpush === "boolean") json.logpush = { enabled: wrangler.logpush }
  if (wrangler.flagship?.length) json.flagship = mapFlagship(wrangler.flagship)
}

function mapP3Fields(wrangler: WranglerConfig | Partial<WranglerConfig>, json: CfnextJson | CfnextEnvOverlay): void {
  const sending = wrangler.send_email?.[0]
  if (sending) {
    json.email = {
      ...json.email,
      sending: {
        binding: sending.name,
        ...(sending.destination_address ? { destinationAddress: sending.destination_address } : {}),
        ...(sending.allowed_destination_addresses?.length
          ? { allowedDestinations: sending.allowed_destination_addresses }
          : {}),
        ...(sending.allowed_sender_addresses?.length
          ? { allowedSenders: sending.allowed_sender_addresses }
          : {}),
        ...(sending.remote ? { remote: true } : {}),
      },
    }
  }
  if (wrangler.images?.binding || wrangler.stream?.binding || wrangler.media?.binding) {
    json.media = { ...json.media }
    if (wrangler.images?.binding) {
      json.media.images = {
        ...json.media.images,
        binding: wrangler.images.binding,
        ...(wrangler.images.remote ? { remote: true } : {}),
      }
    }
    if (wrangler.stream?.binding) {
      json.media.stream = {
        binding: wrangler.stream.binding,
        ...(wrangler.stream.remote ? { remote: true } : {}),
      }
    }
    if (wrangler.media?.binding) {
      json.media.transforms = {
        binding: wrangler.media.binding,
        ...(wrangler.media.remote ? { remote: true } : {}),
      }
    }
  }
}

function wranglerToOverlay(wrangler: Partial<WranglerConfig>): CfnextEnvOverlay {
  const overlay: CfnextEnvOverlay = {}
  if (wrangler.compatibility_date) overlay.compatibilityDate = wrangler.compatibility_date
  if (wrangler.compatibility_flags) overlay.compatibilityFlags = wrangler.compatibility_flags
  if (wrangler.workers_dev !== undefined) overlay.workersDev = wrangler.workers_dev
  if (wrangler.preview_urls !== undefined) overlay.previewUrls = wrangler.preview_urls
  if (wrangler.vars) overlay.vars = wrangler.vars
  const bindings = mapBindings(wrangler as WranglerConfig)
  if (bindings) overlay.bindings = bindings
  if (wrangler.ai?.binding) overlay.ai = { binding: wrangler.ai.binding }
  mapP1Fields(wrangler, overlay)
  mapP2Fields(wrangler, overlay)
  mapP3Fields(wrangler, overlay)
  const passthrough: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(wrangler)) {
    if (COMPILER_OWNED.has(key) || MAPPED_KEYS.has(key) || key === "vars") continue
    if (value !== undefined) passthrough[key] = value
  }
  if (Object.keys(passthrough).length > 0) overlay.passthrough = passthrough
  return overlay
}

export function wranglerToCfnextJson(wrangler: WranglerConfig, fallbackName: string): CfnextJson {
  const target = wrangler.containers
    ? "container"
    : wrangler.compatibility_flags?.includes("nodejs_compat")
      ? "ssr"
      : "workers"

  const json: CfnextJson = {
    $schema: "./node_modules/cfnext/schema/cfnext.schema.json",
    name: wrangler.name || fallbackName,
    target,
  }
  if (wrangler.compatibility_date) json.compatibilityDate = wrangler.compatibility_date
  if (wrangler.compatibility_flags) json.compatibilityFlags = wrangler.compatibility_flags
  if (wrangler.workers_dev !== undefined) json.workersDev = wrangler.workers_dev
  if (wrangler.preview_urls !== undefined) json.previewUrls = wrangler.preview_urls
  const bindings = mapBindings(wrangler)
  if (bindings) json.bindings = bindings
  if (wrangler.ai?.binding) json.ai = { binding: wrangler.ai.binding }
  mapP1Fields(wrangler, json)
  mapP2Fields(wrangler, json)
  mapP3Fields(wrangler, json)
  if (wrangler.access?.dev) {
    json.access = { ...json.access, dev: wrangler.access.dev }
  }
  const migrations = importWranglerMigrations(wrangler.migrations)
  if (migrations) json.migrations = migrations

  if (wrangler.env) {
    json.env = {}
    for (const [name, block] of Object.entries(wrangler.env)) {
      json.env[name] = wranglerToOverlay(block)
    }
  }

  const passthrough: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(wrangler)) {
    if (COMPILER_OWNED.has(key) || MAPPED_KEYS.has(key)) continue
    if (value !== undefined) passthrough[key] = value
  }
  if (Object.keys(passthrough).length > 0) json.passthrough = passthrough
  return json
}

export async function migrateWrangler(
  projectDir: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const path = wranglerPath(projectDir)
  if (!existsSync(path)) throw new GenerateError("No wrangler.jsonc to migrate")
  const dest = join(projectDir, "cfnext.json")
  if (existsSync(dest) && !opts.force) {
    throw new GenerateError("cfnext.json already exists. Pass --force to overwrite (writes cfnext.json.bak).")
  }
  const raw = await readFile(path, "utf8")
  const wrangler = parseJsonc<WranglerConfig>(raw)
  const json = wranglerToCfnextJson(wrangler, inferName(projectDir))
  if (existsSync(dest)) await copyFile(dest, `${dest}.bak`)
  await writeFile(dest, stringifyJsonc(json))
  await copyFile(path, `${path}.bak`)
  await generate(projectDir, { force: true })
}
