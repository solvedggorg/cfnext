import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { buildAccessPlan } from "../access-provision"
import type { CfnextJson } from "../schema"

export const ACCESS_PLAN_FILE = ".cloudflare/generated/access.plan.json"
export const LOGPUSH_PLAN_FILE = ".cloudflare/generated/logpush.plan.json"
export const EMAIL_PLAN_FILE = ".cloudflare/generated/email-routing.plan.json"
export const REALTIME_PLAN_FILE = ".cloudflare/generated/realtime.plan.json"
export const MCP_PLAN_FILE = ".cloudflare/generated/mcp-portals.plan.json"

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

export function buildEmailRoutingPlan(json: CfnextJson): Record<string, unknown> {
  const routing = json.email?.routing
  return {
    kind: "email-routing",
    enabled: routing?.enabled === true,
    addresses: routing?.addresses ?? [],
    stub: "email.ts",
    wrangler: null,
    dashboard: "https://dash.cloudflare.com/?to=/:account/email/routing/routes",
    note: "Email Routing is L4. Generate wires Worker email() from email.ts. MX/TXT and destination addresses are configured in the dashboard, not wrangler.",
    steps: [
      "Onboard the zone to Email Routing (Email → Email Routing).",
      "Add MX and TXT records the dashboard prints for the zone.",
      "Create a routing address (or catch-all) that delivers to this Worker.",
      "Implement email() in email.ts (the stub currently setRejects).",
      "Deploy, then send a test message to an address in this plan.",
    ],
  }
}

export function buildRealtimePlan(json: CfnextJson): Record<string, unknown> {
  const realtime = json.media?.realtime
  return {
    kind: "realtime",
    enabled: realtime?.enabled !== false,
    appId: realtime?.appId ?? null,
    wrangler: null,
    dashboard: "https://dash.cloudflare.com/?to=/:account/realtime",
    docs: "https://developers.cloudflare.com/realtime/",
    note: "Realtime has no wrangler key in the current schema. Catalog + this plan only. If a wrangler key appears, put it in passthrough.",
    steps: [
      "Create a Realtime / RealtimeKit app in the dashboard.",
      "Use the Cloudflare Realtime SDK in the Next app (client + Worker token route).",
      "Do not expect generate to emit a wrangler realtime field.",
    ],
  }
}

export function buildMcpPortalsPlan(json: CfnextJson): Record<string, unknown> {
  const portals = json.ai?.mcpPortals ?? []
  return {
    kind: "mcp-portals",
    wrangler: null,
    portals,
    dashboard: "https://dash.cloudflare.com/?to=/:account/access",
    docs: "https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/",
    note: "MCP Portals are Zero Trust / Access AI-controls. They are not a Worker binding. Generate writes this plan only.",
    steps: [
      "Open Cloudflare One → Access → AI controls / MCP portals.",
      "Create a portal matching each name in this plan.",
      "Attach Access policies so only intended identities can reach MCP servers.",
      "Copy the portal URL into cfnext.json ai.mcpPortals[].url if the app needs it.",
      "Do not put portal secrets or tokens in cfnext.json.",
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
  if (json.email?.routing?.enabled) {
    await writeFile(join(projectDir, EMAIL_PLAN_FILE), `${JSON.stringify(buildEmailRoutingPlan(json), null, 2)}\n`)
  }
  if (json.media?.realtime) {
    await writeFile(join(projectDir, REALTIME_PLAN_FILE), `${JSON.stringify(buildRealtimePlan(json), null, 2)}\n`)
  }
  if (json.ai?.mcpPortals?.length) {
    await writeFile(join(projectDir, MCP_PLAN_FILE), `${JSON.stringify(buildMcpPortalsPlan(json), null, 2)}\n`)
  }
}
