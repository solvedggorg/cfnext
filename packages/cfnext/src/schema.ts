export type CfnextProtectJson = {
  prefixes?: string[]
  signInPath?: string
  sessionCookiePattern?: string
  shells?: Array<{ prefix: string; asset: string }>
}

export type BindingName = {
  binding: string
  remote?: boolean
  omit?: boolean
}

export type D1Binding = BindingName & {
  databaseName?: string
  id?: string
  previewId?: string
  migrationsDir?: string
}

export type KvBinding = BindingName & {
  id?: string
  previewId?: string
}

export type R2Binding = BindingName & {
  bucketName?: string
  previewBucketName?: string
  jurisdiction?: string
}

export type HyperdriveBinding = BindingName & {
  id?: string
  localConnectionString?: string
}

export type VectorizeBinding = BindingName & {
  indexName?: string
  dimensions?: number
  metric?: "cosine" | "euclidean" | "dot-product"
}

export type QueueBinding = {
  binding: string
  queue: string
  omit?: boolean
  produce?: boolean
  consume?: boolean
  maxBatchSize?: number
  maxBatchTimeout?: number
  maxRetries?: number
  deadLetterQueue?: string
  deliveryDelay?: number
}

export type CfnextBindings = {
  d1?: D1Binding[]
  kv?: KvBinding[]
  r2?: R2Binding[]
  hyperdrive?: HyperdriveBinding[]
  vectorize?: VectorizeBinding[]
  queues?: QueueBinding[]
  pipelines?: Array<BindingName & { stream?: string }>
  browser?: BindingName
  services?: Array<{ binding: string; service: string; entrypoint?: string }>
  workerLoaders?: BindingName[]
  versionMetadata?: boolean | BindingName
  unsafe?: Array<{ name: string; type: string; [key: string]: unknown }>
}

export type CfnextMigration = {
  tag: string
  newSqliteClasses?: string[]
  newClasses?: string[]
  deletedClasses?: string[]
  renamedClasses?: Array<{ from: string; to: string }>
}

export type DurableObjectEntry = {
  binding: string
  className: string
  scriptName?: string
  sqlite?: boolean
}

export type WorkflowEntry = {
  name: string
  binding: string
  className: string
  scriptName?: string
  schedules?: string | string[]
}

export type AgentEntry = {
  className: string
  binding?: string
  memory?: { binding: string; namespace: string }
  workflow?: WorkflowEntry
}

export type CfnextSecrets = {
  required?: string[]
  store?: Array<{ binding: string; storeId: string; secretName: string }>
}

export type CfnextAccess = {
  protectPreview?: boolean
  protectProduction?: boolean
  allowedEmails?: string[]
  allowedDomains?: string[]
  aud?: string
  previewPolicyName?: string
  productionPolicyName?: string | null
  dev?: { aud: string; identity?: Record<string, unknown> }
}

export type CfnextObservability = {
  enabled?: boolean
  headSamplingRate?: number
  logs?: {
    enabled?: boolean
    headSamplingRate?: number
    invocationLogs?: boolean
    persist?: boolean
    destinations?: string[]
  }
  traces?: {
    enabled?: boolean
    headSamplingRate?: number
    persist?: boolean
    destinations?: string[]
  }
}

export type CfnextEmail = {
  sending?: {
    binding?: string
    destinationAddress?: string
    allowedDestinations?: string[]
    allowedSenders?: string[]
    remote?: boolean
  }
  routing?: {
    enabled?: boolean
    addresses?: string[]
  }
}

export type CfnextAi = {
  binding?: string
  remote?: boolean
  gateway?: { id?: string; skip?: boolean }
  models?: Record<string, string>
  search?: Array<{
    binding: string
    instanceName?: string
    namespace?: string
    remote?: boolean
  }>
  vectorize?: VectorizeBinding[]
  websearch?: BindingName
  mcpPortals?: Array<{ name: string; url?: string }>
}

export type CfnextMedia = {
  images?: {
    binding?: string
    remote?: boolean
    loader?: {
      enabled?: boolean
      kind?: "cdn-cgi" | "imagedelivery"
      zoneOrigin?: string
      accountHash?: string
      remotePatterns?: Array<Record<string, unknown>>
    }
  }
  stream?: { binding?: string; remote?: boolean }
  transforms?: { binding?: string; remote?: boolean }
  realtime?: { enabled?: boolean; appId?: string }
}

export type CfnextFlagship =
  | { binding: string; appId?: string; remote?: boolean }
  | Array<{ binding: string; appId?: string; remote?: boolean }>

export type CfnextLogpush = {
  enabled?: boolean
  jobs?: Array<{ dataset: string; destination?: string; name?: string }>
}

export type CfnextAnalytics = {
  web?: { token?: string; spa?: boolean }
  engine?: Array<BindingName & { dataset?: string }>
}

export type CfnextEnvOverlay = {
  compatibilityDate?: string
  compatibilityFlags?: string[]
  workersDev?: boolean
  previewUrls?: boolean
  bindings?: CfnextBindings
  durableObjects?: DurableObjectEntry[]
  workflows?: WorkflowEntry[]
  agents?: AgentEntry[]
  cron?: string[]
  vars?: Record<string, string | number | boolean>
  secrets?: CfnextSecrets
  access?: CfnextAccess
  observability?: CfnextObservability
  logpush?: CfnextLogpush
  analytics?: CfnextAnalytics
  email?: CfnextEmail
  ai?: CfnextAi
  media?: CfnextMedia
  flagship?: CfnextFlagship
  passthrough?: Record<string, unknown>
}

export type CfnextJson = {
  $schema?: string
  name?: string
  target?: "workers" | "ssr" | "container"
  compatibilityDate?: string
  compatibilityFlags?: string[]
  workersDev?: boolean
  previewUrls?: boolean
  protect?: CfnextProtectJson
  securityHeaders?: boolean
  images?: { unoptimized?: boolean }
  bindings?: CfnextBindings
  migrations?: CfnextMigration[]
  durableObjects?: DurableObjectEntry[]
  workflows?: WorkflowEntry[]
  agents?: AgentEntry[]
  cron?: string[]
  vars?: Record<string, string | number | boolean>
  secrets?: CfnextSecrets
  access?: CfnextAccess
  observability?: CfnextObservability
  logpush?: CfnextLogpush
  analytics?: CfnextAnalytics
  email?: CfnextEmail
  ai?: CfnextAi
  media?: CfnextMedia
  flagship?: CfnextFlagship
  env?: Record<string, CfnextEnvOverlay>
  passthrough?: Record<string, unknown>
}
