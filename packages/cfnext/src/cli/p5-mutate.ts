import type { CfnextBindings, CfnextJson } from "../schema"

function upsert<T extends { binding: string }>(
  list: T[] | undefined,
  binding: string,
  create: () => T,
  patch: (item: T) => T,
): T[] {
  const items = [...(list ?? [])]
  const index = items.findIndex((item) => item.binding === binding)
  if (index === -1) return [...items, create()]
  items[index] = patch({ ...items[index] })
  return items
}

function withBindings(json: CfnextJson, bindings: CfnextBindings): CfnextJson {
  const nonEmpty = Object.fromEntries(Object.entries(bindings).filter(([, v]) => v !== undefined))
  return { ...json, bindings: { ...json.bindings, ...nonEmpty } }
}

export function addAnalyticsEngine(
  json: CfnextJson,
  entry: { binding: string; dataset?: string },
): CfnextJson {
  const engine = upsert(
    json.analytics?.engine,
    entry.binding,
    () => ({ binding: entry.binding, ...(entry.dataset ? { dataset: entry.dataset } : {}) }),
    (item) => ({ ...item, ...(entry.dataset ? { dataset: entry.dataset } : {}) }),
  )
  return { ...json, analytics: { ...json.analytics, engine } }
}

export function addPipeline(
  json: CfnextJson,
  entry: { binding: string; stream?: string; remote?: boolean },
): CfnextJson {
  const pipelines = upsert(
    json.bindings?.pipelines,
    entry.binding,
    () => ({
      binding: entry.binding,
      ...(entry.stream ? { stream: entry.stream } : {}),
      ...(entry.remote ? { remote: true } : {}),
    }),
    (item) => ({
      ...item,
      ...(entry.stream ? { stream: entry.stream } : {}),
      ...(entry.remote ? { remote: true } : {}),
    }),
  )
  return withBindings(json, { pipelines })
}

export function addBrowser(
  json: CfnextJson,
  entry: { binding: string; remote?: boolean },
): CfnextJson {
  return withBindings(json, {
    browser: { binding: entry.binding, ...(entry.remote ? { remote: true } : {}) },
  })
}

export function addWorkerLoader(json: CfnextJson, entry: { binding: string }): CfnextJson {
  const workerLoaders = upsert(
    json.bindings?.workerLoaders,
    entry.binding,
    () => ({ binding: entry.binding }),
    (item) => ({ ...item, binding: entry.binding }),
  )
  return withBindings(json, { workerLoaders })
}

export function addService(
  json: CfnextJson,
  entry: { binding: string; service: string; entrypoint?: string },
): CfnextJson {
  const services = upsert(
    json.bindings?.services,
    entry.binding,
    () => ({
      binding: entry.binding,
      service: entry.service,
      ...(entry.entrypoint ? { entrypoint: entry.entrypoint } : {}),
    }),
    (item) => ({
      ...item,
      service: entry.service,
      ...(entry.entrypoint ? { entrypoint: entry.entrypoint } : {}),
    }),
  )
  return withBindings(json, { services })
}
