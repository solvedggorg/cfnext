import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { parseJsonc } from "../src/jsonc"
import type { CfnextJson } from "../src/schema"
import { generate } from "../src/generate"
import { splitGenerated } from "../src/generate/hash"
import { IMAGE_LOADER_FILE } from "../src/generate/next"

const cli = join(import.meta.dir, "../src/cli/index.ts")
const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function runCli(dir: string, argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", cli, ...argv], { cwd: dir, stdout: "pipe", stderr: "pipe" })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  return { code: await proc.exited, stdout, stderr }
}

test("P3 exit criterion: add email --inbound, add images, add image-loader", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p3-exit-"))
  dirs.push(dir)
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "ssr" }, null, 2))
  await writeFile(
    join(dir, "worker.ts"),
    `export default { fetch() { return new Response("ok") } }\n`,
  )
  await generate(dir)

  const email = await runCli(dir, ["add", "email", "--inbound"])
  expect(email.code, `${email.stdout}\n${email.stderr}`).toBe(0)
  const images = await runCli(dir, ["add", "images"])
  expect(images.code, `${images.stdout}\n${images.stderr}`).toBe(0)
  const loader = await runCli(dir, [
    "add",
    "image-loader",
    "--kind",
    "cdn-cgi",
    "--zone-origin",
    "https://example.com",
  ])
  expect(loader.code, `${loader.stdout}\n${loader.stderr}`).toBe(0)

  expect(existsSync(join(dir, "email.ts"))).toBe(true)
  expect(existsSync(join(dir, IMAGE_LOADER_FILE))).toBe(true)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.email?.sending?.binding).toBe("EMAIL")
  expect(json.email?.routing?.enabled).toBe(true)
  expect(json.media?.images?.binding).toBe("IMAGES")
  expect(json.media?.images?.loader?.enabled).toBe(true)
  expect(json.images?.unoptimized).toBe(false)

  const wrangler = parseJsonc<{
    send_email?: Array<{ name: string }>
    images?: { binding: string }
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.send_email?.[0]?.name).toBe("EMAIL")
  expect(wrangler.images?.binding).toBe("IMAGES")
}, 120_000)
