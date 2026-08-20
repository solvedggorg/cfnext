import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { parseJsonc } from "../src/jsonc"
import type { CfnextJson } from "../src/schema"
import { generate } from "../src/generate"
import { splitGenerated } from "../src/generate/hash"
import { IMAGE_LOADER_FILE, IMAGE_LOADER_JSON } from "../src/generate/next"

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

async function seed(dir: string): Promise<void> {
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "ssr" }, null, 2))
  await writeFile(
    join(dir, "worker.ts"),
    `export default { fetch() { return new Response("ok") } }\n`,
  )
  await generate(dir)
}

test("cfnext add images emits wrangler images binding only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p3-images-"))
  dirs.push(dir)
  await seed(dir)
  const result = await runCli(dir, ["add", "images"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.media?.images?.binding).toBe("IMAGES")
  expect(json.media?.images?.loader).toBeUndefined()

  const wrangler = parseJsonc<{ images?: { binding: string } }>(
    splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body,
  )
  expect(wrangler.images).toEqual({ binding: "IMAGES" })
  expect(existsSync(join(dir, IMAGE_LOADER_FILE))).toBe(false)
})

test("cfnext add image-loader writes URL builder and flips unoptimized", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p3-loader-"))
  dirs.push(dir)
  await seed(dir)
  const result = await runCli(dir, [
    "add",
    "image-loader",
    "--kind",
    "cdn-cgi",
    "--zone-origin",
    "https://example.com",
    "--hostname",
    "images.acme.com",
  ])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.images?.unoptimized).toBe(false)
  expect(json.media?.images?.loader).toEqual({
    enabled: true,
    kind: "cdn-cgi",
    zoneOrigin: "https://example.com",
    remotePatterns: [{ protocol: "https", hostname: "images.acme.com" }],
  })

  expect(existsSync(join(dir, IMAGE_LOADER_JSON))).toBe(true)
  const generated = await readFile(join(dir, IMAGE_LOADER_FILE), "utf8")
  expect(generated).toContain("buildCfnextImageUrl")
  expect(generated).toContain("https://example.com")
})

test("cfnext add stream and media emit singleton wrangler keys", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p3-stream-"))
  dirs.push(dir)
  await seed(dir)
  expect((await runCli(dir, ["add", "stream"])).code).toBe(0)
  expect((await runCli(dir, ["add", "media"])).code).toBe(0)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.media?.stream?.binding).toBe("STREAM")
  expect(json.media?.transforms?.binding).toBe("MEDIA")
  expect(json.media?.transforms?.remote).toBe(true)

  const wrangler = parseJsonc<{
    stream?: { binding: string }
    media?: { binding: string; remote?: boolean }
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.stream).toEqual({ binding: "STREAM" })
  expect(wrangler.media).toEqual({ binding: "MEDIA", remote: true })
})

test("cfnext add realtime writes L4 plan and no wrangler key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p3-realtime-"))
  dirs.push(dir)
  await seed(dir)
  const result = await runCli(dir, ["add", "realtime", "--app-id", "rt-app"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.media?.realtime).toEqual({ enabled: true, appId: "rt-app" })
  expect(existsSync(join(dir, ".cloudflare/generated/realtime.plan.json"))).toBe(true)
  const wrangler = parseJsonc<Record<string, unknown>>(
    splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body,
  )
  expect(wrangler.realtime).toBeUndefined()
})

test("images binding is re-emitted on named env", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p3-images-env-"))
  dirs.push(dir)
  await writeFile(
    join(dir, "cfnext.json"),
    JSON.stringify(
      {
        name: "demo",
        target: "workers",
        media: { images: { binding: "IMAGES" } },
        env: { staging: { vars: { APP_ENV: "staging" } } },
      },
      null,
      2,
    ),
  )
  await generate(dir)
  const wrangler = parseJsonc<{
    images?: { binding: string }
    env?: { staging?: { images?: { binding: string } } }
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.images).toEqual({ binding: "IMAGES" })
  expect(wrangler.env?.staging?.images).toEqual({ binding: "IMAGES" })
})

test("cdn-cgi image-loader without zoneOrigin fails generate", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p3-loader-bad-"))
  dirs.push(dir)
  await writeFile(
    join(dir, "cfnext.json"),
    JSON.stringify(
      {
        name: "demo",
        target: "ssr",
        media: { images: { loader: { enabled: true, kind: "cdn-cgi" } } },
      },
      null,
      2,
    ),
  )
  await expect(generate(dir)).rejects.toThrow(/zoneOrigin/)
})
