# cfnext

Bun-first Next.js adapter and CLI for Cloudflare Workers and Containers.

```bash
bunx cfnext init my-app --target workers
bunx cfnext init my-app --target ssr --bindings d1
bunx cfnext init my-app --target container --bindings d1,r2,kv
```

`ssr` invokes Next.js Adapter API entrypoints on the Worker (`handler(req, res, ctx)` / Edge `handler(request, ctx)`) with `nodejs_compat`. Read bindings from `getCloudflareContext()` in `cfnext/server`.

`import { withCfnext, type CfnextUserConfig } from "cfnext"` is typed for `next.config.ts`. Run `bun run build` to emit `dist/*.d.ts` / `dist/*.js`, and `bun run compile` for a standalone `dist/bin/cfnext` binary.

See the repository README for the rest of the commands and how this was extracted from `@solved/cf`.
