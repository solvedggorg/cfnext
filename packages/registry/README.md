# registry1.solved.gg

Cloudflare Worker micro-registry at `registry1.solved.gg`. Serves the **real**
`cfnext` package (embedded at build time from `packages/cfnext`) and passes
every other package through to `registry.npmjs.org`, so a global or
project-wide Bun registry override is safe.

## Install

```bash
bun install cfnext                       # with [install] registry pointed here
npm install cfnext --registry https://registry1.solved.gg
```

## How it works

- `/cfnext`, `/cfnext/<version>`, `/cfnext/-/cfnext-<version>.tgz`,
  `/-/package/cfnext/dist-tags` are served locally. The tarball and its
  sha1/sha512 integrity hashes are computed once by
  `src/build/embed-package.ts` and embedded in the Worker bundle; the runtime
  never re-packs or re-hashes.
- Every other path streams through to npm (GET/HEAD only). Proxied traffic
  skips the cfnext rate limits.
- The registry is read-only (`PUT`/`POST` → `405`).
- Excluded from the embedded payload: `dist/bin/` (compiled CLI artifact) and
  `*.map`.

## Limits (per Cloudflare colo, per IP — cfnext endpoints only)

- Metadata (`/cfnext`, version, dist-tags): **8 / 60s**
- Tarball download: **2 / 60s**
- Combined: **10 / 60s**

Exceeded calls return `429` with `Retry-After: 60`. Raise these before using
the passthrough for large CI installs of many packages.

## Dev / deploy

```bash
bun run dev      # re-embed + wrangler dev
bun test
bun run deploy   # re-embed + wrangler deploy → registry1.solved.gg
```

After changing anything under `packages/cfnext`, redeploy so installs pick up
the new version. The embed is deterministic (fixed mtimes, sorted files), so
re-runs produce identical bytes unless the package changed.
