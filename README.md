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

#### Example: Wait for a CSS element

Set **Wait for Element Method** to `css` and **Wait for Element Value** to `.main-content` to wait for the element with class `main-content` to appear before the HTML is captured.

## Credentials

You can obtain your API KEY for free by signing up at https://app.scrapeunblocker.com/

After signing up you will be given 100 free calls for testing ScrapeUnblocker API service.

## Compatibility

n8n 2.8.3 and above

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [Get Page Source API](https://www.scrapeunblocker.com/documentation)

## Version history

- 0.1.1: Initial Release
- 0.1.2: Github repo made public
- 0.1.3: Corrections after n8n manual review
- 0.1.4: Added `proxy_country`, `method`, `value`, and `parsed_data` parameters to Get Page Source

