import type { WranglerConfig } from "./wrangler"

export type BindingKind = "d1" | "r2" | "kv" | "hyperdrive" | "ai" | "vectorize" | "queue"

export type BindingRequest = {
  kind: BindingKind
  binding?: string
  resourceName?: string
}

export const BINDING_DEFAULTS: Record<
  BindingKind,
  { binding: string; resource: (app: string) => string }
> = {
  d1: { binding: "DB", resource: (app) => `${app}-db` },
  r2: { binding: "BUCKET", resource: (app) => `${app}-bucket` },
  kv: { binding: "KV", resource: (app) => `${app}-kv` },
  hyperdrive: { binding: "HYPERDRIVE", resource: (app) => `${app}-hyperdrive` },
  ai: { binding: "AI", resource: () => "AI" },
  vectorize: { binding: "VECTORIZE", resource: (app) => `${app}-index` },
  queue: { binding: "QUEUE", resource: (app) => `${app}-queue` },
}

export function applyBinding(
  wrangler: WranglerConfig,
  req: BindingRequest,
): { wrangler: WranglerConfig; binding: string; resourceName: string } {
  const defaults = BINDING_DEFAULTS[req.kind]
  const binding = req.binding ?? defaults.binding
  const resourceName = req.resourceName ?? defaults.resource(wrangler.name)

  switch (req.kind) {
    case "d1": {
      const list = wrangler.d1_databases ?? []
      if (!list.some((item) => item.binding === binding)) {
        list.push({
          binding,
          database_name: resourceName,
          database_id: "replace-after-wrangler-d1-create",
          migrations_dir: "migrations",
        })
      }
      wrangler.d1_databases = list
      break
    }
    case "r2": {
      const list = wrangler.r2_buckets ?? []
      if (!list.some((item) => item.binding === binding)) {
        list.push({ binding, bucket_name: resourceName })
      }
      wrangler.r2_buckets = list
      break
    }
    case "kv": {
      const list = wrangler.kv_namespaces ?? []
      if (!list.some((item) => item.binding === binding)) {
        list.push({ binding, id: "replace-after-wrangler-kv-namespace-create" })
      }
      wrangler.kv_namespaces = list
      break
    }
    case "hyperdrive": {
      const list = wrangler.hyperdrive ?? []
      if (!list.some((item) => item.binding === binding)) {
        list.push({ binding, id: "replace-after-wrangler-hyperdrive-create" })
      }
      wrangler.hyperdrive = list
      break
    }
    case "ai": {
      wrangler.ai = { binding }
      break
    }
    case "vectorize": {
      const list = wrangler.vectorize ?? []
      if (!list.some((item) => item.binding === binding)) {
        list.push({ binding, index_name: resourceName })
      }
      wrangler.vectorize = list
      break
    }
    case "queue": {
      const queues = wrangler.queues ?? {}
      const producers = queues.producers ?? []
      if (!producers.some((item) => item.binding === binding)) {
        producers.push({ binding, queue: resourceName })
      }
      wrangler.queues = { ...queues, producers }
      break
    }
  }

  return { wrangler, binding, resourceName }
}

export function provisionCommand(
  kind: BindingKind,
  resourceName: string,
): string | null {
  switch (kind) {
    case "d1":
      return `bun x wrangler d1 create ${resourceName}`
    case "r2":
      return `bun x wrangler r2 bucket create ${resourceName}`
    case "kv":
      return `bun x wrangler kv namespace create ${resourceName}`
    case "vectorize":
      return `bun x wrangler vectorize create ${resourceName} --dimensions 768 --metric cosine`
    case "queue":
      return `bun x wrangler queues create ${resourceName}`
    case "hyperdrive":
      return `bun x wrangler hyperdrive create ${resourceName} --connection-string "$DATABASE_URL"`
    case "ai":
      return null
  }
}

export const BINDING_KINDS = Object.keys(BINDING_DEFAULTS) as BindingKind[]
