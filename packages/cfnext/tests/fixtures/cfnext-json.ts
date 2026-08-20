import type { CfnextJson } from "../../src/schema"

export const p0Fixture = {
  $schema: "./node_modules/cfnext/schema/cfnext.schema.json",
  name: "demo",
  target: "ssr",
  bindings: {
    d1: [{ binding: "DB", databaseName: "demo-db", migrationsDir: "migrations" }],
    r2: [{ binding: "BUCKET", bucketName: "demo-bucket" }],
    kv: [{ binding: "KV" }],
    hyperdrive: [{ binding: "HYPERDRIVE", id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }],
    vectorize: [{ binding: "VECTORIZE", indexName: "demo-index" }],
    queues: [{ binding: "QUEUE", queue: "demo-queue" }],
  },
  ai: { binding: "AI" },
} satisfies CfnextJson

export const p1Fixture = {
  ...p0Fixture,
  durableObjects: [{ binding: "RATE_LIMITER", className: "RateLimiter" }],
  workflows: [{ name: "orders", binding: "ORDERS", className: "OrderWorkflow" }],
  cron: ["0 * * * *"],
  vars: { APP_ENV: "production" },
  secrets: {
    required: ["CLERK_SECRET_KEY"],
    store: [{ binding: "STRIPE", storeId: "demo", secretName: "stripe" }],
  },
  migrations: [{ tag: "cfnext-do-RateLimiter", newSqliteClasses: ["RateLimiter"] }],
  bindings: {
    ...p0Fixture.bindings,
    queues: [{ binding: "QUEUE", queue: "demo-queue", consume: true }],
    versionMetadata: true,
  },
} satisfies CfnextJson

export const exampleA = {
  $schema: "./node_modules/cfnext/schema/cfnext.schema.json",
  name: "acme",
  target: "ssr",
  securityHeaders: true,
  images: { unoptimized: false },
  protect: {
    prefixes: ["/dashboard", "/account"],
    signInPath: "/sign-in",
  },
  bindings: {
    d1: [
      {
        binding: "DB",
        databaseName: "acme-db",
        id: "11111111-1111-1111-1111-111111111111",
        previewId: "33333333-3333-3333-3333-333333333333",
        migrationsDir: "migrations",
      },
    ],
    r2: [{ binding: "BUCKET", bucketName: "acme-bucket" }],
    kv: [{ binding: "KV", id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }],
  },
  secrets: {
    required: ["CLERK_SECRET_KEY", "STRIPE_SECRET_KEY"],
  },
  vars: {
    APP_ENV: "production",
  },
  access: {
    protectPreview: true,
    protectProduction: false,
    allowedDomains: ["acme.com"],
    dev: {
      aud: "acme",
      identity: { email: "dev@acme.com" },
    },
  },
  email: {
    sending: {
      binding: "EMAIL",
      allowedSenders: ["noreply@acme.com"],
    },
    routing: {
      enabled: true,
      addresses: ["support@acme.com"],
    },
  },
  media: {
    images: {
      binding: "IMAGES",
      loader: {
        enabled: true,
        kind: "cdn-cgi",
        zoneOrigin: "https://acme.com",
        remotePatterns: [{ protocol: "https", hostname: "images.acme.com" }],
      },
    },
  },
  observability: {
    enabled: true,
    traces: { enabled: true },
    logs: { enabled: true, invocationLogs: true },
  },
  env: {
    staging: {
      vars: { APP_ENV: "staging" },
      bindings: {
        d1: [{ binding: "DB", id: "22222222-2222-2222-2222-222222222222" }],
      },
    },
    development: {
      vars: { APP_ENV: "development" },
    },
  },
} satisfies CfnextJson

export const exampleB = {
  $schema: "./node_modules/cfnext/schema/cfnext.schema.json",
  name: "orion",
  target: "ssr",
  ai: {
    binding: "AI",
    models: {
      chat: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    },
    search: [{ binding: "AI_SEARCH", instanceName: "docs" }],
  },
  bindings: {
    vectorize: [{ binding: "VECTORIZE", indexName: "orion-index", dimensions: 768, metric: "cosine" }],
  },
  agents: [{ className: "ResearchAgent" }],
  workflows: [{ name: "ingest", binding: "INGEST", className: "IngestWorkflow" }],
} satisfies CfnextJson
