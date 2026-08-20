export const HELP = `cfnext — Next.js adapter + CLI for Cloudflare Workers and Containers

  cfnext init [dir]       scaffold a Next.js app preconfigured for Cloudflare
  cfnext add <binding>    add a catalog binding to cfnext.json
  cfnext rm do --class X  remove a Durable Object (keeps migration history)
  cfnext generate         compile cfnext.json → wrangler.jsonc + types module
  cfnext migrate wrangler import wrangler.jsonc into cfnext.json ( --force overwrites )
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
           do|workflow|cron|secret|secret-store|var
           access|flagship|logpush|web-analytics
           email|images|image-loader|stream|media|realtime
           model|ai-search|ai-gateway|agent|websearch|mcp-portal
  --binding DB                 binding name
  --name my-db                 resource name
  --class RateLimiter          Durable Object / workflow / agent class
  --expr "0 * * * *"           cron expression or workflow schedule
  --consume                    queue consumer + queue.ts stub
  --inbound                    email routing + email.ts stub
  --alias / --id               model alias → Workers AI model id
  --public                     share a model alias via generated client module
  --namespace                  AI Search namespace (xor --name instance)
  --no-memory                  skip default agent_memory binding
  --kind cdn-cgi|imagedelivery image-loader URL builder
  --zone-origin https://…      cdn-cgi zone origin
  --account-hash <hash>        imagedelivery account hash
  --store-id / --secret-name   Secrets Store
  --value                      var value
  --no-sqlite                  Durable Object uses new_classes (not SQLite)
  --app-id                     Flagship / Realtime app id
  --token                      Web Analytics site token
  --dataset / --destination    Logpush job (L4 plan; wrangler is boolean)
  --protect-production         Access on production workers.dev
  --emails / --domains         Access include rules
  --provision                  run the matching wrangler/API create command
  --environment staging        write into env.staging (not preview/production)
  --preview-id <id>            local/miniflare preview resource id
  --delete / --rename Old:New  Durable Objects only

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
