# Plugin specs

Every ScrapeUnblocker plugin endpoint (structured data for one site, e.g. `/marketplace/ebay-search`) is exposed in the node as a **Resource** (the site) with one or more **Operations**. One spec file per resource: `plugins/specs/<resource>.json`. `specs/ebay.json` is the reference example.

`node scripts/generate-plugins.mjs` turns the specs into `nodes/ScrapeUnblocker/PluginsDescription.ts` and `PluginOperations.ts` (never edit those by hand). It checks each spec against `plugins/openapi.json`, the API's public OpenAPI, so a parameter that does not exist or a required parameter without a field fails the generation. `--check plugins/specs/<file>.json` validates single specs without writing anything.

## Spec format

```jsonc
{
  "resource": "Amazon",            // display name of the site, brand spelling ("eBay", "TikTok Shop")
  "value": "amazon",               // camelCase, never change after release
  "operations": [{
    "name": "Search Products",     // Title Case, no resource name ("Get Product", "Search Listings", "Get Reviews")
    "value": "searchProducts",     // camelCase, never change after release
    "action": "Search amazon products",   // sentence case with the site as one lowercase word (see Rules)
    "description": "Find products that match a keyword on any Amazon marketplace", // other words than the name
    "endpoint": "/marketplace/amazon-search",
    "fixed": { "mode": "search" }, // constant API parameters (endpoints with a `mode` become one operation per mode)
    "fields": [ ... ],             // shown directly: required inputs and the main result-size knob
    "options": [ ... ],            // everything else, inside the Options collection
    "sort": [ ... ],               // the order setting (display name "Sort By"), in its own Sort collection
    "listKey": "results",          // response key (or dot path, e.g. "data.trips") with the result list: one n8n item per entry
    "listKeys": [{ "key": "organic", "type": "organic" }, { "key": "topAds", "type": "ad" }],
                                   // OR: several lists (search results and ads), each entry tagged with `type`;
                                   // a path through a list collects from every entry ("data.trips.flights")
    "itemKey": "app",              // OR: response key with the single record of a "get one" operation
                                   // (neither: the whole response is one item)
    "outputFields": [...],         // every top-level key of one result (from a real response)
    "idField": "listingId",        // always returned with the AI tool's Selected Fields
    "simplify": [...],             // at most 10 field paths, most useful first; a.b is flattened to aB;
                                   // "vndr:vendor" renames a cryptic key
    "test": { "params": {...}, "options": {...}, "minItems": 1, "maxFields": 10 },
    "disabled": "Brave blocks the API (2026-10-06)"  // optional: keep the spec but leave the operation out of the node
  }]
}
```

A field:

```jsonc
{
  "param": "keyword",              // the API query parameter (also the node parameter name)
  "name": "keyword",               // optional: node parameter name when it must differ from param
  "displayName": "Search Query",   // Title Case
  "type": "string",                // string | number | boolean | options | multiOptions | dateTime
  "required": true,                // only for parameters the API requires (or one of an either/or pair shown first)
  "default": "",                   // as in the API; options/number defaults must be valid values
  "placeholder": "iphone 13",      // a realistic example; "e.g." is added by the generator
  "description": "...",            // plain sentence; booleans start with "Whether"
  "options": [{ "name": "New", "value": "new" }],  // for options / multiOptions; "countries" = the country list
  "min": 1, "max": 100,            // number limits from the API description
  "skipZero": true                 // a number whose 0 means "no limit", so 0 is not sent
}
```

## Rules (n8n UX guidelines - the node is verified, keep it that way)

- **Action text.** n8n's linter forces sentence case and splits camelCase or dotted brand names ("TikTok" becomes "tik tok", "Booking.com" becomes "booking com"). Write the site as one lowercase word: `ebay`, `tiktok`, `youtube`, `linkedin`, `aliexpress`, `autoscout24`, `duckduckgo`, `booking`; all-caps names (G2, SHEIN) may stay. Where no form reads well (mobile.de), leave the site out: n8n lists the actions under a heading with the resource name.
- **Names.** Resource = the site. Operation names use n8n's vocabulary: `Get` (one record by URL/ID/handle), `Search` / `Search <Things>` (keyword input), `Get Many <Things>` or `Get <Things>` (a list that belongs to something, e.g. a video's comments). The `action` repeats the site and the thing in sentence case.
- **Fields vs Options.** Required parameters and the main size knob (`max_results`, `limit`, `max_reviews`...) are fields; the rest go to `options`. If a parameter is required only in one mode (e.g. `q` for `mode=search`), make one operation per mode and mark it required there. Either/or inputs (`url` or `asin`): show the common one as the field (not required) and the other in options, and say in both descriptions that one of them is needed.
- **Value lists.** When the OpenAPI description lists the allowed values ("One of: ...", "Ordering: a, b, c"), use `options` (or `multiOptions` for comma-separated lists) with readable names, never a free-text field. Keep the API's default as `default`.
- **Country.** `proxy_country` is always an option: `"displayName": "Browse From Country"`, `"type": "options"`, `"options": "countries"`, and a description of what changes ("The country the site is opened from. ..."), keeping any hint from the API (e.g. "Automatic uses the US, which Yelp needs").
- **No tech jargon.** No "exit IP", "ISO-2", "proxy", "slug", "browse-node", "Oxylabs", "warm pool" or other internals. Say "two-letter country code (e.g. us)", "the part of the profile URL after /organization/". Keep billing facts the user needs ("each page is one billed call").
- **Placeholders** are realistic examples; booleans' descriptions start with `Whether`.
- **Simplify** when a result has more than 10 top-level fields: list `outputFields` (all top-level keys of a real result), `idField`, and up to 10 `simplify` paths. Pick what a user of that site wants first (title/name, price, rating, URL, ID...). Skip internal fields such as `proxyCountry`, `exitCountry`, `exitProvider`.
- **Tests** use small limits (every test is a billed call) and a query that is known to return results.

## Testing

```bash
node scripts/generate-plugins.mjs && npm run lint && npm run build
SCRAPEUNBLOCKER_API_KEY=... node scripts/e2e-plugins.mjs [resource ...]
```

`e2e-plugins.mjs` runs each operation's `test` through the built node in a throwaway docker n8n against the real API and writes `plugins/e2e-results.json` and one sample item per operation in `plugins/samples/`.
