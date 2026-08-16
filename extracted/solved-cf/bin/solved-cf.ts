#!/usr/bin/env bun

import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

if (typeof Bun === "undefined") {
  console.error("solved-cf runs on Bun only. Install bun.sh and retry.")
  process.exit(1)
}

const root = join(import.meta.dir, "../../..")
const command = process.argv[2] ?? "help"

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

async function run(cmd: string[], env?: Record<string, string>) {
  const proc = Bun.spawn(cmd, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: { ...process.env, ...env },
  })
  const code = await proc.exited
  if (code !== 0) fail(`Command failed (${code}): ${cmd.join(" ")}`)
}

async function ensureWrangler() {
  const path = join(root, "wrangler.jsonc")
  if (existsSync(path)) return
  await writeFile(
    path,
    `{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "solved",
  "main": "packages/cf/worker.ts",
  "compatibility_date": "2026-08-15",
  "preview_urls": true,
  "workers_dev": true,
  "observability": { "enabled": true, "head_sampling_rate": 1 },
  "assets": {
    "directory": ".cloudflare/assets",
    "binding": "ASSETS",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "404-page",
    "run_worker_first": [
      "/dashboard",
      "/dashboard/*",
      "/account",
      "/account/*",
      "/organization",
      "/organization/*",
      "/organizations",
      "/organizations/*",
      "/create-organization",
      "/create-organization/*",
      "/api-keys",
      "/api-keys/*"
    ]
  }
}
`
  )
  console.log("wrote wrangler.jsonc")
}

async function build() {
  await ensureWrangler()
  await mkdir(join(root, ".cloudflare/assets"), { recursive: true })
  await run(["bun", "--bun", "next", "build"])
}

async function deploy(preview: boolean) {
  await ensureWrangler()
  if (preview) {
    await run(["bun", "x", "wrangler", "versions", "upload"])
    return
  }
  await run(["bun", "x", "wrangler", "deploy"])
}

async function previewLocal() {
  await build()
  await run(["bun", "x", "wrangler", "dev"])
}

async function envSync() {
  const envFile = join(root, ".env.local")
  if (!existsSync(envFile)) fail("Missing .env.local")
  const text = await Bun.file(envFile).text()
  const secrets: Record<string, string> = {}
  let publicCount = 0
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#") || !line.includes("=")) continue
    const eq = line.indexOf("=")
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (key.startsWith("NEXT_PUBLIC_")) {
      publicCount += 1
      continue
    }
    secrets[key] = value
  }
  if (publicCount > 0) {
    console.log(
      `${publicCount} NEXT_PUBLIC_* keys stay in .env.local for bun run build. They are compiled into the client.`
    )
  }
  if (Object.keys(secrets).length === 0) {
    console.log("No Worker secrets to push.")
    return
  }
  const tmp = join(root, ".cloudflare/secrets.json")
  await mkdir(join(root, ".cloudflare"), { recursive: true })
  await writeFile(tmp, JSON.stringify(secrets, null, 2))
  try {
    await run(["bun", "x", "wrangler", "secret", "bulk", tmp])
    console.log(`synced ${Object.keys(secrets).length} secrets`)
  } finally {
    await Bun.write(tmp, "{}")
    await Bun.file(tmp).exists()
  }
}

const help = `solved-cf — Bun-only Cloudflare Workers deploy (no OpenNext, no Node)

  bun run deploy          production Worker
  bun run preview         version upload (preview URL)
  bun run cf:dev          wrangler dev against packed assets
  bun run cf:build        next build + adapter pack
  bun run cf:env          push .env.local to the Worker
  bun run cf:init         write wrangler.jsonc if missing
`

switch (command) {
  case "init":
    await ensureWrangler()
    break
  case "build":
  case "pack":
    await build()
    break
  case "deploy":
    await deploy(false)
    break
  case "preview":
    await deploy(true)
    break
  case "dev":
    await previewLocal()
    break
  case "env":
    await envSync()
    break
  default:
    console.log(help)
}
