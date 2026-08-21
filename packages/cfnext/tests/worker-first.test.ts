import { expect, test } from "bun:test"
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { generate } from "../src/generate"
import { splitGenerated } from "../src/generate/hash"
import { parseJsonc } from "../src/jsonc"

test("workerFirst adds api paths to run_worker_first without protect semantics", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cfnext-worker-first-"))
  await writeFile(
    join(dir, "cfnext.json"),
    JSON.stringify(
      {
        name: "probe",
        target: "workers",
        workerFirst: ["/api/survey/submit"],
      },
      null,
      2,
    ),
  )
  await writeFile(join(dir, "worker.ts"), `export default { fetch() { return new Response("ok") } }\n`)
  try {
    await generate(dir)
    const wrangler = parseJsonc<{
      assets?: { run_worker_first?: string[] | boolean }
    }>(splitGenerated(await readFile(join(dir, "wrangler.jsonc"), "utf8")).body)
    expect(wrangler.assets?.run_worker_first).toEqual([
      "/api/survey/submit",
      "/api/survey/submit/*",
    ])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
