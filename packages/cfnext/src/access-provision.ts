import type { CfnextAccess, CfnextJson } from "./schema"

export type CloudflareAuth = { token: string; accountId: string }

export type AccessHttp = {
  apiBase?: string
  fetch: (input: string, init?: RequestInit) => Promise<Response>
}

export type AccessPlan = {
  kind: "access"
  scriptName: string
  protectPreview: boolean
  protectProduction: boolean
  dashboard: string
  api: {
    method: "PUT"
    path: string
    body: {
      preview_urls: { enabled: boolean }
      production_workers_dev: { enabled: boolean }
    }
  }
  warnings: string[]
  requestIds?: string[]
  steps: string[]
}

export class AccessProvisionError extends Error {
  readonly exitCode: number
  constructor(message: string, exitCode = 1) {
    super(message)
    this.name = "AccessProvisionError"
    this.exitCode = exitCode
  }
}

const API_BASE = "https://api.cloudflare.com/client/v4"
export const PREVIEW_POLICY_NAME = "Cloudflare Workers Preview URLs"
export const ACCOUNT_WIDE_PREVIEW_WARNING =
  "Preview Access uses the shared account-wide policy “Cloudflare Workers Preview URLs”. Email and domain rules apply to every preview-protected Worker on this account."

export function resolveCloudflareAuth(
  env: NodeJS.ProcessEnv = process.env,
): CloudflareAuth | null {
  const token = env.CLOUDFLARE_API_TOKEN
  const accountId = env.CLOUDFLARE_ACCOUNT_ID
  if (token && accountId) return { token, accountId }
  return null
}

export function accessApiBody(access: CfnextAccess): AccessPlan["api"]["body"] {
  return {
    preview_urls: { enabled: access.protectPreview !== false },
    production_workers_dev: { enabled: access.protectProduction === true },
  }
}

export function accessWarnings(access: CfnextAccess): string[] {
  const warnings: string[] = []
  if (access.protectPreview !== false) warnings.push(ACCOUNT_WIDE_PREVIEW_WARNING)
  return warnings
}

export function buildAccessPlan(json: CfnextJson, extra?: { requestIds?: string[] }): AccessPlan {
  const access = json.access ?? {}
  const scriptName = json.name ?? "app"
  const body = accessApiBody(access)
  return {
    kind: "access",
    scriptName,
    protectPreview: access.protectPreview !== false,
    protectProduction: access.protectProduction === true,
    dashboard: `https://dash.cloudflare.com/?to=/:account/workers/services/view/${scriptName}/production/settings`,
    api: {
      method: "PUT",
      path: `/accounts/{account_id}/workers/scripts/${scriptName}/access`,
      body,
    },
    warnings: accessWarnings(access),
    ...(extra?.requestIds?.length ? { requestIds: extra.requestIds } : {}),
    steps: [
      "Open Workers → select this Worker → Settings → Domains & Routes.",
      "Enable Cloudflare Access on Preview URLs (default for `cfnext add access`).",
      "Enable Access on production workers.dev only if protectProduction is true.",
      "Run `cfnext add access --provision` with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to apply via API.",
    ],
  }
}

function apiBase(http: AccessHttp): string {
  return (http.apiBase ?? API_BASE).replace(/\/$/, "")
}

async function cfFetch(
  http: AccessHttp,
  auth: CloudflareAuth,
  path: string,
  init: RequestInit = {},
): Promise<{ json: Record<string, unknown>; headers: Headers }> {
  const response = await http.fetch(`${apiBase(http)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  const json = (await response.json()) as Record<string, unknown>
  if (!response.ok || json.success === false) {
    const errors = Array.isArray(json.errors) ? json.errors : []
    const message =
      errors
        .map((row) => (row && typeof row === "object" && "message" in row ? String(row.message) : ""))
        .filter(Boolean)
        .join("; ") || `Access API ${response.status} ${path}`
    throw new AccessProvisionError(message)
  }
  return { json, headers: response.headers }
}

function includeRules(access: CfnextAccess): Array<Record<string, unknown>> {
  const include: Array<Record<string, unknown>> = []
  for (const email of access.allowedEmails ?? []) {
    include.push({ email: { email } })
  }
  for (const domain of access.allowedDomains ?? []) {
    include.push({ email_domain: { domain } })
  }
  return include
}

async function attachPolicyIncludes(
  http: AccessHttp,
  auth: CloudflareAuth,
  access: CfnextAccess,
  requestIds: string[],
): Promise<void> {
  const include = includeRules(access)
  if (include.length === 0) return
  const query = new URLSearchParams({ name: PREVIEW_POLICY_NAME })
  const listed = await cfFetch(http, auth, `/accounts/${auth.accountId}/access/apps?${query}`)
  const ray = listed.headers.get("cf-ray")
  if (ray) requestIds.push(ray)
  const apps = Array.isArray(listed.json.result) ? listed.json.result : []
  const app = apps.find((row) => row && typeof row === "object" && (row as { name?: string }).name === PREVIEW_POLICY_NAME) as
    | { id?: string }
    | undefined
  if (!app?.id) return
  const updated = await cfFetch(http, auth, `/accounts/${auth.accountId}/access/apps/${app.id}`, {
    method: "PUT",
    body: JSON.stringify({
      policies: [{ decision: "allow", include }],
    }),
  })
  const updateRay = updated.headers.get("cf-ray")
  if (updateRay) requestIds.push(updateRay)
}

export async function provisionAccess(
  json: CfnextJson,
  auth: CloudflareAuth,
  http: AccessHttp,
): Promise<{ json: CfnextJson; plan: AccessPlan; warnings: string[] }> {
  const access = json.access ?? {}
  const scriptName = json.name ?? "app"
  const body = accessApiBody(access)
  const requestIds: string[] = []
  const put = await cfFetch(http, auth, `/accounts/${auth.accountId}/workers/scripts/${scriptName}/access`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
  const ray = put.headers.get("cf-ray")
  if (ray) requestIds.push(ray)

  const result = (put.json.result ?? {}) as { aud?: string }
  if (includeRules(access).length > 0) {
    await attachPolicyIncludes(http, auth, access, requestIds)
  }

  const nextAccess: CfnextAccess = {
    ...access,
    aud: result.aud ?? access.aud,
    previewPolicyName: PREVIEW_POLICY_NAME,
    productionPolicyName: access.protectProduction ? `${scriptName} - Production` : null,
  }
  const next: CfnextJson = { ...json, access: nextAccess }
  const warnings = accessWarnings(nextAccess)
  return { json: next, plan: buildAccessPlan(next, { requestIds }), warnings }
}
