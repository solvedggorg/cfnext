# registry1.solved.gg

Cloudflare Worker micro-registry. npm-compatible. Only `cfnext`. Heavily rate limited.

## Versions

| Channel | Version | dist-tag |
| --- | --- | --- |
| previous | 0.0.1 | — |
| previous | 0.0.2 | — |
| current | 0.1.0 | `latest` |
| beta | 0.2.0-beta.1 | `beta` |
| nightly | 0.2.0-nightly.20260816 | `nightly` |

```bash
npm install cfnext --registry https://registry1.solved.gg
npm install cfnext@beta --registry https://registry1.solved.gg
npm install cfnext@nightly --registry https://registry1.solved.gg
```

## Limits (per Cloudflare colo, per IP)

- Metadata (`/cfnext`, version, dist-tags, ping): **8 / 60s**
- Tarball download: **2 / 60s**
- Combined: **10 / 60s**

Exceeded calls return `429` with `Retry-After: 60`. The registry is read-only (`PUT`/`POST` → `405`).

## Dev

```bash
bun test
bun run dev      # wrangler dev
bun run deploy   # wrangler deploy → registry1.solved.gg
```
