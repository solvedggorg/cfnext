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

test("cfnext add flagship emits wrangler flagship[] with FLAGS", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p2-flags-"))
  dirs.push(dir)
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "ssr" }, null, 2))
  await writeFile(
    join(dir, "worker.ts"),
    `export default { fetch() { return new Response("ok") } }\n`,
  )
  await generate(dir)
  const result = await runCli(dir, ["add", "flagship", "--app-id", "orion-flags"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.flagship).toEqual({ binding: "FLAGS", appId: "orion-flags" })

  const wrangler = parseJsonc<{
    flagship?: Array<{ binding: string; app_id?: string; remote?: boolean }>
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.flagship).toEqual([{ binding: "FLAGS", app_id: "orion-flags" }])
})

test("flagship is re-emitted on named env (non-inheritable)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p2-flags-env-"))
  dirs.push(dir)
  await writeFile(
    join(dir, "cfnext.json"),
    JSON.stringify(
      {
        name: "demo",
        target: "workers",
        flagship: { binding: "FLAGS", appId: "orion-flags" },
        env: { staging: { vars: { APP_ENV: "staging" } } },
      },
      null,
      2,
    ),
  )
  await generate(dir)
  const wrangler = parseJsonc<{
    flagship?: Array<{ binding: string }>
    env?: { staging?: { flagship?: Array<{ binding: string; app_id?: string }> } }
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.flagship?.[0]?.binding).toBe("FLAGS")
  expect(wrangler.env?.staging?.flagship?.[0]).toEqual({ binding: "FLAGS", app_id: "orion-flags" })
})
