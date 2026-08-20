import { existsSync } from "node:fs"
import { mkdir, writeFile, unlink } from "node:fs/promises"
import { join } from "node:path"

import { findCfnextJson } from "../../config"
import { generate } from "../../generate"
import { parseJsonc, stringifyJsonc } from "../../jsonc"
import type { CfnextJson } from "../../schema"
import { type Args, flagString } from "../args"
import { failIfGenerate } from "../fail-generate"
import { findProjectRoot } from "../find-root"
import { unionRequiredSecrets } from "../p1-mutate"
import { fail, run } from "../run"

export async function envCommand(args: Args): Promise<void> {
  const root = findProjectRoot()
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
      `${publicCount} NEXT_PUBLIC_* keys stay in .env.local for bun run build. They are compiled into the client.`,
    )
  }
  if (Object.keys(secrets).length === 0) {
    console.log("No Worker secrets to push.")
    return
  }

  const keys = Object.keys(secrets)
  const jsonPath = findCfnextJson(root)
  const environment = flagString(args.flags, "environment")
  if (jsonPath) {
    const json = parseJsonc<CfnextJson>(await readFileJson(jsonPath))
    const next = writeRequiredSecrets(json, keys, environment)
    await writeFile(jsonPath, stringifyJsonc(next))
    try {
      await generate(root)
    } catch (error) {
      failIfGenerate(error)
    }
  }

  if (process.env.CFNEXT_SKIP_SECRET_BULK === "1") {
    console.log(`synced ${keys.length} secrets.required (upload skipped)`)
    return
  }

  const tmp = join(root, ".cloudflare/secrets.json")
  await mkdir(join(root, ".cloudflare"), { recursive: true })
  await writeFile(tmp, JSON.stringify(secrets, null, 2))
  try {
    await run(["bun", "x", "wrangler", "secret", "bulk", tmp], root)
    console.log(`synced ${keys.length} secrets`)
  } finally {
    await writeFile(tmp, "{}\n")
    try {
      await unlink(tmp)
    } catch {
      // ignore
    }
  }
}

async function readFileJson(path: string): Promise<string> {
  return Bun.file(path).text()
}

function writeRequiredSecrets(json: CfnextJson, keys: string[], environment?: string): CfnextJson {
  const targetEnv = environment && environment !== "preview" ? environment : undefined
  if (targetEnv === "production") {
    fail("Use the top-level secrets for production. env.production is illegal.")
  }
  if (!targetEnv) {
    return {
      ...json,
      secrets: { ...json.secrets, required: unionRequiredSecrets(json.secrets?.required, keys) },
    }
  }
  const overlay = json.env?.[targetEnv] ?? {}
  return {
    ...json,
    env: {
      ...json.env,
      [targetEnv]: {
        ...overlay,
        secrets: {
          ...overlay.secrets,
          required: unionRequiredSecrets(overlay.secrets?.required, keys),
        },
      },
    },
  }
}
