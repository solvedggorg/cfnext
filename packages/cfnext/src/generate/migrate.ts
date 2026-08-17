import { copyFile, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"

import { inferName } from "../config"
import { parseJsonc, stringifyJsonc } from "../jsonc"
import type { CfnextJson } from "../schema"
import { wranglerPath, type WranglerConfig } from "../wrangler"
import { GenerateError } from "./errors"
import { generate } from "./index"

const MANAGED_KEYS = new Set([
  "$schema",
  "name",
  "main",
  "compatibility_date",
  "compatibility_flags",
  "preview_urls",
  "workers_dev",
  "build",
  "observability",
  "assets",
  "containers",
  "durable_objects",
  "migrations",
  "d1_databases",
  "r2_buckets",
  "kv_namespaces",
  "hyperdrive",
  "ai",
  "vectorize",
  "queues",
  "env",
])

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  return undefined
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
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
    bindings: {},
  }

  if (wrangler.d1_databases?.length) {
    json.bindings!.d1 = wrangler.d1_databases.map((row) => ({
      binding: String(row.binding),
      databaseName: str(row.database_name),
      id: str(row.database_id),
      previewId: str(row.preview_database_id),
      migrationsDir: str(row.migrations_dir),
    }))
  }
  if (wrangler.r2_buckets?.length) {
    json.bindings!.r2 = wrangler.r2_buckets.map((row) => ({
      binding: String(row.binding),
      bucketName: str(row.bucket_name),
      previewBucketName: str(row.preview_bucket_name),
      jurisdiction: str(row.jurisdiction),
    }))
  }
  if (wrangler.kv_namespaces?.length) {
    json.bindings!.kv = wrangler.kv_namespaces.map((row) => ({
      binding: String(row.binding),
      id: str(row.id),
      previewId: str(row.preview_id),
    }))
  }
  if (wrangler.hyperdrive?.length) {
    json.bindings!.hyperdrive = wrangler.hyperdrive.map((row) => ({
      binding: String(row.binding),
      id: str(row.id),
      localConnectionString: str(row.localConnectionString),
    }))
  }
  if (wrangler.vectorize?.length) {
    json.bindings!.vectorize = wrangler.vectorize.map((row) => ({
      binding: String(row.binding),
      indexName: str(row.index_name),
    }))
  }
  if (wrangler.queues?.producers?.length) {
    json.bindings!.queues = wrangler.queues.producers.map((row) => ({
      binding: String(row.binding),
      queue: String(row.queue),
    }))
  }
  if (wrangler.ai?.binding) {
    json.ai = { binding: wrangler.ai.binding }
  }

  const passthrough: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(wrangler)) {
    if (!MANAGED_KEYS.has(key) && value !== undefined) passthrough[key] = value
  }
  if (Object.keys(passthrough).length > 0) json.passthrough = passthrough

  if (json.bindings && Object.keys(json.bindings).length === 0) delete json.bindings
  return json
}

export async function migrateWrangler(projectDir: string): Promise<void> {
  const path = wranglerPath(projectDir)
  if (!existsSync(path)) throw new GenerateError("No wrangler.jsonc to migrate")
  const raw = await readFile(path, "utf8")
  const wrangler = parseJsonc<WranglerConfig>(raw)
  const json = wranglerToCfnextJson(wrangler, inferName(projectDir))
  const dest = join(projectDir, "cfnext.json")
  await writeFile(dest, stringifyJsonc(json))
  await copyFile(path, `${path}.bak`)
  await generate(projectDir, { force: true })
}
