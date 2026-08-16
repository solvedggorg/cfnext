import { existsSync } from "node:fs"
import { mkdir, writeFile, unlink } from "node:fs/promises"
import { join } from "node:path"

import { findProjectRoot } from "../find-root"
import { fail, run } from "../run"

export async function envCommand(): Promise<void> {
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

  const tmp = join(root, ".cloudflare/secrets.json")
  await mkdir(join(root, ".cloudflare"), { recursive: true })
  await writeFile(tmp, JSON.stringify(secrets, null, 2))
  try {
    await run(["bun", "x", "wrangler", "secret", "bulk", tmp], root)
    console.log(`synced ${Object.keys(secrets).length} secrets`)
  } finally {
    await writeFile(tmp, "{}\n")
    try {
      await unlink(tmp)
    } catch {
      // ignore
    }
  }
}
