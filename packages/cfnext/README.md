# cfnext

**Next.js on Cloudflare. Official adapter. Three targets. One CLI.**

Bun-first toolkit for shipping Next.js 16.2 to Cloudflare Workers and Containers. Uses the Next.js Adapter API — **not OpenNext**. Packs static and prerender output onto Workers Assets, runs SSR handlers on the Worker, or fronts a Container running `next start`.

```bash
bunx cfnext init my-app --target workers
bunx cfnext init my-app --target ssr --bindings d1
bunx cfnext init my-app --target container --bindings d1,r2,kv
bunx cfnext init my-app --target ssr --auth clerk --bindings d1
```

```bash
cd my-app
bun run deploy
bunx cfnext add r2 --provision
bunx cfnext env
bunx cfnext types
```

```bash
npm install cfnext --registry https://registry1.solved.gg
```

## Features

- **Official Adapter API** — Next 16.2 packs the build; cfnext does not fork the framework
- **Three targets** — Workers (static / prerender), SSR on the Worker, Container (`next start`)
- **Bindings CLI** — D1, R2, KV, Hyperdrive, Workers AI, Vectorize, Queues
- **Edge protection** — prefix gates and Clerk-style session shells before Next runs
- **Attach existing apps** — `cfnext init --existing`
- **Typed config** — `import { withCfnext, type CfnextUserConfig } from "cfnext"`
- **Secrets and types** — `cfnext env` and `cfnext types`

## Targets

| Target | Runtime | Use when |
| --- | --- | --- |
| `workers` | Workers Assets + Fetch Worker | Prerendered or `runtime = "edge"`. Node handlers do not run. |
| `ssr` | Same assets + Worker `handler()` under `nodejs_compat` | Dynamic routes on the Worker. Bindings via `getCloudflareContext()` from `cfnext/server`. |
| `container` | Worker assets + Cloudflare Container | Full Node fidelity — route handlers, image optimization, `next start`. |

```ts
import { getCloudflareContext } from "cfnext/server"

const { env } = getCloudflareContext()
await env.DB.prepare("select 1").first()
```

```ts
import { withCfnext } from "cfnext"

export default withCfnext({
  // next.config.ts
})
```

## CLI

| Command | What you get |
| --- | --- |
| `cfnext init [dir]` | Scaffold, or `--existing` to attach |
| `cfnext add d1\|r2\|kv\|hyperdrive\|ai\|vectorize\|queue` | Write a wrangler binding (`--provision` creates it) |
| `cfnext build` | `next build` — adapter packs `.cloudflare/assets` |
| `cfnext deploy` | Build + `wrangler deploy` |
| `cfnext preview` | Version upload / preview URL |
| `cfnext dev` | `wrangler dev` against packed output |
| `cfnext env` | Non-public `.env.local` keys → Worker secrets |
| `cfnext types` | `cloudflare-env.d.ts` |

`init`: `--target workers|ssr|container`, `--bindings d1,r2,kv`, `--auth clerk`, `--name`, `--existing`, `--yes`.

## Requirements

Bun `>= 1.2` · Next.js `>= 16.2` · React `>= 19` · Wrangler `>= 4`

MIT © iResolved, LLC
