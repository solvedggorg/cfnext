# cfnext

Next.js adapter and CLI for Cloudflare Workers compute and Cloudflare Containers. Extracted from `@solved/cf` in `solved-gg-v2` (the source package was not deleted) and expanded into a reusable init/deploy toolkit.

This is **not OpenNext**. Workers target uses the Next.js 16.2 Adapter API and packs static/prerender output onto Workers Assets. Use `--target container` when you need `next start` and Node.js route handlers.

## Install / use

```bash
bun packages/cfnext/src/cli/index.ts init my-app
# or after linking
bunx cfnext init my-app --target workers
bunx cfnext init my-app --target ssr --bindings d1
bunx cfnext init my-app --target container --bindings d1,r2,kv
```

```bash
cd my-app
bun run dev
bun run deploy
bunx cfnext add d1
bunx cfnext add r2 --provision
```

## Commands

| Command | What it does |
| --- | --- |
| `cfnext init [dir]` | Scaffold a Next.js app (or `--existing` to attach) |
| `cfnext add d1\|r2\|kv\|hyperdrive\|ai\|vectorize\|queue` | Write a wrangler binding |
| `cfnext build` | `next build` — adapter packs `.cloudflare/assets` |
| `cfnext deploy` | Build + `wrangler deploy` |
| `cfnext preview` | Version upload / preview URL |
| `cfnext dev` | `wrangler dev` against packed output |
| `cfnext env` | Push non-public `.env.local` keys as Worker secrets |
| `cfnext types` | `wrangler types` → `cloudflare-env.d.ts` |

## Targets

- **workers** — extracted `@solved/cf` model: Adapter packs HTML/assets, Fetch Worker serves `ASSETS`, optional path protection. Node handlers do not run on the Worker.
- **ssr** — Worker-side SSR using the Next.js 16.2 Adapter API. The adapter copies handler entrypoints into `.cloudflare/server`, writes `ssr-runtime.ts`, and the Worker invokes `handler(req, res, ctx)` (Node) or `handler(request, ctx)` (Edge) under `nodejs_compat`. Read D1/R2/KV with `getCloudflareContext()` from `cfnext/server`.
- **container** — Worker serves hashed static assets and proxies everything else to a Cloudflare Container running `next start` (full Node fidelity). D1/R2/KV/etc. are Worker bindings.

## Layout

```
extracted/solved-cf/   verbatim copy of ../solved-gg-v2/packages/cf
packages/cfnext/       adapter, workers, CLI, templates
```

## Build

```bash
bun run build      # emit JS + .d.ts for next.config.ts imports
bun run compile    # standalone cfnext binary → packages/cfnext/dist/bin/cfnext
```

`import { withCfnext } from "cfnext"` in `next.config.ts` resolves types from `dist/index.d.ts` and runtime from `dist/index.js`.

## Micro registry

`packages/registry` is a Cloudflare Worker npm registry for **five** `cfnext` versions at `https://registry1.solved.gg` (2 previous, current, beta, nightly). It is read-only and heavily rate limited (8 metadata / 2 tarball / 10 global requests per 60s per IP).

```bash
npm install cfnext --registry https://registry1.solved.gg
cd packages/registry && bun run deploy
```

## Tests

```bash
bun test
```
