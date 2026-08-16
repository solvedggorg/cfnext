# Extracted `@solved/cf`

Verbatim copy of `solved-gg-v2/packages/cf` from 2026-08-16.

Source tree was **not** deleted. The live package still lives at:

`../solved-gg-v2/packages/cf`

This snapshot is the starting point for `packages/cfnext`. The original adapter is Bun-only, packs Next static/prerender output into `.cloudflare/assets`, and deploys a Fetch Worker with Clerk path protection. It does not run Node.js handlers and does not use OpenNext.
