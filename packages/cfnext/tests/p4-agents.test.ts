import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
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

test("add agent --no-memory omits agent_memory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p4-agent-nomem-"))
  dirs.push(dir)
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "ssr" }, null, 2))
  await writeFile(join(dir, "worker.ts"), `export default { fetch() { return new Response("ok") } }\n`)
  await generate(dir)
  const result = await runCli(dir, ["add", "agent", "--class", "ResearchAgent", "--no-memory"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.agents?.[0]?.memory).toBeUndefined()

  const wrangler = parseJsonc<{ agent_memory?: unknown }>(
    splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body,
  )
  expect(wrangler.agent_memory).toBeUndefined()
})

test("add agent --workflow writes workflow stub and wrangler workflows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p4-agent-wf-"))
  dirs.push(dir)
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "ssr" }, null, 2))
  await writeFile(join(dir, "worker.ts"), `export default { fetch() { return new Response("ok") } }\n`)
  await generate(dir)
  const result = await runCli(dir, [
    "add",
    "agent",
    "--class",
    "ResearchAgent",
    "--workflow",
    "IngestWorkflow",
  ])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
  expect(existsSync(join(dir, "workflows/IngestWorkflow.ts"))).toBe(true)

  const wrangler = parseJsonc<{
    workflows?: Array<{ class_name: string; binding: string }>
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.workflows?.some((row) => row.class_name === "IngestWorkflow")).toBe(true)
})

test("generate refuses agent without agents/Class.ts stub", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p4-agent-missing-"))
  dirs.push(dir)
  await writeFile(
    join(dir, "cfnext.json"),
    JSON.stringify(
      {
        name: "demo",
        target: "ssr",
        agents: [{ className: "ResearchAgent", binding: "RESEARCH_AGENT" }],
        migrations: [{ tag: "cfnext-do-ResearchAgent", newSqliteClasses: ["ResearchAgent"] }],
      },
      null,
      2,
    ),
  )
  await writeFile(join(dir, "worker.ts"), `export default { fetch() { return new Response("ok") } }\n`)
  await expect(generate(dir)).rejects.toThrow(/agents\/ResearchAgent/)
})

test("agent class colliding with durableObjects is an error", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p4-agent-collide-"))
  dirs.push(dir)
  await mkdir(join(dir, "durable-objects"), { recursive: true })
  await mkdir(join(dir, "agents"), { recursive: true })
  await writeFile(join(dir, "durable-objects/ResearchAgent.ts"), "export class ResearchAgent {}\n")
  await writeFile(join(dir, "agents/ResearchAgent.ts"), "export class ResearchAgent {}\n")
  await writeFile(
    join(dir, "cfnext.json"),
    JSON.stringify(
      {
        name: "demo",
        target: "ssr",
        durableObjects: [{ binding: "RESEARCH_AGENT", className: "ResearchAgent" }],
        agents: [{ className: "ResearchAgent", binding: "RESEARCH_AGENT" }],
        migrations: [{ tag: "cfnext-do-ResearchAgent", newSqliteClasses: ["ResearchAgent"] }],
      },
      null,
      2,
    ),
  )
  await writeFile(join(dir, "worker.ts"), `export default { fetch() { return new Response("ok") } }\n`)
  await expect(generate(dir)).rejects.toThrow(/already/)
})
