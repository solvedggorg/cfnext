import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import type { CfnextConfig } from "./config"
import { COMPATIBILITY_DATE } from "./constants"
import { parseJsonc, stringifyJsonc } from "./jsonc"
import { runWorkerFirstFromPrefixes } from "./protect"

export type WranglerConfig = {
  $schema?: string
  name: string
  main: string
  compatibility_date: string
  compatibility_flags?: string[]
  preview_urls?: boolean
  workers_dev?: boolean
  build?: { command: string }
  observability?: {
    enabled: boolean
    head_sampling_rate?: number
    logs?: {
      enabled?: boolean
      head_sampling_rate?: number
      invocation_logs?: boolean
      persist?: boolean
      destinations?: string[]
    }
    traces?: {
      enabled?: boolean
      head_sampling_rate?: number
      persist?: boolean
      destinations?: string[]
    }
  }
  access?: { dev?: { aud: string; identity?: Record<string, unknown> } }
  logpush?: boolean
  flagship?: Array<{ binding: string; app_id?: string; remote?: boolean }>
  send_email?: Array<{
    name: string
    destination_address?: string
    allowed_destination_addresses?: string[]
    allowed_sender_addresses?: string[]
    remote?: boolean
  }>
  images?: { binding: string; remote?: boolean }
  stream?: { binding: string; remote?: boolean }
  media?: { binding: string; remote?: boolean }
  assets?: {
    directory: string
    binding: string
    html_handling?: string
    not_found_handling?: string
    run_worker_first?: string[] | boolean
  }
  d1_databases?: Array<Record<string, unknown>>
  r2_buckets?: Array<Record<string, unknown>>
  kv_namespaces?: Array<Record<string, unknown>>
  hyperdrive?: Array<Record<string, unknown>>
  ai?: { binding: string; remote?: boolean }
  ai_search?: Array<{ binding: string; instance_name: string; remote?: boolean }>
  ai_search_namespaces?: Array<{ binding: string; namespace: string; remote?: boolean }>
  agent_memory?: Array<{ binding: string; namespace: string; remote?: boolean }>
  websearch?: { binding: string; remote?: boolean }
  vars?: Record<string, string | number | boolean>
  secrets?: { required?: string[] }
  secrets_store_secrets?: Array<Record<string, unknown>>
  version_metadata?: { binding: string }
  env?: Record<string, Partial<WranglerConfig>>
  vectorize?: Array<Record<string, unknown>>
  queues?: {
    producers?: Array<Record<string, unknown>>
    consumers?: Array<Record<string, unknown>>
  }
  containers?: Array<Record<string, unknown>>
  durable_objects?: {
    bindings: Array<{ name: string; class_name: string; script_name?: string }>
  }
  migrations?: Array<Record<string, unknown>>
  workflows?: Array<Record<string, unknown>>
  triggers?: { crons?: string[] }
  analytics_engine_datasets?: Array<Record<string, unknown>>
  pipelines?: Array<Record<string, unknown>>
  browser?: { binding: string; remote?: boolean }
  worker_loaders?: Array<Record<string, unknown>>
  services?: Array<Record<string, unknown>>
}

export function wranglerPath(projectDir: string): string {
  return join(projectDir, "wrangler.jsonc")
}

export async function readWrangler(projectDir: string): Promise<WranglerConfig | null> {
  const path = wranglerPath(projectDir)
  if (!existsSync(path)) return null
  return parseJsonc<WranglerConfig>(await readFile(path, "utf8"))
}

export async function writeWrangler(projectDir: string, config: WranglerConfig): Promise<void> {
  await writeFile(wranglerPath(projectDir), stringifyJsonc(config))
}

export function buildWrangler(config: CfnextConfig): WranglerConfig {
  const protectRules = runWorkerFirstFromPrefixes(config.protect.prefixes)
  const shellRules = runWorkerFirstFromPrefixes(config.protect.shells.map((item) => item.prefix))
  const runWorkerFirst = [...new Set([...protectRules, ...shellRules])]

  const wrangler: WranglerConfig = {
    $schema: "./node_modules/wrangler/config-schema.json",
    name: config.name,
    main: "worker.ts",
    compatibility_date: COMPATIBILITY_DATE,
    preview_urls: true,
    workers_dev: true,
    build: {
      command: "bun --bun next build",
    },
    observability: {
      enabled: true,
      head_sampling_rate: 1,
    },
    assets: {
      directory: ".cloudflare/assets",
      binding: "ASSETS",
      html_handling: "auto-trailing-slash",
      not_found_handling: "404-page",
      ...(runWorkerFirst.length > 0 ? { run_worker_first: runWorkerFirst } : {}),
    },
  }

  if (config.target === "ssr") {
    wrangler.compatibility_flags = ["nodejs_compat"]
    wrangler.assets = {
      ...wrangler.assets!,
      run_worker_first: true,
    }
  }

  if (config.target === "container") {
    wrangler.containers = [
      {
        class_name: "NextApp",
        image: "./Dockerfile",
        instance_type: "standard-1",
        max_instances: 10,
      },
    ]
    wrangler.durable_objects = {
      bindings: [{ name: "NEXT_APP", class_name: "NextApp" }],
    }
    wrangler.migrations = [{ tag: "v1", new_sqlite_classes: ["NextApp"] }]
    wrangler.assets = {
      ...wrangler.assets!,
      run_worker_first: true,
    }
  }

  return wrangler
}

export async function ensureWrangler(projectDir: string, config: CfnextConfig): Promise<void> {
  const path = wranglerPath(projectDir)
  if (existsSync(path)) return
  await mkdir(join(projectDir, ".cloudflare/assets"), { recursive: true })
  await writeWrangler(projectDir, buildWrangler(config))
  console.log("wrote wrangler.jsonc")
}

export async function mergeWrangler(
  projectDir: string,
  patch: (current: WranglerConfig) => WranglerConfig,
): Promise<WranglerConfig> {
  const current = (await readWrangler(projectDir)) ?? {
    name: "app",
    main: "worker.ts",
    compatibility_date: COMPATIBILITY_DATE,
  }
  const next = patch(current)
  await writeWrangler(projectDir, next)
  return next
}
