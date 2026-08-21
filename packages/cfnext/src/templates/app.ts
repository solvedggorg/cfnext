import type { BindingKind } from "../bindings"
import { BINDING_DEFAULTS } from "../bindings"
import { CFNEXT_VERSION, REGISTRY_URL } from "../constants"
import { compileWrangler } from "../generate/wrangler"
import { stampGenerated } from "../generate/hash"
import { renderRuntimeConfig } from "../generate/runtime-config"
import { GENERATED_HANDLERS, GENERATED_WORKER, renderGeneratedHandlers, renderGeneratedWorker } from "../generate/worker"
import { seedContainerMigration } from "../migrations"
import { stringifyJsonc } from "../jsonc"
import { PROTECTED_PREFIXES, clerkShells } from "../protect-clerk"
import type { CfnextConfig, DeployTarget } from "../config"
import { normalizeConfig } from "../config"
import type { CfnextJson } from "../schema"

export type InitOptions = {
  dirName: string
  name: string
  target: DeployTarget
  bindings: BindingKind[]
  auth?: "clerk"
  packageSpecifier: string
}

export function scaffoldConfig(opts: InitOptions): CfnextConfig {
  return normalizeConfig({
    name: opts.name,
    target: opts.target,
    protect:
      opts.auth === "clerk"
        ? {
            prefixes: [...PROTECTED_PREFIXES],
            signInPath: "/sign-in",
            shells: clerkShells(),
          }
        : undefined,
    images: { unoptimized: opts.target !== "container" },
  })
}

export function scaffoldJson(opts: InitOptions): CfnextJson {
  const json: CfnextJson = {
    $schema: "./node_modules/cfnext/schema/cfnext.schema.json",
    name: opts.name,
    target: opts.target,
    images: { unoptimized: opts.target !== "container" },
    securityHeaders: true,
    bindings: {},
  }
  if (opts.auth === "clerk") {
    json.protect = {
      prefixes: [...PROTECTED_PREFIXES],
      signInPath: "/sign-in",
    }
  }
  for (const kind of opts.bindings) {
    const resource = BINDING_DEFAULTS[kind].resource(opts.name)
    const binding = BINDING_DEFAULTS[kind].binding
    switch (kind) {
      case "d1":
        json.bindings!.d1 = [{ binding, databaseName: resource, migrationsDir: "migrations" }]
        break
      case "r2":
        json.bindings!.r2 = [{ binding, bucketName: resource }]
        break
      case "kv":
        json.bindings!.kv = [{ binding }]
        break
      case "hyperdrive":
        throw new Error(
          "hyperdrive cannot be scaffolded without an id. Use `cfnext add hyperdrive --id` or `--provision`.",
        )
      case "ai":
        json.ai = { binding }
        break
      case "vectorize":
        json.bindings!.vectorize = [{ binding, indexName: resource }]
        break
      case "queue":
        json.bindings!.queues = [{ binding, queue: resource }]
        break
    }
  }
  if (json.bindings && Object.keys(json.bindings).length === 0) delete json.bindings
  return seedContainerMigration(json)
}

export function renderFiles(opts: InitOptions): Record<string, string> {
  const config = scaffoldConfig(opts)
  const json = scaffoldJson(opts)
  const wrangler = compileWrangler(config, json)
  const wranglerText = stampGenerated(stringifyJsonc(wrangler), CFNEXT_VERSION)

  const files: Record<string, string> = {
    "package.json": packageJson(opts),
    "tsconfig.json": tsconfig(),
    "next.config.ts": nextConfig(),
    "cfnext.json": stringifyJsonc(json),
    "cfnext.config.generated.ts": renderRuntimeConfig(
      config,
      opts.auth === "clerk" ? { shells: "clerkShells" } : null,
    ),
    "wrangler.jsonc": wranglerText,
    [GENERATED_WORKER]: renderGeneratedWorker(),
    [GENERATED_HANDLERS]: renderGeneratedHandlers(json),
    "worker.ts": workerFile(opts.target),
    "bunfig.toml": bunfig(),
    ".gitignore": gitignore(),
    "README.md": readme(opts),
    "cloudflare-env.d.ts": envStub(),
    "app/layout.tsx": layout(opts.name),
    "app/page.tsx": page(opts),
    "app/globals.css": css(),
    "app/api/health/route.ts": health(opts.target),
    "public/.gitkeep": "",
  }

  if (opts.auth === "clerk") {
    files["cfnext.hooks.ts"] = hooksFile()
  }

  if (opts.target === "ssr") {
    files["ssr-runtime.ts"] = ssrRuntimeStub()
    files["app/live/page.tsx"] = livePage()
  }

  if (opts.target === "container") {
    files.Dockerfile = dockerfile()
    files[".dockerignore"] = dockerignore()
  }

  if (opts.bindings.includes("d1")) {
    files["migrations/0001_init.sql"] =
      "-- Apply with: bun x wrangler d1 migrations apply DB --local\n"
  }

  return files
}

function packageJson(opts: InitOptions): string {
  const deps: Record<string, string> = {
    next: "16.2.6",
    react: "19.2.4",
    "react-dom": "19.2.4",
  }
  const devDeps: Record<string, string> = {
    cfnext: opts.packageSpecifier,
    wrangler: "^4.123.0",
    typescript: "^5.9.3",
    "@types/bun": "^1.3.14",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.4",
  }
  if (opts.target === "container") {
    devDeps["@cloudflare/containers"] = "^0.0.28"
  }
  return `${JSON.stringify(
    {
      name: opts.name,
      version: "0.1.0",
      private: true,
      type: "module",
      packageManager: "bun@1.3.14",
      engines: { bun: ">=1.2.0" },
      scripts: {
        dev: "bun --bun next dev",
        build: "cfnext build",
        start: "bun --bun next start",
        deploy: "cfnext deploy",
        preview: "cfnext preview",
        "cf:dev": "cfnext dev",
        "cf:env": "cfnext env",
        "cf:types": "cfnext types",
        "cf:add": "cfnext add",
        "cf:generate": "cfnext generate",
      },
      dependencies: deps,
      devDependencies: devDeps,
    },
    null,
    2,
  )}\n`
}

function tsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "react-jsx",
        incremental: true,
        plugins: [{ name: "next" }],
        paths: { "@/*": ["./*"] },
      },
      include: [
        "next-env.d.ts",
        "next.config.ts",
        "cfnext.config.generated.ts",
        "cfnext.hooks.ts",
        "ssr-runtime.ts",
        "worker.ts",
        "cloudflare-env.d.ts",
        "**/*.ts",
        "**/*.tsx",
        ".next/types/**/*.ts",
      ],
      exclude: ["node_modules"],
    },
    null,
    2,
  )}\n`
}

function nextConfig(): string {
  return `import type { NextConfig } from "next"
import { withCfnext } from "cfnext"

const nextConfig: NextConfig = {
  poweredByHeader: false,
}

export default withCfnext(nextConfig)
`
}

function hooksFile(): string {
  return `export { clerkShells } from "cfnext/protect/clerk"
`
}

function workerFile(target: DeployTarget): string {
  if (target === "ssr") {
    return `import { createSsrWorker } from "cfnext/worker/ssr"
import config from "./cfnext.config.generated"
import { handlers, loaders, prerenders } from "./ssr-runtime"

export default createSsrWorker({ config, handlers, loaders, prerenders })
`
  }
  if (target === "container") {
    return `import { Container } from "@cloudflare/containers"
import { createContainerWorker } from "cfnext/worker/container"
import config from "./cfnext.config.generated"

export class NextApp extends Container {
  defaultPort = 8080
  sleepAfter = "10m"
  enableInternet = true
  pingEndpoint = "/api/health"
}

export default createContainerWorker(config)
`
  }
  return `import { createAssetsWorker } from "cfnext/worker"
import config from "./cfnext.config.generated"

export default createAssetsWorker(config)
`
}

function layout(name: string): string {
  return `import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: ${JSON.stringify(name)},
  description: "Next.js on Cloudflare via cfnext",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`
}

function page(opts: InitOptions): string {
  return `export default function Home() {
  return (
    <main>
      <p className="eyebrow">cfnext</p>
      <h1>${opts.name}</h1>
      <p>
        Target: <code>${opts.target}</code>
        ${opts.bindings.length > 0 ? ` · Bindings: <code>${opts.bindings.join(", ")}</code>` : ""}
      </p>
      <ul>
        <li><code>bun run dev</code> — Next.js dev server</li>
        <li><code>bun run deploy</code> — pack + wrangler deploy</li>
        <li><code>bunx cfnext add d1</code> — scaffold a D1 binding</li>
        ${opts.target === "ssr" ? "<li><code>/live</code> — request-time SSR using <code>headers()</code></li>" : ""}
      </ul>
    </main>
  )
}
`
}

function css(): string {
  return `:root {
  color-scheme: dark;
  font-family: ui-sans-serif, system-ui, sans-serif;
  background: #09090b;
  color: #fafafa;
}

body {
  margin: 0;
}

main {
  max-width: 40rem;
  margin: 20vh auto;
  padding: 0 1.5rem;
}

h1 {
  font-size: 2.4rem;
  letter-spacing: -0.04em;
  margin: 0.2rem 0 0.8rem;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.72rem;
  color: #a1a1aa;
}

code {
  font-family: ui-monospace, SFMono-Regular, menlo, monospace;
  font-size: 0.92em;
}

ul {
  line-height: 1.8;
  padding-left: 1.1rem;
  color: #d4d4d8;
}
`
}

function health(target: DeployTarget): string {
  if (target === "ssr") {
    return `import { headers } from "next/headers"
import { getCloudflareContext } from "cfnext/server"

export async function GET() {
  const headerList = await headers()
  let assets = false
  try {
    assets = Boolean(getCloudflareContext().env.ASSETS)
  } catch {
    assets = false
  }
  return Response.json({
    ok: true,
    adapter: "cfnext",
    target: "ssr",
    host: headerList.get("host"),
    bindings: assets,
  })
}
`
  }
  return `export const dynamic = "force-static"

export function GET() {
  return Response.json({ ok: true, adapter: "cfnext" })
}
`

}

function livePage(): string {
  return `import { headers } from "next/headers"

export default async function LivePage() {
  const headerList = await headers()
  return (
    <main>
      <p className="eyebrow">worker ssr</p>
      <h1>Request-time render</h1>
      <p>
        Host: <code>{headerList.get("host")}</code>
      </p>
    </main>
  )
}
`

}

function ssrRuntimeStub(): string {
  return `// Generated by cfnext build. Stub until the first \`cfnext build\`.
export const handlers = []
export const loaders = {}
export const prerenders = []
`
}

function bunfig(): string {
  return `[run]
bun = true

# Install cfnext from the solved.gg micro registry (local dev and
# Cloudflare Builds). Other packages pass through to npm.
[install]
registry = "${REGISTRY_URL}"
`
}

function gitignore(): string {
  return `node_modules
.next
.cloudflare
.wrangler
out
dist
.env
.env.*
!.env.example
*.tsbuildinfo
.DS_Store
`
}

function envStub(): string {
  return `// Run \`bun run cf:types\` after changing wrangler.jsonc.
interface CloudflareEnv {
  ASSETS: Fetcher
}
`
}

function dockerfile(): string {
  return `FROM oven/bun:1.2-debian AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun --bun next build

FROM oven/bun:1.2-debian AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
ENV CFNEXT_TARGET=container
COPY --from=build /app/package.json ./
COPY --from=build /app/bun.lock ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./
EXPOSE 8080
CMD ["bun", "--bun", "next", "start", "-H", "0.0.0.0", "-p", "8080"]
`
}

function dockerignore(): string {
  return `node_modules
.next
.cloudflare
.wrangler
.git
.env
.env.*
`
}

function readme(opts: InitOptions): string {
  return `# ${opts.name}

Next.js on Cloudflare via **cfnext** (\`${opts.target}\` target).

## Commands

\`\`\`bash
bun run dev          # Next.js local dev
bun run build        # next build + adapter pack
bun run deploy       # wrangler deploy
bun run preview      # version upload
bun run cf:dev       # wrangler dev against packed output
bun run cf:env       # push .env.local secrets
bunx cfnext add d1   # scaffold D1 (or r2, kv, hyperdrive, ai, vectorize, queue)
\`\`\`

## Targets

- **workers** — Next Adapter packs static/prerender HTML onto Workers Assets. Node.js route handlers do not run. Prefer prerender or \`runtime = "edge"\`.
- **ssr** — Worker-side SSR via the Next.js 16.2 Adapter API. Static assets stay on Workers Assets. Node handlers run in the Worker with \`nodejs_compat\`. Use \`getCloudflareContext()\` from \`cfnext/server\` to read bindings.
- **container** — Worker serves hashed assets and proxies everything else to a Cloudflare Container running \`next start\` (full Node fidelity).

This is not OpenNext. Bindings (D1, R2, KV, …) are declared in \`cfnext.json\` and compiled with \`cfnext generate\`. Type with \`bun run cf:types\`.
`
}
