import { PREVIEW_POLICY_NAME } from "../access-provision"
import type { CfnextFlagship, CfnextJson } from "../schema"

export function addAccess(
  json: CfnextJson,
  opts: {
    protectProduction?: boolean
    allowedEmails?: string[]
    allowedDomains?: string[]
  } = {},
): CfnextJson {
  const existing = json.access ?? {}
  const name = json.name ?? "app"
  const protectProduction = opts.protectProduction ?? existing.protectProduction ?? false
  return {
    ...json,
    access: {
      ...existing,
      protectPreview: existing.protectPreview ?? true,
      protectProduction,
      ...(opts.allowedEmails?.length ? { allowedEmails: opts.allowedEmails } : {}),
      ...(opts.allowedDomains?.length ? { allowedDomains: opts.allowedDomains } : {}),
      previewPolicyName: existing.previewPolicyName ?? PREVIEW_POLICY_NAME,
      productionPolicyName:
        existing.productionPolicyName !== undefined
          ? existing.productionPolicyName
          : protectProduction
            ? `${name} - Production`
            : null,
      dev: existing.dev ?? {
        aud: existing.aud ?? name,
        identity: { email: "dev@example.com" },
      },
    },
  }
}

function flagshipList(flagship: CfnextFlagship | undefined): Array<{
  binding: string
  appId?: string
  remote?: boolean
}> {
  if (!flagship) return []
  return Array.isArray(flagship) ? flagship : [flagship]
}

function storeFlagship(
  list: Array<{ binding: string; appId?: string; remote?: boolean }>,
): CfnextFlagship {
  return list.length === 1 ? list[0]! : list
}

export function addFlagship(
  json: CfnextJson,
  entry: { binding: string; appId?: string; remote?: boolean },
): CfnextJson {
  const list = flagshipList(json.flagship)
  const index = list.findIndex((item) => item.binding === entry.binding)
  const next =
    index === -1
      ? [...list, entry]
      : list.map((item, i) => (i === index ? { ...item, ...entry } : item))
  return { ...json, flagship: storeFlagship(next) }
}

export function addLogpush(
  json: CfnextJson,
  job?: { dataset: string; destination?: string; name?: string },
): CfnextJson {
  const jobs = [...(json.logpush?.jobs ?? [])]
  if (job) {
    const index = jobs.findIndex((item) => item.dataset === job.dataset && item.destination === job.destination)
    if (index === -1) jobs.push(job)
    else jobs[index] = { ...jobs[index], ...job }
  }
  return { ...json, logpush: { ...json.logpush, enabled: true, ...(jobs.length ? { jobs } : {}) } }
}

export function addWebAnalytics(
  json: CfnextJson,
  web: { token: string; spa?: boolean },
): CfnextJson {
  return {
    ...json,
    analytics: {
      ...json.analytics,
      web: { token: web.token, spa: web.spa ?? true },
    },
  }
}
