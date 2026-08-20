import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
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

function wranglerBody<T>(text: string): T {
  return parseJsonc<T>(splitGenerated(text).body)
}

test("generate emits traces.enabled by default", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p2-obs-"))
  dirs.push(dir)
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "workers" }, null, 2))
  await generate(dir)
  const wrangler = wranglerBody<{
    observability?: {
      enabled?: boolean
      head_sampling_rate?: number
      traces?: { enabled?: boolean }
    }
  }>(await readFile(join(dir, "wrangler.jsonc"), "utf8"))
  expect(wrangler.observability?.enabled).toBe(true)
  expect(wrangler.observability?.traces?.enabled).toBe(true)
})

test("cfnext.json observability maps traces, logs, destinations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p2-obs-json-"))
  dirs.push(dir)
  await writeFile(
    join(dir, "cfnext.json"),
    JSON.stringify(
      {
        name: "demo",
        target: "ssr",
        observability: {
          enabled: true,
          headSamplingRate: 0.1,
          traces: { enabled: true, headSamplingRate: 0.05, persist: false, destinations: ["tracing"] },
          logs: { enabled: true, invocationLogs: true, destinations: ["logs"] },
        },
      } satisfies CfnextJson,
      null,
      2,
    ),
  )
  await generate(dir)
  const wrangler = wranglerBody<{
    observability?: {
      enabled?: boolean
      head_sampling_rate?: number
      traces?: {
        enabled?: boolean
        head_sampling_rate?: number
        persist?: boolean
        destinations?: string[]
      }
      logs?: { enabled?: boolean; invocation_logs?: boolean; destinations?: string[] }
    }
  }>(await readFile(join(dir, "wrangler.jsonc"), "utf8"))
  expect(wrangler.observability).toEqual({
    enabled: true,
    head_sampling_rate: 0.1,
    traces: { enabled: true, head_sampling_rate: 0.05, persist: false, destinations: ["tracing"] },
    logs: { enabled: true, invocation_logs: true, destinations: ["logs"] },
  })
})

test("env.staging.observability overrides sampling", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p2-obs-env-"))
  dirs.push(dir)
  await writeFile(
    join(dir, "cfnext.json"),
    JSON.stringify(
      {
        name: "demo",
        target: "workers",
        observability: { enabled: true, headSamplingRate: 0.1 },
        env: { staging: { observability: { enabled: true, headSamplingRate: 1 } } },
      },
      null,
      2,
    ),
  )
  await generate(dir)
  const wrangler = wranglerBody<{
    observability?: { head_sampling_rate?: number }
    env?: { staging?: { observability?: { head_sampling_rate?: number } } }
  }>(await readFile(join(dir, "wrangler.jsonc"), "utf8"))
  expect(wrangler.observability?.head_sampling_rate).toBe(0.1)
  expect(wrangler.env?.staging?.observability?.head_sampling_rate).toBe(1)
})

test("cfnext add logpush sets boolean and writes L4 plan without credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p2-logpush-"))
  dirs.push(dir)
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "workers" }, null, 2))
  await generate(dir)
  const result = await runCli(dir, ["add", "logpush", "--dataset", "workers_trace_events", "--destination", "r2://logs"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.logpush?.enabled).toBe(true)
  expect(json.logpush?.jobs?.[0]).toEqual({
    dataset: "workers_trace_events",
    destination: "r2://logs",
  })

  const wrangler = wranglerBody<{ logpush?: boolean }>(await readFile(join(dir, "wrangler.jsonc"), "utf8"))
  expect(wrangler.logpush).toBe(true)

  const planPath = join(dir, ".cloudflare/generated/logpush.plan.json")
  expect(existsSync(planPath)).toBe(true)
  const planText = await readFile(planPath, "utf8")
  expect(planText).not.toMatch(/secret|api[_-]?key|token/i)
  const plan = JSON.parse(planText) as { kind: string; jobs: Array<{ destination?: string }> }
  expect(plan.kind).toBe("logpush")
  expect(plan.jobs[0]?.destination).toBe("r2://logs")
})

test("cfnext add web-analytics writes analytics.web", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p2-web-"))
  dirs.push(dir)
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "workers" }, null, 2))
  await generate(dir)
  const result = await runCli(dir, ["add", "web-analytics", "--token", "site-token"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.analytics?.web).toEqual({ token: "site-token", spa: true })
  const wrangler = wranglerBody<Record<string, unknown>>(await readFile(join(dir, "wrangler.jsonc"), "utf8"))
  expect(wrangler.analytics).toBeUndefined()
})
