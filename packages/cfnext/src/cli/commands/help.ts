export const HELP = `cfnext — Next.js adapter + CLI for Cloudflare Workers and Containers

  cfnext init [dir]       scaffold a Next.js app preconfigured for Cloudflare
  cfnext add <binding>    add a catalog binding to cfnext.json
  cfnext generate         compile cfnext.json → wrangler.jsonc + types module
  cfnext migrate wrangler import wrangler.jsonc into cfnext.json
  cfnext build            next build (adapter packs .cloudflare/assets)
  cfnext deploy           build + wrangler deploy
  cfnext preview          build + wrangler versions upload
  cfnext dev              build + wrangler dev
  cfnext env              push non-public .env.local keys as Worker secrets
  cfnext types            generate cloudflare-env.d.ts from wrangler.jsonc

init
  --target workers|ssr|container   deploy target (default: workers)
  --name <name>                Worker name (default: directory)
  --bindings d1,r2,kv          scaffold cfnext.json bindings
  --auth clerk                 Clerk-style protected prefixes + shells
  --existing                   attach cfnext to an existing Next.js app
  --skip-install               do not run bun install
  --yes, -y                    allow non-empty directories

add
  cfnext add d1|r2|kv|hyperdrive|ai|vectorize|queue
  --binding DB                 binding name
  --name my-db                 resource name
  --provision                  run the matching wrangler create command
  --environment staging        write into env.staging (not preview/production)
  --preview-id <id>            local/miniflare preview resource id

generate
  --check                      exit 1 if wrangler.jsonc is stale
  --force                      overwrite a dirty @generated wrangler.jsonc
  --dry-run                    print wrangler.jsonc without writing

targets
  workers    Next Adapter packs static/prerender assets onto Workers
             (extracted from @solved/cf). Node handlers do not run.
  ssr        Worker-side SSR. Packs handler entrypoints and invokes them
             with the official Next Adapter handler(req, res, ctx) contract
             under nodejs_compat. Bindings via getCloudflareContext().
  container  Worker + Cloudflare Container running next start
             for full Node.js Next.js fidelity. Bindings live on the Worker.

This is not OpenNext. SSR uses the Next.js 16.2 Adapter API on Workers.
`
