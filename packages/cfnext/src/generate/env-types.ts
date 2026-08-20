import { existsSync } from "node:fs"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { parseJsonc, stringifyJsonc } from "../jsonc"
import { wranglerPath, type WranglerConfig } from "../wrangler"
import { GenerateError } from "./errors"
import { splitGenerated } from "./hash"

export const CLOUDFLARE_ENV_FILE = "cloudflare-env.d.ts"

export async function generateCloudflareEnv(projectDir: string): Promise<string> {
  let generateTypes: (typeof import("wrangler"))["experimental_generateTypes"]
  try {
    ;({ experimental_generateTypes: generateTypes } = await import("wrangler"))
  } catch {
    throw new GenerateError("wrangler is required for `cfnext types`. Install wrangler >= 4.0.0.")
  }

  const wranglerFile = wranglerPath(projectDir)
  if (!existsSync(wranglerFile)) {
    throw new GenerateError("No wrangler.jsonc. Run `cfnext generate` first.")
  }

  const parsed = parseJsonc<WranglerConfig>(splitGenerated(await readFile(wranglerFile, "utf8")).body)
  const stripped: WranglerConfig = { ...parsed }
  delete stripped.build
  const tmpDir = join(projectDir, ".cloudflare/generated")
  await mkdir(tmpDir, { recursive: true })
  const tmp = join(tmpDir, "wrangler.types.json")
  await writeFile(tmp, stringifyJsonc(stripped))

  const dest = join(projectDir, CLOUDFLARE_ENV_FILE)
  if (existsSync(dest)) await unlink(dest)

  try {
    const result = await generateTypes({
      config: tmp,
      envInterface: "CloudflareEnv",
      path: dest,
      includeEnv: true,
      includeRuntime: true,
    })
    if (!result.content) {
      throw new GenerateError("wrangler types produced an empty cloudflare-env.d.ts")
    }
    await writeFile(dest, result.content)
    return dest
  } catch (error) {
    if (error instanceof GenerateError) throw error
    throw new GenerateError(error instanceof Error ? error.message : `wrangler types failed: ${String(error)}`)
  } finally {
    try {
      await unlink(tmp)
    } catch {
      // ignore
    }
  }
}
