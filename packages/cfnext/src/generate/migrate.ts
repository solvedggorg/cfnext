import { copyFile, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"

import { inferName } from "../config"
import { parseJsonc, stringifyJsonc } from "../jsonc"
import type { CfnextBindings, CfnextEnvOverlay, CfnextJson } from "../schema"
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
  if (wrangler.queues?.producers?.length) {
    bindings.queues = wrangler.queues.producers.map((row) => ({
      binding: String(row.binding),
      queue: String(row.queue),
    }))
  }
  return Object.keys(bindings).length > 0 ? bindings : undefined
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
