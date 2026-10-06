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

- **`nodes/ScrapeUnblocker/ScrapeUnblocker.node.ts`** - the node. **Resource + Operation**: `webPage` (hand-written: *Get Page Source* -> `POST /getPageSource`, *Get Image* -> `POST /getImage` as binary) is the default, so nodes saved before resources existed keep working; every other resource is one site served by an API plugin endpoint.
- **Plugin resources are generated.** `plugins/specs/<resource>.json` (one per site) -> `node scripts/generate-plugins.mjs` -> `nodes/ScrapeUnblocker/PluginsDescription.ts` (parameters) and `PluginOperations.ts` (endpoint + parameter mapping). Never edit those two by hand. The generator validates every spec against `plugins/openapi.json` (the API's public OpenAPI), and also refreshes the README operations table and the codex aliases. Spec format and rules: `plugins/README.md`.
- **`nodes/ScrapeUnblocker/GenericFunctions.ts`** - plugin calls: query building from fields/Options/Sort, the request, error messages, splitting the answer into items (`listKey`/`listKeys`/`itemKey`) and the Simplify / AI tool Output shaping.
- **`credentials/ScrapeUnblockerApi.credentials.ts`** - the `scrapeUnblockerApi` credential. Auth is the API key sent as the `x-scrapeunblocker-key` header. `test` defines the "test credential" probe n8n runs in the UI.

The two are linked by the credential `name` string `scrapeUnblockerApi` - the node references it in its `credentials` array and in every `httpRequestWithAuthentication` call. Keep these string literals in sync if renaming.

### Conventions that matter here

- **Parameter `name` = API query key.** Node parameter names are sent verbatim as query-string keys (`url`, `proxy_country`, `keyword`...), so they use snake_case. Don't "fix" the casing; a spec sets `name` only when two endpoints use the same key with different types.
- **Adding a plugin:** new/changed spec -> `node scripts/generate-plugins.mjs` -> `npm run lint && npm run build` -> `SCRAPEUNBLOCKER_API_KEY=... node scripts/e2e-plugins.mjs <resource>` (docker n8n, real billed API calls). Refresh `plugins/openapi.json` from the API first when the endpoint is new. A plugin that is broken API-side stays in its spec with `"disabled": "<reason>"`.
- **Error handling** must respect `this.continueOnFail()`: on failure, push `{ json: { error } }` for that item instead of throwing; otherwise wrap in `NodeApiError`.
- `usableAsTool: true` exposes the node to n8n AI Agents - keep parameter `description` fields accurate, as agents read them. The AI tool shows *Output* (Simplified / Raw / Selected Fields) where the node shows *Simplify* (`'@tool'` display condition).
- The n8n linter (`@n8n/node-cli`) is the authority on casing: it forces sentence case on actions (brands as one lowercase word) and Title Case on display names.

## Releasing

User-facing changes are tracked in `README.md` ("Version history") and `CHANGELOG.md`. When adding/changing a node parameter, update the README operations table to match, then bump the version via `npm run release`. The package only ships the `dist/` directory (`files` in package.json), so always build before publishing.
