# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A published [n8n community node](https://docs.n8n.io/integrations/community-nodes/) (npm package `n8n-nodes-scrapeunblocker`) that exposes the ScrapeUnblocker web-scraping API as a node usable inside n8n workflows. It is **TypeScript**, built and released through the `@n8n/node-cli` toolchain — not a generic Node app.

## Commands

```bash
npm run build        # n8n-node build → compiles TS to dist/
npm run build:watch  # tsc --watch
npm run dev          # n8n-node dev → runs a local n8n with this node hot-loaded
npm run lint         # n8n-node lint (eslint-plugin-n8n-nodes-base rules)
npm run lint:fix     # auto-fix lint issues
npm run release      # n8n-node release (release-it; bumps version, tags, publishes)
```

There is **no test suite** in this repo. `npm run lint` is the primary correctness gate — the n8n lint rules are strict about node/credential metadata conventions and CI/publishing will reject violations.

## Architecture

Two classes, registered both in `index.ts` and (for the published package) in the `n8n` block of `package.json`, which points at the **compiled `dist/` paths**:

- **`nodes/ScrapeUnblocker/ScrapeUnblocker.node.ts`** — the node. Its `description: INodeTypeDescription` declares the UI (the `properties` array drives the form fields users see). `execute()` reads each input item's parameters, builds a query string, and calls `POST https://api.scrapeunblocker.com/getPageSource` via `this.helpers.httpRequestWithAuthentication` (which injects the credential automatically — never read the API key manually). Output is one item per input item.
- **`credentials/ScrapeUnblockerApi.credentials.ts`** — the `scrapeUnblockerApi` credential. Auth is the API key sent as the `x-scrapeunblocker-key` header. `test` defines the "test credential" probe n8n runs in the UI.

The two are linked by the credential `name` string `scrapeUnblockerApi` — the node references it in its `credentials` array and in the `httpRequestWithAuthentication` call. Keep these three string literals in sync if renaming.

### Conventions that matter here

- **Parameter `name` = API query key.** Node parameter names (`url`, `proxy_country`, `method`, `value`, `parsed_data`) are sent verbatim as query-string keys to the API, so they use snake_case rather than the camelCase you'd normally expect in TS. Don't "fix" the casing.
- **Conditional fields** use `displayOptions.show` (e.g. `value` only appears when `method` is one of the selector strategies). Optional params are omitted from the query unless set, so the API receives a minimal request.
- **Error handling** must respect `this.continueOnFail()`: on failure, push `{ json: { error } }` for that item instead of throwing; otherwise wrap in `NodeApiError`. Preserve this pattern when adding logic.
- `usableAsTool: true` exposes the node to n8n AI Agents — keep parameter `description` fields accurate, as agents read them.
- Icons are SVGs referenced as `file:scrapeunblocker.svg`; the file lives next to each class and is copied into `dist/` at build.

## Releasing

User-facing changes are tracked in `README.md` ("Version history") and `CHANGELOG.md`. When adding/changing a node parameter, update the README operations table to match, then bump the version via `npm run release`. The package only ships the `dist/` directory (`files` in package.json), so always build before publishing.
