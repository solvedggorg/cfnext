import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { buildAccessPlan } from "../access-provision"
import type { CfnextJson } from "../schema"

export const ACCESS_PLAN_FILE = ".cloudflare/generated/access.plan.json"
export const LOGPUSH_PLAN_FILE = ".cloudflare/generated/logpush.plan.json"

export function buildLogpushPlan(json: CfnextJson): Record<string, unknown> {
  const jobs = (json.logpush?.jobs ?? []).map((job) => ({
    dataset: job.dataset,
    ...(job.name ? { name: job.name } : {}),
    ...(job.destination ? { destination: job.destination } : {}),
  }))
  return {
    kind: "logpush",
    enabled: json.logpush?.enabled !== false,
    jobs,
    wrangler: { logpush: json.logpush?.enabled !== false },
    dashboard: "https://dash.cloudflare.com/?to=/:account/logs",
    note: "wrangler logpush is a boolean. Jobs are account-level. Create them in the dashboard or Logs API. Destination names only — never keys.",
    steps: [
      "Workers → Settings → Observability → enable Logpush on this Worker.",
      "Account Home → Analytics & Logs → Logpush → Create a job.",
      "Select dataset workers_trace_events (or the dataset in this plan).",
      "Prefer OpenTelemetry destinations via observability.logs.destinations when possible.",
    ],
  }
}

export async function writePlanFiles(projectDir: string, json: CfnextJson): Promise<void> {
  const generated = join(projectDir, ".cloudflare/generated")
  await mkdir(generated, { recursive: true })
  if (json.access) {
    await writeFile(join(projectDir, ACCESS_PLAN_FILE), `${JSON.stringify(buildAccessPlan(json), null, 2)}\n`)
  }
  if (json.logpush) {
    await writeFile(join(projectDir, LOGPUSH_PLAN_FILE), `${JSON.stringify(buildLogpushPlan(json), null, 2)}\n`)
  }
}
