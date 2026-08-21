import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { parseJsonc } from "../src/jsonc"
import type { CfnextJson } from "../src/schema"
import { generate } from "../src/generate"
import { splitGenerated } from "../src/generate/hash"

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

test("P5 exit criterion: add analytics-engine, pipeline, browser, worker-loader, service", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p5-exit-"))
  dirs.push(dir)
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "ssr" }, null, 2))
  await writeFile(
    join(dir, "worker.ts"),
    `export default { fetch() { return new Response("ok") } }\n`,
  )
  await generate(dir)

  const ae = await runCli(dir, ["add", "analytics-engine", "--dataset", "app_events"])
  expect(ae.code, `${ae.stdout}\n${ae.stderr}`).toBe(0)
  const pipeline = await runCli(dir, ["add", "pipeline", "--binding", "INGEST", "--stream", "my-stream"])
  expect(pipeline.code, `${pipeline.stdout}\n${pipeline.stderr}`).toBe(0)
  const browser = await runCli(dir, ["add", "browser"])
  expect(browser.code, `${browser.stdout}\n${browser.stderr}`).toBe(0)
  const loader = await runCli(dir, ["add", "worker-loader", "--binding", "LOADER"])
  expect(loader.code, `${loader.stdout}\n${loader.stderr}`).toBe(0)
  const service = await runCli(dir, ["add", "service", "--binding", "AUTH", "--service", "auth-worker", "--entrypoint", "PublicAuth"])
  expect(service.code, `${service.stdout}\n${service.stderr}`).toBe(0)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.analytics?.engine?.[0]).toEqual({ binding: "AE", dataset: "app_events" })
  expect(json.bindings?.pipelines).toEqual([{ binding: "INGEST", stream: "my-stream" }])
  expect(json.bindings?.browser).toEqual({ binding: "BROWSER" })
  expect(json.bindings?.workerLoaders).toEqual([{ binding: "LOADER" }])
  expect(json.bindings?.services).toEqual([
    { binding: "AUTH", service: "auth-worker", entrypoint: "PublicAuth" },
  ])

  const wrangler = parseJsonc<{
    analytics_engine_datasets?: Array<{ binding: string; dataset?: string }>
    pipelines?: Array<{ binding: string; stream?: string }>
    browser?: { binding: string }
    worker_loaders?: Array<{ binding: string }>
    services?: Array<{ binding: string; service: string; entrypoint?: string }>
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.analytics_engine_datasets).toEqual([{ binding: "AE", dataset: "app_events" }])
  expect(wrangler.pipelines).toEqual([{ binding: "INGEST", stream: "my-stream" }])
  expect(wrangler.browser).toEqual({ binding: "BROWSER" })
  expect(wrangler.worker_loaders).toEqual([{ binding: "LOADER" }])
  expect(wrangler.services).toEqual([
    { binding: "AUTH", service: "auth-worker", entrypoint: "PublicAuth" },
  ])
}, 120_000)

test("P5 exit criterion: service without --service fails with usage", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p5-exit-"))
  dirs.push(dir)
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "ssr" }, null, 2))
  await generate(dir)

  const missing = await runCli(dir, ["add", "service", "--binding", "AUTH"])
  expect(missing.code).toBe(1)
  expect(missing.stderr).toContain("Usage: cfnext add service")
})
