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

test("cfnext add mcp-portal writes plan file and no wrangler key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p4-mcp-"))
  dirs.push(dir)
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "ssr" }, null, 2))
  await writeFile(join(dir, "worker.ts"), `export default { fetch() { return new Response("ok") } }\n`)
  await generate(dir)
  const result = await runCli(dir, [
    "add",
    "mcp-portal",
    "--name",
    "engineering",
    "--url",
    "https://engineering.mcp.example.cloudflareaccess.com",
  ])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.ai?.mcpPortals).toEqual([
    { name: "engineering", url: "https://engineering.mcp.example.cloudflareaccess.com" },
  ])

  expect(existsSync(join(dir, ".cloudflare/generated/mcp-portals.plan.json"))).toBe(true)
  const plan = JSON.parse(await readFile(join(dir, ".cloudflare/generated/mcp-portals.plan.json"), "utf8")) as {
    kind: string
    wrangler: unknown
    portals: Array<{ name: string }>
  }
  expect(plan.kind).toBe("mcp-portals")
  expect(plan.wrangler).toBeNull()
  expect(plan.portals[0]?.name).toBe("engineering")

  const wrangler = parseJsonc<Record<string, unknown>>(
    splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body,
  )
  expect(wrangler.mcp_portals).toBeUndefined()
  expect(wrangler.mcpPortals).toBeUndefined()
  expect(JSON.stringify(wrangler)).not.toContain("engineering.mcp.example")
})
