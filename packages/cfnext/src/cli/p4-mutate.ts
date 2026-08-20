import { appendCreateMigration, assertReservedDo } from "../migrations"
import type { AgentEntry, CfnextJson, CfnextModelAlias, WorkflowEntry } from "../schema"
import { addWorkflow, kebabFromClass, screamingName } from "./p1-mutate"

export type AiSearchAddOpts = {
  binding: string
  instanceName?: string
  namespace?: string
  remote?: boolean
}

export function addAiSearch(json: CfnextJson, opts: AiSearchAddOpts): CfnextJson {
  if (Boolean(opts.instanceName) === Boolean(opts.namespace)) {
    throw new Error("Usage: cfnext add ai-search --name <instance> | --namespace <ns>")
  }
  const entry = {
    binding: opts.binding,
    ...(opts.instanceName ? { instanceName: opts.instanceName } : {}),
    ...(opts.namespace ? { namespace: opts.namespace } : {}),
    ...(opts.remote ? { remote: true } : {}),
  }
  const search = [...(json.ai?.search ?? [])]
  const index = search.findIndex((item) => item.binding === opts.binding)
  if (index === -1) search.push(entry)
  else search[index] = { ...search[index], ...entry }
  return { ...json, ai: { ...json.ai, search } }
}

export function addAiGateway(
  json: CfnextJson,
  opts: { id?: string; skip?: boolean } = {},
): CfnextJson {
  return {
    ...json,
    ai: {
      ...json.ai,
      gateway: {
        id: opts.id ?? json.ai?.gateway?.id ?? "default",
        ...(opts.skip || json.ai?.gateway?.skip ? { skip: true } : {}),
      },
    },
  }
}

export function addModel(json: CfnextJson, alias: string, value: CfnextModelAlias): CfnextJson {
  return {
    ...json,
    ai: {
      ...json.ai,
      models: { ...json.ai?.models, [alias]: value },
    },
  }
}

export function addWebsearch(
  json: CfnextJson,
  entry: { binding: string; remote?: boolean },
): CfnextJson {
  return {
    ...json,
    ai: {
      ...json.ai,
      websearch: {
        binding: entry.binding,
        ...(entry.remote ? { remote: true } : {}),
      },
    },
  }
}

export function addMcpPortal(
  json: CfnextJson,
  entry: { name: string; url?: string },
): CfnextJson {
  const portals = [...(json.ai?.mcpPortals ?? [])]
  const index = portals.findIndex((item) => item.name === entry.name)
  const next =
    index === -1
      ? [...portals, entry]
      : portals.map((item, i) => (i === index ? { ...item, ...entry } : item))
  return { ...json, ai: { ...json.ai, mcpPortals: next } }
}

export function addAgent(
  json: CfnextJson,
  entry: AgentEntry,
  opts: { memory?: boolean } = {},
): CfnextJson {
  const className = entry.className
  const binding = entry.binding ?? screamingName(className)
  assertReservedDo({ binding, className })
  if (
    (json.durableObjects ?? []).some(
      (item) => item.className === className || item.binding === binding,
    )
  ) {
    throw new Error(`agent ${className} is already defined as a Durable Object`)
  }
  const current = json.agents ?? []
  const existing = current.find((item) => item.className === className || item.binding === binding)
  const memory =
    opts.memory === false
      ? undefined
      : (entry.memory ??
        existing?.memory ?? {
          binding: "AGENT_MEMORY",
          namespace: `${json.name ?? "app"}-memory`,
        })
  const stored: AgentEntry = {
    className,
    binding,
    ...(memory ? { memory } : {}),
    ...(entry.workflow ? { workflow: entry.workflow } : existing?.workflow ? { workflow: existing.workflow } : {}),
  }
  const agents = existing
    ? current.map((item) =>
        item.className === className || item.binding === binding ? stored : item,
      )
    : [...current, stored]
  let next: CfnextJson = appendCreateMigration({ ...json, agents }, className, true)
  if (entry.workflow) next = addWorkflow(next, entry.workflow)
  return next
}

export function workflowFromClass(className: string): WorkflowEntry {
  return {
    name: kebabFromClass(className),
    binding: screamingName(className),
    className,
  }
}
