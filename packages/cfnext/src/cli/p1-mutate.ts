import {
  appendCreateMigration,
  appendDeleteMigration,
  appendRenameMigration,
  assertReservedDo,
} from "../migrations"
import type { CfnextJson, DurableObjectEntry, WorkflowEntry } from "../schema"

export function kebabFromClass(className: string): string {
  return className
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
}

export function screamingName(name: string): string {
  return kebabFromClass(name).replace(/-/g, "_").toUpperCase()
}

export function addDurableObject(
  json: CfnextJson,
  entry: DurableObjectEntry,
): CfnextJson {
  assertReservedDo(entry)
  const current = json.durableObjects ?? []
  const byBinding = current.find((item) => item.binding === entry.binding)
  const byClass = current.find((item) => item.className === entry.className)
  if (byBinding && byBinding.className !== entry.className) {
    throw new Error(
      `binding ${entry.binding} already maps to ${byBinding.className}. Use \`cfnext add do --rename ${byBinding.className}:${entry.className}\`.`,
    )
  }
  if (byClass && byClass.binding !== entry.binding) {
    throw new Error(
      `class ${entry.className} is already bound as ${byClass.binding}`,
    )
  }
  if (byBinding && byClass) return json
  const stored: DurableObjectEntry =
    entry.sqlite === false
      ? { binding: entry.binding, className: entry.className, sqlite: false, ...(entry.scriptName ? { scriptName: entry.scriptName } : {}) }
      : { binding: entry.binding, className: entry.className, ...(entry.scriptName ? { scriptName: entry.scriptName } : {}) }
  return appendCreateMigration(
    { ...json, durableObjects: [...current, stored] },
    entry.className,
    entry.sqlite !== false,
  )
}

export function removeDurableObject(json: CfnextJson, className: string): CfnextJson {
  if (!(json.durableObjects ?? []).some((item) => item.className === className)) {
    throw new Error(`Durable Object class ${className} is not in durableObjects[]`)
  }
  return appendDeleteMigration(json, className)
}

export function renameDurableObject(json: CfnextJson, from: string, to: string): CfnextJson {
  if (!(json.durableObjects ?? []).some((item) => item.className === from)) {
    throw new Error(`Durable Object class ${from} is not in durableObjects[]`)
  }
  assertReservedDo({ binding: to, className: to })
  return appendRenameMigration(json, from, to)
}

export function addWorkflow(json: CfnextJson, entry: WorkflowEntry): CfnextJson {
  const current = json.workflows ?? []
  const index = current.findIndex((item) => item.binding === entry.binding || item.className === entry.className)
  const workflows =
    index === -1
      ? [...current, entry]
      : current.map((item, i) => (i === index ? { ...item, ...entry } : item))
  return { ...json, workflows }
}

export function addCron(json: CfnextJson, expr: string): CfnextJson {
  const cron = json.cron ?? []
  if (cron.includes(expr)) return json
  return { ...json, cron: [...cron, expr] }
}

export function addSecretStore(
  json: CfnextJson,
  entry: { binding: string; storeId: string; secretName: string },
): CfnextJson {
  const store = json.secrets?.store ?? []
  const index = store.findIndex((item) => item.binding === entry.binding)
  const next =
    index === -1
      ? [...store, entry]
      : store.map((item, i) => (i === index ? entry : item))
  return { ...json, secrets: { ...json.secrets, store: next } }
}

export function addRequiredSecret(json: CfnextJson, name: string): CfnextJson {
  const required = json.secrets?.required ?? []
  if (required.includes(name)) return json
  return { ...json, secrets: { ...json.secrets, required: [...required, name] } }
}

export function addVar(json: CfnextJson, name: string, value: string): CfnextJson {
  return { ...json, vars: { ...json.vars, [name]: value } }
}

export function unionRequiredSecrets(existing: string[] | undefined, keys: string[]): string[] {
  const out = [...(existing ?? [])]
  for (const key of keys) {
    if (!out.includes(key)) out.push(key)
  }
  return out
}
