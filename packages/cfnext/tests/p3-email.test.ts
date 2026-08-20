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
  await writeFile(join(dir, "cfnext.json"), JSON.stringify({ name: "demo", target: "ssr" }, null, 2))
  await writeFile(
    join(dir, "worker.ts"),
    `export default { fetch() { return new Response("ok") } }\n`,
  )
  await generate(dir)
}

test("cfnext add email emits send_email name EMAIL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p3-email-"))
  dirs.push(dir)
  await seed(dir)
  const result = await runCli(dir, ["add", "email", "--allowed-senders", "noreply@acme.com"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.email?.sending).toEqual({ binding: "EMAIL", allowedSenders: ["noreply@acme.com"] })
  expect(existsSync(join(dir, "email.ts"))).toBe(false)

  const wrangler = parseJsonc<{
    send_email?: Array<{ name: string; allowed_sender_addresses?: string[] }>
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.send_email).toEqual([{ name: "EMAIL", allowed_sender_addresses: ["noreply@acme.com"] }])
})

test("cfnext add email --inbound writes stub, handlers export, and routing plan", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p3-inbound-"))
  dirs.push(dir)
  await seed(dir)
  const workerBefore = await readFile(join(dir, "worker.ts"), "utf8")
  const result = await runCli(dir, ["add", "email", "--inbound", "--addresses", "support@acme.com"])
  expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)

  expect(await readFile(join(dir, "worker.ts"), "utf8")).toBe(workerBefore)
  expect(existsSync(join(dir, "email.ts"))).toBe(true)
  expect(await readFile(join(dir, "email.ts"), "utf8")).toContain("export async function email")
  expect(await readFile(join(dir, "email.ts"), "utf8")).toContain("setReject")
  expect(existsSync(join(dir, ".cloudflare/generated/email-routing.plan.json"))).toBe(true)

  const handlers = await readFile(join(dir, ".cloudflare/generated/handlers.ts"), "utf8")
  expect(handlers).toContain('export { email } from "../../email"')

  const json = parseJsonc<CfnextJson>(await readFile(join(dir, "cfnext.json"), "utf8"))
  expect(json.email?.routing).toEqual({ enabled: true, addresses: ["support@acme.com"] })
  expect(json.email?.sending?.binding).toBe("EMAIL")
})

test("generate refuses routing without email.ts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p3-email-missing-"))
  dirs.push(dir)
  await writeFile(
    join(dir, "cfnext.json"),
    JSON.stringify(
      {
        name: "demo",
        target: "workers",
        email: { sending: { binding: "EMAIL" }, routing: { enabled: true } },
      },
      null,
      2,
    ),
  )
  await expect(generate(dir)).rejects.toThrow(/email\.ts/)
})

test("send_email is re-emitted on named env (non-inheritable)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-p3-email-env-"))
  dirs.push(dir)
  await writeFile(
    join(dir, "cfnext.json"),
    JSON.stringify(
      {
        name: "demo",
        target: "workers",
        email: { sending: { binding: "EMAIL", allowedSenders: ["noreply@acme.com"] } },
        env: { staging: { vars: { APP_ENV: "staging" } } },
      },
      null,
      2,
    ),
  )
  await generate(dir)
  const wrangler = parseJsonc<{
    send_email?: Array<{ name: string }>
    env?: { staging?: { send_email?: Array<{ name: string; allowed_sender_addresses?: string[] }> } }
  }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
  expect(wrangler.send_email?.[0]?.name).toBe("EMAIL")
  expect(wrangler.env?.staging?.send_email?.[0]).toEqual({
    name: "EMAIL",
    allowed_sender_addresses: ["noreply@acme.com"],
  })
})
