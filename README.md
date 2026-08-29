# n8n-nodes-scrapeunblocker

This is an n8n community node. It lets you use ScrapeUnblocker API in your n8n workflows.

The ScrapeUnblocker web scraping API helps to bypass captchas and anti-bot systems.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Resources](#resources)
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

### Get Page Source (`POST /getPageSource`)

Fetches the fully rendered HTML source of a webpage through a residential proxy. Optionally waits for a specific element to appear before capturing the HTML, or returns structured JSON for supported domains.

| Parameter | Type | Required | Description |
|---|---|---|---|
| **URL** | string | Yes | The URL of the webpage you want to fetch. |
| **Proxy Country** | string | No | Country of the proxy to use. If not set, a random European proxy is used. Available: `BE`, `CA`, `CN`, `DE`, `ES`, `FR`, `GB`, `IL`, `IT`, `JP`, `LT`, `NL`, `PL`, `TW`, `US`. |
| **Wait for Element Method** | string | No | Selector strategy to wait for a specific element before capturing HTML. Useful for JavaScript-rendered pages. Must be used together with **Wait for Element Value**. Allowed values: `css`, `xPath`, `className`, `tagName`. |
| **Wait for Element Value** | string | No | The selector string to wait for, interpreted according to the chosen method. The request returns once a matching element appears (20 second timeout). Only shown when a method is selected. |
| **Parsed Data** | boolean | No | If enabled, returns structured JSON extracted from the page for supported domains instead of raw HTML. Defaults to `false`. |
| **Browser Steps** | json | No | A JSON array of browser actions run in a real browser after the page loads, before the HTML is captured. Leave empty to skip. See [Browser steps](#browser-steps) below. |
| **List Elements** | boolean | No | If enabled, returns structured JSON `{ url, count, elements }` describing the elements found on the page instead of raw HTML. Defaults to `false`. |

#### Example: Wait for a CSS element

Set **Wait for Element Method** to `css` and **Wait for Element Value** to `.main-content` to wait for the element with class `main-content` to appear before the HTML is captured.

#### Browser steps

Paste a JSON array into **Browser Steps** to drive a real browser after the page loads (click, type, scroll, wait for content, etc.) and then capture the resulting HTML. Steps run in order and are **non-idempotent** (they change page state), so use them only when you need interaction. If a step fails, the API responds with HTTP 422 and a JSON body describing the failure (`error`, `step_index`, `action`, `reason`, `selector`, `html`).

Supported actions (each object needs an `action` key):

| Action | Fields |
|---|---|
| `wait_for` | `selector`, `selector_type?` (`css` \| `xPath` \| `className` \| `tagName`), `timeout_ms?` |
| `wait_for_text` | `value`, `timeout_ms?` |
| `wait` | `value` (milliseconds) |
| `click` | `selector`, `selector_type?`, `timeout_ms?` |
| `type` | `selector`, `selector_type?`, `value`, `clear?`, `timeout_ms?` (human-like typing) |
| `select` | `selector`, `selector_type?`, `value`, `timeout_ms?` |
| `press_key` | `value` (`Enter`, `Tab`, `Escape`, `Backspace`, `Delete`, `Space`, `Arrow*`, `Home`, `End`, `PageUp`, `PageDown`) |
| `scroll` | `value` (`"bottom"` or an integer pixel offset) |

Example:

```json
[
  { "action": "wait_for", "selector": ".product-list", "selector_type": "css" },
  { "action": "click", "selector": "#load-more" },
  { "action": "scroll", "value": "bottom" },
  { "action": "wait", "value": 1000 }
]
```

#### List elements

Enable **List Elements** to receive structured JSON (`{ url, count, elements: [...] }`) describing the elements found on the page instead of raw HTML.

## Credentials

You can obtain your API KEY for free by signing up at [app.scrapeunblocker.com](https://app.scrapeunblocker.com/?utm_source=n8n&utm_medium=integration&utm_campaign=n8n-node)

After signing up you will be given 100 free calls for testing ScrapeUnblocker API service.

## Compatibility

n8n 2.8.3 and above

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [Get Page Source API](https://www.scrapeunblocker.com/documentation?utm_source=n8n&utm_medium=integration&utm_campaign=n8n-node)

## Version history

- 0.1.1: Initial Release
- 0.1.2: Github repo made public
- 0.1.3: Corrections after n8n manual review
- 0.1.4: Added `proxy_country`, `method`, `value`, and `parsed_data` parameters to Get Page Source
- 0.1.5: Empty version bump
- 0.1.6: Dark/light logos added
- 0.1.7: Indicate which parameters are optional
- 0.1.8: Provenance-backed publish, corrections after n8n review
- 0.1.9: Updated credential screen links: "Read our docs" now points to the developer docs, and added a link to obtain an API key
- 0.1.10: Added UTM parameters to scrapeunblocker.com links for traffic attribution
- 0.1.11: Fixed the codex `node` identifier to the fully-qualified `n8n-nodes-scrapeunblocker.scrapeUnblocker` format, as required by the n8n review
- 0.1.12: Expanded the Proxy Country dropdown to all 36 supported countries
- 0.1.13: Added `Browser Steps` (run browser actions after load) and `List Elements` to Get Page Source
