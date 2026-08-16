# cfnext

**Next.js on Cloudflare. Official adapter. Three targets. One CLI.**

`cfnext` is the Bun-first toolkit for shipping a Next.js 16.2 app to Cloudflare — static on Workers Assets, SSR on the Worker, or full `next start` in a Container. It is **not OpenNext**. Builds go through the Next.js Adapter API. Bindings are first-class. Deploy is one command.

```bash
bunx cfnext init my-app --target ssr --bindings d1
cd my-app
bun run deploy
```

Install from the cfnext registry:

```bash
npm install cfnext --registry https://registry1.solved.gg
```

---

## Why this exists

Most “Next on Cloudflare” stacks wrap, fork, or emulate the framework. cfnext does the opposite: it **implements the Next.js 16.2 Adapter API**, packs what Next already emitted, and puts a Worker (or a Worker + Container) in front of it.

| You want | You get |
| --- | --- |
| A real Cloudflare deploy, not a Node host in disguise | Workers Assets for HTML and static files, Wrangler for the rest |
| Server rendering when you need it | Worker-side `handler(req, res, ctx)` under `nodejs_compat` |
| Full Node route handlers | Cloudflare Containers running `next start` |
| D1, R2, KV, Hyperdrive, Workers AI, Vectorize, Queues | `cfnext add` writes the binding — `--provision` creates the resource |
| Auth at the edge | Prefix protection and Clerk-style shells before the app runs |
| An existing Next app | `cfnext init --existing` attaches instead of scaffolding |

Bun-first. Typed `withCfnext()` for `next.config.ts`. Security headers on by default.

---

## Pick a target

Same CLI. Three runtime shapes. Choose at init (`--target`) or in `cfnext.config.ts`.

### Workers — static and prerender on the edge

The Next adapter packs HTML, RSC payloads, and assets onto **Workers Assets**. A Fetch Worker serves `ASSETS`, applies path protection, and sets security headers.

Best when the app is prerendered or uses `runtime = "edge"`. Node.js route handlers **do not run** on this target.

```bash
bunx cfnext init my-app --target workers
```

### SSR — Next handlers on the Worker

The adapter copies handler entrypoints into `.cloudflare/server` and the Worker invokes the official Adapter contract:

- Node: `handler(req, res, ctx)`
- Edge: `handler(request, ctx)`

Static files still live on Workers Assets. Dynamic routes run on the Worker with `nodejs_compat`. Read bindings in server code with `getCloudflareContext()` from `cfnext/server`.

```bash
bunx cfnext init my-app --target ssr --bindings d1,r2
```

```ts
import { getCloudflareContext } from "cfnext/server"

export default async function Page() {
  const { env } = getCloudflareContext()
  const row = await env.DB.prepare("select 1 as ok").first()
  return <pre>{JSON.stringify(row)}</pre>
}
```

### Container — full Node, Cloudflare-fronted

The Worker still serves hashed static assets. Everything else proxies to a **Cloudflare Container** running `next start`. Full Node fidelity for route handlers, image optimization, and anything the Workers runtime will not take.

D1, R2, KV, and the rest stay as Worker bindings.

```bash
bunx cfnext init my-app --target container --bindings d1,r2,kv
```

---

## From zero to production

**New app**

```bash
bunx cfnext init my-app --target workers
bunx cfnext init my-app --target ssr --bindings d1
bunx cfnext init my-app --target container --bindings d1,r2,kv
bunx cfnext init my-app --target ssr --auth clerk --bindings d1
```

**Existing Next.js app**

```bash
cd my-app
bunx cfnext init --existing --target ssr --bindings d1
```

Then wrap config if the attach step did not already:

```ts
import { withCfnext } from "cfnext"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {}

export default withCfnext(nextConfig)
```

**Day-to-day**

```bash
bun run dev          # Next.js local
bun run deploy       # build + wrangler deploy
bun run preview      # version upload / preview URL
bunx cfnext add r2 --provision
bunx cfnext env      # push non-public .env.local keys as Worker secrets
bunx cfnext types    # wrangler types → cloudflare-env.d.ts
```

---

## Bindings as a product feature

Platform resources are not a wrangler homework assignment. Declare them at scaffold time or add them later.

| Kind | Default binding | What it is |
| --- | --- | --- |
| `d1` | `DB` | SQLite at the edge |
| `r2` | `BUCKET` | Object storage |
| `kv` | `KV` | Low-latency key-value |
| `hyperdrive` | `HYPERDRIVE` | Faster queries to existing Postgres / MySQL |
| `ai` | `AI` | Workers AI |
| `vectorize` | `VECTORIZE` | Vector index |
| `queue` | `QUEUE` | Producer / consumer queues |

```bash
bunx cfnext add d1
bunx cfnext add r2 --provision
bunx cfnext add kv --binding SESSION --name my-app-session
```

`add d1` also drops a `migrations/` folder. `cfnext types` keeps `env.DB` / `env.BUCKET` honest in TypeScript.

---

## Protection at the Worker

Auth checks belong in front of the app, not only inside it. Point prefixes at a sign-in path and a session cookie; unauthenticated hits get a 307 before Next runs.

```bash
bunx cfnext init my-app --target workers --auth clerk
```

`--auth clerk` wires Clerk-style `__session` / `__client_uat` cookies, `/sign-in`, and protected prefixes. Configure more in `cfnext.config.ts`:

```ts
import type { CfnextUserConfig } from "cfnext"

export default {
  name: "my-app",
  target: "ssr",
  protect: {
    prefixes: ["/dashboard", "/account"],
    signInPath: "/sign-in",
  },
} satisfies CfnextUserConfig
```

Security headers (`X-Frame-Options`, `nosniff`, referrer policy, permissions policy) ship on responses unless you turn them off.

---

## CLI

| Command | What you get |
| --- | --- |
| `cfnext init [dir]` | New Next.js app, or `--existing` to attach |
| `cfnext add d1\|r2\|kv\|hyperdrive\|ai\|vectorize\|queue` | Binding in `wrangler.jsonc` |
| `cfnext build` | `next build` — adapter packs `.cloudflare/assets` |
| `cfnext deploy` | Build + `wrangler deploy` |
| `cfnext preview` | Build + version upload |
| `cfnext dev` | `wrangler dev` against packed output |
| `cfnext env` | Non-`NEXT_PUBLIC_*` `.env.local` keys → Worker secrets |
| `cfnext types` | `cloudflare-env.d.ts` from `wrangler.jsonc` |

`init` flags: `--target workers\|ssr\|container`, `--bindings d1,r2,kv`, `--auth clerk`, `--name`, `--existing`, `--skip-install`, `--yes`.

---

## Configure once

`cfnext.config.ts` is the project file. `withCfnext()` is the Next hook.

```ts
import type { CfnextUserConfig } from "cfnext"

export default {
  name: "my-app",
  target: "ssr",
  images: { unoptimized: true },
  securityHeaders: true,
} satisfies CfnextUserConfig
```

```ts
import { withCfnext } from "cfnext"

export default withCfnext({
  // your Next config
})
```

Workers and SSR default images to unoptimized (no Node image pipeline on the Worker). Container leaves Next image optimization on.

---

## Install

Published on a dedicated npm-compatible registry — `latest`, `beta`, and `nightly`.

```bash
npm install cfnext --registry https://registry1.solved.gg
npm install cfnext@beta --registry https://registry1.solved.gg
npm install cfnext@nightly --registry https://registry1.solved.gg
```

From this repo:

```bash
bun packages/cfnext/src/cli/index.ts init my-app
bun run build      # emit JS + .d.ts for next.config.ts
bun run compile    # standalone binary → packages/cfnext/dist/bin/cfnext
bun test
```

The registry is read-only and rate limited. See [`packages/registry`](packages/registry).

---

## Requirements

- **Bun** `>= 1.2`
- **Next.js** `>= 16.2` (Adapter API)
- **React** `>= 19`
- **Wrangler** `>= 4`
- Cloudflare Containers peer (`@cloudflare/containers`) only if you use `--target container`

---

## License

MIT © iResolved, LLC
