import type {
  CfnextJson,
  D1Binding,
  HyperdriveBinding,
  KvBinding,
  QueueBinding,
  R2Binding,
  VectorizeBinding,
} from "./schema"
import { assertReservedDo, emitMigrations } from "./migrations"
import type { WranglerConfig } from "./wrangler"

export type CatalogKind = {
  kind: string
  aliases?: string[]
  wranglerKey?: string
  jsonPath: string
  add: boolean
  emitImplemented: boolean
  virtual?: boolean
  level: 0 | 1 | 2 | 3 | 4
  phase: "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "P6"
  singleton?: boolean
  reservedBindings?: string[]
  wranglerAllowlist: string[]
  defaults: (app: string) => { binding: string; resource?: string }
  emit?: (entry: unknown, wrangler: WranglerConfig) => void
  provision?: (entry: unknown, app: string) => string[] | null
}

export class CatalogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CatalogError"
  }
}

export function getAtPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

function isPresent(value: unknown): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object") return Object.keys(value).length > 0
  if (typeof value === "boolean") return true
  if (typeof value === "string") return value.length > 0
  return true
}

export function presentUnimplementedPaths(json: CfnextJson): string[] {
  const paths: string[] = []
  for (const kind of CATALOG) {
    if (kind.emitImplemented) continue
    if (isPresent(getAtPath(json, kind.jsonPath))) paths.push(kind.jsonPath)
  }
  return paths
}

function sameRecord(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if (left[key] !== right[key]) return false
  }
  return true
}

function pushUnique(
  list: Array<Record<string, unknown>> | undefined,
  item: Record<string, unknown>,
  key = "binding",
): Array<Record<string, unknown>> {
  const next = list ?? []
  const existing = next.find((entry) => entry[key] === item[key])
  if (!existing) {
    next.push(item)
    return next
  }
  if (!sameRecord(existing, item)) {
    throw new CatalogError(
      `binding ${String(item[key])} is already defined with different values`,
    )
  }
  return next
}

function provisionResource(entry: unknown, keys: string[], fallback: string): string {
  if (entry && typeof entry === "object") {
    const rec = entry as Record<string, unknown>
    for (const key of keys) {
      const value = rec[key]
      if (typeof value === "string" && value.length > 0) return value
    }
  }
  return fallback
}

function hyperdriveConnectionString(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new CatalogError("hyperdrive --provision requires DATABASE_URL")
  }
  return url
}

function emitD1(entry: unknown, wrangler: WranglerConfig): void {
  const item = entry as D1Binding
  const row: Record<string, unknown> = { binding: item.binding }
  if (item.databaseName) row.database_name = item.databaseName
  if (item.id) row.database_id = item.id
  if (item.previewId) row.preview_database_id = item.previewId
  if (item.migrationsDir) row.migrations_dir = item.migrationsDir
  if (item.remote) row.remote = true
  wrangler.d1_databases = pushUnique(wrangler.d1_databases, row)
}

function emitR2(entry: unknown, wrangler: WranglerConfig): void {
  const item = entry as R2Binding
  const row: Record<string, unknown> = { binding: item.binding }
  if (item.bucketName) row.bucket_name = item.bucketName
  if (item.previewBucketName) row.preview_bucket_name = item.previewBucketName
  if (item.jurisdiction) row.jurisdiction = item.jurisdiction
  if (item.remote) row.remote = true
  wrangler.r2_buckets = pushUnique(wrangler.r2_buckets, row)
}

function emitKv(entry: unknown, wrangler: WranglerConfig): void {
  const item = entry as KvBinding
  const row: Record<string, unknown> = { binding: item.binding }
  if (item.id) row.id = item.id
  if (item.previewId) row.preview_id = item.previewId
  if (item.remote) row.remote = true
  wrangler.kv_namespaces = pushUnique(wrangler.kv_namespaces, row)
}

function emitHyperdrive(entry: unknown, wrangler: WranglerConfig): void {
  const item = entry as HyperdriveBinding
  if (!item.id) {
    throw new CatalogError(
      `hyperdrive binding ${item.binding} requires id (wrangler schema). Pass --provision or set id.`,
    )
  }
  const row: Record<string, unknown> = { binding: item.binding, id: item.id }
  if (item.localConnectionString) row.localConnectionString = item.localConnectionString
  if (item.remote) row.remote = true
  wrangler.hyperdrive = pushUnique(wrangler.hyperdrive, row)
}

function emitAi(entry: unknown, wrangler: WranglerConfig): void {
  const item = entry as { binding?: string; remote?: boolean }
  wrangler.ai = { binding: item.binding ?? "AI" }
  if (item.remote) wrangler.ai.remote = true
}

function emitVectorize(entry: unknown, wrangler: WranglerConfig): void {
  const item = entry as VectorizeBinding
  const indexName = item.indexName
  if (!indexName) throw new CatalogError(`vectorize binding ${item.binding} requires indexName`)
  const row: Record<string, unknown> = { binding: item.binding, index_name: indexName }
  if (item.remote) row.remote = true
  wrangler.vectorize = pushUnique(wrangler.vectorize, row)
}

function emitQueue(entry: unknown, wrangler: WranglerConfig): void {
  const item = entry as QueueBinding
  if (!item.queue) throw new CatalogError(`queue binding ${item.binding} requires queue`)
  const queues = wrangler.queues ?? {}
  const producers = queues.producers ?? []
  if (item.produce !== false && !producers.some((row) => row.binding === item.binding)) {
    producers.push({ binding: item.binding, queue: item.queue })
  }
  const consumers = [...(queues.consumers ?? [])]
  if (item.consume && !consumers.some((row) => row.queue === item.queue)) {
    const row: Record<string, unknown> = { queue: item.queue }
    if (item.maxBatchSize != null) row.max_batch_size = item.maxBatchSize
    if (item.maxBatchTimeout != null) row.max_batch_timeout = item.maxBatchTimeout
    if (item.maxRetries != null) row.max_retries = item.maxRetries
    if (item.deadLetterQueue) row.dead_letter_queue = item.deadLetterQueue
    if (item.deliveryDelay != null) row.retry_delay = item.deliveryDelay
    consumers.push(row)
  }
  wrangler.queues = { ...queues, producers, ...(consumers.length > 0 ? { consumers } : {}) }
}

function emitDurableObjects(json: CfnextJson, wrangler: WranglerConfig): void {
  const bindings = [...(wrangler.durable_objects?.bindings ?? [])]
  if (json.target === "container" && !bindings.some((row) => row.name === "NEXT_APP")) {
    bindings.unshift({ name: "NEXT_APP", class_name: "NextApp" })
  }
  for (const item of json.durableObjects ?? []) {
    assertReservedDo(item)
    if (bindings.some((row) => row.name === item.binding)) continue
    bindings.push({
      name: item.binding,
      class_name: item.className,
      ...(item.scriptName ? { script_name: item.scriptName } : {}),
    })
  }
  if (bindings.length > 0) wrangler.durable_objects = { bindings }
  else delete wrangler.durable_objects
}

function emitWorkflows(json: CfnextJson, wrangler: WranglerConfig): void {
  for (const item of json.workflows ?? []) {
    const row: Record<string, unknown> = {
      name: item.name,
      binding: item.binding,
      class_name: item.className,
    }
    if (item.scriptName) row.script_name = item.scriptName
    if (item.schedules) {
      row.schedules = Array.isArray(item.schedules) ? item.schedules : [item.schedules]
    }
    wrangler.workflows = pushUnique(wrangler.workflows, row)
  }
}

function emitCron(json: CfnextJson, wrangler: WranglerConfig): void {
  if (!json.cron?.length) return
  wrangler.triggers = { ...wrangler.triggers, crons: json.cron }
}

function emitSecrets(json: CfnextJson, wrangler: WranglerConfig): void {
  if (json.secrets?.required?.length) {
    wrangler.secrets = { ...wrangler.secrets, required: json.secrets.required }
  }
  if (json.secrets?.store?.length) {
    for (const item of json.secrets.store) {
      wrangler.secrets_store_secrets = pushUnique(wrangler.secrets_store_secrets, {
        binding: item.binding,
        store_id: item.storeId,
        secret_name: item.secretName,
      })
    }
  }
}

function emitVars(json: CfnextJson, wrangler: WranglerConfig): void {
  if (!json.vars || Object.keys(json.vars).length === 0) return
  wrangler.vars = { ...wrangler.vars, ...json.vars }
}

function emitVersionMetadata(json: CfnextJson, wrangler: WranglerConfig): void {
  const vm = json.bindings?.versionMetadata
  if (vm === false) return
  if (vm && typeof vm === "object") {
    wrangler.version_metadata = { binding: vm.binding }
    return
  }
  const target = json.target ?? "workers"
  if (vm === true || target === "ssr" || target === "container") {
    wrangler.version_metadata = { binding: "CF_VERSION_METADATA" }
  }
}

export const CATALOG: CatalogKind[] = [
  {
    kind: "d1",
    aliases: ["database"],
    wranglerKey: "d1_databases",
    jsonPath: "bindings.d1",
    add: true,
    emitImplemented: true,
    level: 3,
    phase: "P0",
    wranglerAllowlist: [
      "binding",
      "database_name",
      "database_id",
      "preview_database_id",
      "migrations_dir",
      "remote",
    ],
    defaults: (app) => ({ binding: "DB", resource: `${app}-db` }),
    emit: emitD1,
    provision: (entry, app) => [
      "bun",
      "x",
      "wrangler",
      "d1",
      "create",
      provisionResource(entry, ["databaseName", "resource"], `${app}-db`),
    ],
  },
  {
    kind: "r2",
    wranglerKey: "r2_buckets",
    jsonPath: "bindings.r2",
    add: true,
    emitImplemented: true,
    level: 3,
    phase: "P0",
    wranglerAllowlist: ["binding", "bucket_name", "preview_bucket_name", "jurisdiction", "remote"],
    defaults: (app) => ({ binding: "BUCKET", resource: `${app}-bucket` }),
    emit: emitR2,
    provision: (entry, app) => [
      "bun",
      "x",
      "wrangler",
      "r2",
      "bucket",
      "create",
      provisionResource(entry, ["bucketName", "resource"], `${app}-bucket`),
    ],
  },
  {
    kind: "kv",
    wranglerKey: "kv_namespaces",
    jsonPath: "bindings.kv",
    add: true,
    emitImplemented: true,
    level: 3,
    phase: "P0",
    wranglerAllowlist: ["binding", "id", "preview_id", "remote"],
    defaults: (app) => ({ binding: "KV", resource: `${app}-kv` }),
    emit: emitKv,
    provision: (entry, app) => [
      "bun",
      "x",
      "wrangler",
      "kv",
      "namespace",
      "create",
      provisionResource(entry, ["resource"], `${app}-kv`),
    ],
  },
  {
    kind: "hyperdrive",
    wranglerKey: "hyperdrive",
    jsonPath: "bindings.hyperdrive",
    add: true,
    emitImplemented: true,
    level: 2,
    phase: "P0",
    wranglerAllowlist: ["binding", "id", "localConnectionString", "remote"],
    defaults: (app) => ({ binding: "HYPERDRIVE", resource: `${app}-hyperdrive` }),
    emit: emitHyperdrive,
    provision: (entry, app) => [
      "bun",
      "x",
      "wrangler",
      "hyperdrive",
      "create",
      provisionResource(entry, ["resource"], `${app}-hyperdrive`),
      "--connection-string",
      hyperdriveConnectionString(),
    ],
  },
  {
    kind: "ai",
    wranglerKey: "ai",
    jsonPath: "ai.binding",
    add: true,
    emitImplemented: true,
    singleton: true,
    level: 3,
    phase: "P0",
    wranglerAllowlist: ["binding", "remote"],
    defaults: () => ({ binding: "AI" }),
    emit: emitAi,
    provision: () => null,
  },
  {
    kind: "vectorize",
    wranglerKey: "vectorize",
    jsonPath: "bindings.vectorize",
    add: true,
    emitImplemented: true,
    level: 2,
    phase: "P0",
    wranglerAllowlist: ["binding", "index_name", "remote"],
    defaults: (app) => ({ binding: "VECTORIZE", resource: `${app}-index` }),
    emit: emitVectorize,
    provision: (entry, app) => [
      "bun",
      "x",
      "wrangler",
      "vectorize",
      "create",
      provisionResource(entry, ["indexName", "resource"], `${app}-index`),
      "--dimensions",
      "768",
      "--metric",
      "cosine",
    ],
  },
  {
    kind: "queue",
    aliases: ["queues"],
    wranglerKey: "queues",
    jsonPath: "bindings.queues",
    add: true,
    emitImplemented: true,
    level: 3,
    phase: "P0",
    wranglerAllowlist: [
      "binding",
      "queue",
      "max_batch_size",
      "max_batch_timeout",
      "max_retries",
      "dead_letter_queue",
      "retry_delay",
    ],
    defaults: (app) => ({ binding: "QUEUE", resource: `${app}-queue` }),
    emit: emitQueue,
    provision: (entry, app) => [
      "bun",
      "x",
      "wrangler",
      "queues",
      "create",
      provisionResource(entry, ["queue", "resource"], `${app}-queue`),
    ],
  },
  {
    kind: "do",
    aliases: ["durable-object", "durable-objects"],
    wranglerKey: "durable_objects",
    jsonPath: "durableObjects",
    add: true,
    emitImplemented: true,
    level: 3,
    phase: "P1",
    reservedBindings: ["NEXT_APP"],
    wranglerAllowlist: ["name", "class_name", "script_name"],
    defaults: () => ({ binding: "DO" }),
  },
  {
    kind: "workflow",
    wranglerKey: "workflows",
    jsonPath: "workflows",
    add: true,
    emitImplemented: true,
    level: 3,
    phase: "P1",
    wranglerAllowlist: ["name", "binding", "class_name", "script_name", "schedules"],
    defaults: () => ({ binding: "WORKFLOW" }),
  },
  {
    kind: "cron",
    wranglerKey: "triggers",
    jsonPath: "cron",
    add: true,
    emitImplemented: true,
    level: 3,
    phase: "P1",
    wranglerAllowlist: ["crons"],
    defaults: () => ({ binding: "CRON" }),
  },
  {
    kind: "secret",
    wranglerKey: "secrets",
    jsonPath: "secrets.required",
    add: true,
    emitImplemented: true,
    level: 2,
    phase: "P1",
    wranglerAllowlist: ["required"],
    defaults: () => ({ binding: "SECRET" }),
  },
  {
    kind: "secret-store",
    wranglerKey: "secrets_store_secrets",
    jsonPath: "secrets.store",
    add: true,
    emitImplemented: true,
    level: 2,
    phase: "P1",
    wranglerAllowlist: ["binding", "store_id", "secret_name"],
    defaults: () => ({ binding: "STORE_SECRET" }),
  },
  {
    kind: "var",
    wranglerKey: "vars",
    jsonPath: "vars",
    add: true,
    emitImplemented: true,
    level: 1,
    phase: "P1",
    wranglerAllowlist: [],
    defaults: () => ({ binding: "VAR" }),
  },
  {
    kind: "access",
    wranglerKey: "access",
    jsonPath: "access",
    add: true,
    emitImplemented: false,
    level: 3,
    phase: "P2",
    wranglerAllowlist: ["dev"],
    defaults: () => ({ binding: "ACCESS" }),
  },
  {
    kind: "flagship",
    wranglerKey: "flagship",
    jsonPath: "flagship",
    add: true,
    emitImplemented: false,
    level: 3,
    phase: "P2",
    wranglerAllowlist: ["binding", "app_id", "remote"],
    defaults: () => ({ binding: "FLAGS" }),
  },
  {
    kind: "observability",
    wranglerKey: "observability",
    jsonPath: "observability",
    add: false,
    emitImplemented: false,
    level: 3,
    phase: "P2",
    wranglerAllowlist: ["enabled", "head_sampling_rate", "logs", "traces"],
    defaults: () => ({ binding: "OBS" }),
  },
  {
    kind: "logpush",
    wranglerKey: "logpush",
    jsonPath: "logpush",
    add: true,
    emitImplemented: false,
    level: 4,
    phase: "P2",
    wranglerAllowlist: [],
    defaults: () => ({ binding: "LOGPUSH" }),
  },
  {
    kind: "web-analytics",
    jsonPath: "analytics.web",
    add: true,
    emitImplemented: false,
    virtual: true,
    level: 3,
    phase: "P2",
    wranglerAllowlist: [],
    defaults: () => ({ binding: "WEB_ANALYTICS" }),
  },
  {
    kind: "email",
    wranglerKey: "send_email",
    jsonPath: "email.sending",
    add: true,
    emitImplemented: false,
    level: 3,
    phase: "P3",
    wranglerAllowlist: [
      "name",
      "destination_address",
      "allowed_destination_addresses",
      "allowed_sender_addresses",
      "remote",
    ],
    defaults: () => ({ binding: "EMAIL" }),
  },
  {
    kind: "email-routing",
    jsonPath: "email.routing",
    add: false,
    emitImplemented: false,
    virtual: true,
    level: 4,
    phase: "P3",
    wranglerAllowlist: [],
    defaults: () => ({ binding: "EMAIL_IN" }),
  },
  {
    kind: "images",
    wranglerKey: "images",
    jsonPath: "media.images.binding",
    add: true,
    emitImplemented: false,
    singleton: true,
    level: 1,
    phase: "P3",
    wranglerAllowlist: ["binding", "remote"],
    defaults: () => ({ binding: "IMAGES" }),
  },
  {
    kind: "image-loader",
    jsonPath: "media.images.loader",
    add: true,
    emitImplemented: false,
    virtual: true,
    level: 3,
    phase: "P3",
    wranglerAllowlist: [],
    defaults: () => ({ binding: "IMAGE_LOADER" }),
  },
  {
    kind: "stream",
    wranglerKey: "stream",
    jsonPath: "media.stream",
    add: true,
    emitImplemented: false,
    level: 3,
    phase: "P3",
    wranglerAllowlist: ["binding", "remote"],
    defaults: () => ({ binding: "STREAM" }),
  },
  {
    kind: "media",
    wranglerKey: "media",
    jsonPath: "media.transforms",
    add: true,
    emitImplemented: false,
    level: 2,
    phase: "P3",
    wranglerAllowlist: ["binding", "remote"],
    defaults: () => ({ binding: "MEDIA" }),
  },
  {
    kind: "realtime",
    jsonPath: "media.realtime",
    add: true,
    emitImplemented: false,
    virtual: true,
    level: 4,
    phase: "P3",
    wranglerAllowlist: [],
    defaults: () => ({ binding: "REALTIME" }),
  },
  {
    kind: "ai-search",
    wranglerKey: "ai_search",
    jsonPath: "ai.search",
    add: true,
    emitImplemented: false,
    level: 3,
    phase: "P4",
    wranglerAllowlist: ["binding", "instance_name", "namespace", "remote"],
    defaults: () => ({ binding: "AI_SEARCH" }),
  },
  {
    kind: "ai-gateway",
    jsonPath: "ai.gateway",
    add: true,
    emitImplemented: false,
    virtual: true,
    level: 3,
    phase: "P4",
    wranglerAllowlist: [],
    defaults: () => ({ binding: "AI_GATEWAY" }),
  },
  {
    kind: "model",
    jsonPath: "ai.models",
    add: true,
    emitImplemented: false,
    virtual: true,
    level: 3,
    phase: "P4",
    wranglerAllowlist: [],
    defaults: () => ({ binding: "MODEL" }),
  },
  {
    kind: "agent",
    wranglerKey: "durable_objects",
    jsonPath: "agents",
    add: true,
    emitImplemented: false,
    level: 3,
    phase: "P4",
    wranglerAllowlist: ["name", "class_name"],
    defaults: () => ({ binding: "AGENT" }),
  },
  {
    kind: "mcp-portal",
    jsonPath: "ai.mcpPortals",
    add: true,
    emitImplemented: false,
    virtual: true,
    level: 4,
    phase: "P4",
    wranglerAllowlist: [],
    defaults: () => ({ binding: "MCP" }),
  },
  {
    kind: "websearch",
    wranglerKey: "websearch",
    jsonPath: "ai.websearch",
    add: true,
    emitImplemented: false,
    level: 1,
    phase: "P4",
    wranglerAllowlist: ["binding"],
    defaults: () => ({ binding: "WEBSEARCH" }),
  },
  {
    kind: "analytics-engine",
    wranglerKey: "analytics_engine_datasets",
    jsonPath: "analytics.engine",
    add: true,
    emitImplemented: false,
    level: 2,
    phase: "P5",
    wranglerAllowlist: ["binding", "dataset"],
    defaults: () => ({ binding: "AE" }),
  },
  {
    kind: "pipeline",
    wranglerKey: "pipelines",
    jsonPath: "bindings.pipelines",
    add: true,
    emitImplemented: false,
    level: 2,
    phase: "P5",
    wranglerAllowlist: ["binding", "pipeline"],
    defaults: () => ({ binding: "PIPELINE" }),
  },
  {
    kind: "browser",
    wranglerKey: "browser",
    jsonPath: "bindings.browser",
    add: true,
    emitImplemented: false,
    singleton: true,
    level: 2,
    phase: "P5",
    wranglerAllowlist: ["binding", "remote"],
    defaults: () => ({ binding: "BROWSER" }),
  },
  {
    kind: "worker-loader",
    wranglerKey: "worker_loaders",
    jsonPath: "bindings.workerLoaders",
    add: true,
    emitImplemented: false,
    level: 1,
    phase: "P5",
    wranglerAllowlist: ["binding"],
    defaults: () => ({ binding: "LOADER" }),
  },
  {
    kind: "service",
    wranglerKey: "services",
    jsonPath: "bindings.services",
    add: true,
    emitImplemented: false,
    level: 1,
    phase: "P5",
    wranglerAllowlist: ["binding", "service", "entrypoint"],
    defaults: () => ({ binding: "SERVICE" }),
  },
  {
    kind: "version-metadata",
    wranglerKey: "version_metadata",
    jsonPath: "bindings.versionMetadata",
    add: false,
    emitImplemented: true,
    level: 1,
    phase: "P1",
    wranglerAllowlist: ["binding"],
    defaults: () => ({ binding: "CF_VERSION_METADATA" }),
  },
]

export function catalogKind(name: string): CatalogKind | undefined {
  const needle = name.toLowerCase()
  return CATALOG.find((k) => k.kind === needle || k.aliases?.includes(needle))
}

export function implementedAddKinds(): string[] {
  return CATALOG.filter((k) => k.add && k.emitImplemented).map((k) => k.kind)
}

export function emitImplementedBindings(json: CfnextJson, wrangler: WranglerConfig, app: string): void {
  const unimplemented = presentUnimplementedPaths(json)
  if (unimplemented.length > 0) {
    throw new CatalogError(
      `Unimplemented catalog path(s) in this cfnext version: ${unimplemented.join(", ")}. Remove them or upgrade.`,
    )
  }

  for (const item of json.bindings?.d1 ?? []) {
    if (!item.omit) emitD1({ ...item, databaseName: item.databaseName ?? `${app}-db`, migrationsDir: item.migrationsDir ?? "migrations" }, wrangler)
  }
  for (const item of json.bindings?.r2 ?? []) {
    if (!item.omit) emitR2({ ...item, bucketName: item.bucketName ?? `${app}-bucket` }, wrangler)
  }
  for (const item of json.bindings?.kv ?? []) {
    if (!item.omit) emitKv(item, wrangler)
  }
  for (const item of json.bindings?.hyperdrive ?? []) {
    if (!item.omit) emitHyperdrive(item, wrangler)
  }
  for (const item of json.bindings?.vectorize ?? []) {
    if (!item.omit) emitVectorize({ ...item, indexName: item.indexName ?? `${app}-index` }, wrangler)
  }
  for (const item of json.ai?.vectorize ?? []) {
    emitVectorize({ ...item, indexName: item.indexName ?? `${app}-index` }, wrangler)
  }
  for (const item of json.bindings?.queues ?? []) {
    if (!item.omit) emitQueue(item, wrangler)
  }
  if (json.ai?.binding) emitAi(json.ai, wrangler)
  emitDurableObjects(json, wrangler)
  emitWorkflows(json, wrangler)
  emitCron(json, wrangler)
  emitSecrets(json, wrangler)
  emitVars(json, wrangler)
  emitVersionMetadata(json, wrangler)
  emitMigrations(json, wrangler)
}

export const P0_BINDING_KINDS = ["d1", "r2", "kv", "hyperdrive", "ai", "vectorize", "queue"] as const
export type P0BindingKind = (typeof P0_BINDING_KINDS)[number]
