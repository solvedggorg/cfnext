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

async function seed(dir: string): Promise<void> {
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "orion", target: "ssr" }, null, 2))
  await writeFile(
    join(dir, "worker.ts"),
    `export default { fetch() { return new Response("ok") } }\n`,
  )
  await generate(dir)
}

test("cfnext add ai-search --namespace emits ai_search_namespaces not instance", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p4-search-ns-"))
  dirs.push(dir)
  await seed(dir)
  const result = await runCli(dir, ["add", "ai-search", "--namespace", "docs-ns"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.ai?.search?.[0]).toEqual({ binding: "AI_SEARCH", namespace: "docs-ns" })

  const wrangler = parseJsonc<{
    ai_search?: unknown
    ai_search_namespaces?: Array<{ binding: string; namespace: string }>
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.ai_search ?? []).toEqual([])
  expect(wrangler.ai_search_namespaces).toEqual([{ binding: "AI_SEARCH", namespace: "docs-ns" }])
})

test("ai.search requires instanceName xor namespace", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p4-search-xor-"))
  dirs.push(dir)
  await writeFile(
    join(dir, "cfnext.json"),
    JSON.stringify(
      {
        name: "orion",
        target: "ssr",
        ai: { search: [{ binding: "AI_SEARCH", instanceName: "docs", namespace: "ns" }] },
      },
      null,
      2,
    ),
  )
  await writeFile(join(dir, "worker.ts"), `export default { fetch() { return new Response("ok") } }\n`)
  await expect(generate(dir)).rejects.toThrow(/instanceName xor namespace|xor/)
})

test("cfnext add ai-gateway emits vars.AI_GATEWAY_ID and no model vars", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p4-gateway-"))
  dirs.push(dir)
  await seed(dir)
  const gateway = await runCli(dir, ["add", "ai-gateway"])
  expect(gateway.code, `${gateway.stdout}\n${gateway.stderr}`).toBe(0)
  const model = await runCli(dir, [
    "add",
    "model",
    "--alias",
    "chat",
    "--id",
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  ])
  expect(model.code, `${model.stdout}\n${model.stderr}`).toBe(0)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.ai?.gateway).toEqual({ id: "default" })
  expect(json.ai?.models?.chat).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast")
  expect(json.vars?.AI_GATEWAY_ID).toBeUndefined()

  const wrangler = parseJsonc<{ vars?: Record<string, string> }>(
    splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body,
  )
  expect(wrangler.vars?.AI_GATEWAY_ID).toBe("default")
  expect(wrangler.vars?.chat).toBeUndefined()
  expect(JSON.stringify(wrangler.vars ?? {})).not.toContain("@cf/")

  const models = await readFile(join(dir, ".cloudflare/generated/models.ts"), "utf8")
  expect(models).toContain("@generated")
  expect(models).toContain("chat")
  expect(models).toContain("@cf/meta/llama-3.3-70b-instruct-fp8-fast")
  expect(existsSync(join(dir, ".cloudflare/generated/models.client.ts"))).toBe(false)
})

test("public model alias emits a client module without Worker vars", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p4-model-public-"))
  dirs.push(dir)
  await seed(dir)
  const result = await runCli(dir, [
    "add",
    "model",
    "--alias",
    "chat",
    "--id",
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "--public",
  ])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.ai?.models?.chat).toEqual({
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    public: true,
  })

  const wrangler = parseJsonc<{ vars?: Record<string, string> }>(
    splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body,
  )
  expect(wrangler.vars?.chat).toBeUndefined()
  expect(JSON.stringify(wrangler.vars ?? {})).not.toContain("NEXT_PUBLIC")

  const client = await readFile(join(dir, ".cloudflare/generated/models.client.ts"), "utf8")
  expect(client).toContain("@generated")
  expect(client).toContain("@cf/meta/llama-3.3-70b-instruct-fp8-fast")
  expect(client).not.toContain("NEXT_PUBLIC")
})

test("cfnext add websearch emits wrangler.websearch object", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p4-websearch-"))
  dirs.push(dir)
  await seed(dir)
  const result = await runCli(dir, ["add", "websearch"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.ai?.websearch).toEqual({ binding: "WEBSEARCH" })

  const wrangler = parseJsonc<{ websearch?: { binding: string } }>(
    splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body,
  )
  expect(wrangler.websearch).toEqual({ binding: "WEBSEARCH" })
})

test("ai.vectorize sugar flattens into wrangler.vectorize", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p4-vectorize-sugar-"))
  dirs.push(dir)
  await writeFile(
    join(dir, "cfnext.json"),
    JSON.stringify(
      {
        name: "orion",
        target: "ssr",
        ai: { vectorize: [{ binding: "VECTORIZE", indexName: "orion-index" }] },
      },
      null,
      2,
    ),
  )
  await writeFile(join(dir, "worker.ts"), `export default { fetch() { return new Response("ok") } }\n`)
  await generate(dir)
  const wrangler = parseJsonc<{ vectorize?: Array<{ binding: string; index_name: string }> }>(
    splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body,
  )
  expect(wrangler.vectorize).toEqual([{ binding: "VECTORIZE", index_name: "orion-index" }])
})

test("named env re-emits AI_GATEWAY_ID with overlay vars", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p4-gateway-env-"))
  dirs.push(dir)
  await writeFile(
    join(dir, "cfnext.json"),
    JSON.stringify(
      {
        name: "orion",
        target: "ssr",
        ai: { gateway: { id: "default" } },
        env: { staging: { vars: { APP_ENV: "staging" } } },
      },
      null,
      2,
    ),
  )
  await writeFile(join(dir, "worker.ts"), `export default { fetch() { return new Response("ok") } }\n`)
  await generate(dir)
  const wrangler = parseJsonc<{
    vars?: Record<string, string>
    env?: { staging?: { vars?: Record<string, string> } }
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.vars?.AI_GATEWAY_ID).toBe("default")
  expect(wrangler.env?.staging?.vars?.APP_ENV).toBe("staging")
  expect(wrangler.env?.staging?.vars?.AI_GATEWAY_ID).toBe("default")
})
