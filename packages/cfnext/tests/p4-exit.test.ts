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

test("P4 exit criterion: add ai, add ai-search --name docs, add agent --class ResearchAgent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p4-exit-"))
  dirs.push(dir)
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "ssr" }, null, 2))
  await writeFile(
    join(dir, "worker.ts"),
    `export default { fetch() { return new Response("ok") } }\n`,
  )
  await generate(dir)

  const ai = await runCli(dir, ["add", "ai"])
  expect(ai.code, `${ai.stdout}\n${ai.stderr}`).toBe(0)
  const search = await runCli(dir, ["add", "ai-search", "--name", "docs"])
  expect(search.code, `${search.stdout}\n${search.stderr}`).toBe(0)
  const agent = await runCli(dir, ["add", "agent", "--class", "ResearchAgent"])
  expect(agent.code, `${agent.stdout}\n${agent.stderr}`).toBe(0)

  expect(existsSync(join(dir, "agents/ResearchAgent.ts"))).toBe(true)
  expect(await readFile(join(dir, "agents/ResearchAgent.ts"), "utf8")).toContain(
    "export class ResearchAgent extends Agent<CloudflareEnv>",
  )
  expect(await readFile(join(dir, "agents/ResearchAgent.ts"), "utf8")).toContain('from "agents"')

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.ai?.binding).toBe("AI")
  expect(json.ai?.search?.[0]).toEqual({ binding: "AI_SEARCH", instanceName: "docs" })
  expect(json.agents?.[0]?.className).toBe("ResearchAgent")
  expect(json.agents?.[0]?.binding).toBe("RESEARCH_AGENT")
  expect(json.agents?.[0]?.memory).toEqual({ binding: "AGENT_MEMORY", namespace: "demo-memory" })
  expect(json.migrations?.some((row) => row.newSqliteClasses?.includes("ResearchAgent"))).toBe(true)

  const wrangler = parseJsonc<{
    ai?: { binding: string }
    ai_search?: Array<{ binding: string; instance_name: string }>
    durable_objects?: { bindings?: Array<{ name: string; class_name: string }> }
    agent_memory?: Array<{ binding: string; namespace: string }>
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.ai?.binding).toBe("AI")
  expect(wrangler.ai_search).toEqual([{ binding: "AI_SEARCH", instance_name: "docs" }])
  expect(wrangler.durable_objects?.bindings).toEqual([
    { name: "RESEARCH_AGENT", class_name: "ResearchAgent" },
  ])
  expect(wrangler.agent_memory).toEqual([{ binding: "AGENT_MEMORY", namespace: "demo-memory" }])

  const handlers = await readFile(join(dir, ".cloudflare/generated/handlers.ts"), "utf8")
  expect(handlers).toContain('export { ResearchAgent } from "../../agents/ResearchAgent"')
}, 120_000)
