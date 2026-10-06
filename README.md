# n8n-nodes-scrapeunblocker

This is an n8n community node. It lets you use the ScrapeUnblocker API in your n8n workflows: fetch any web page past captchas and anti-bot systems, or get ready-made structured data (products, listings, jobs, reviews, profiles, search results) from Amazon, eBay, Google, TikTok, YouTube, LinkedIn, Zillow, Booking.com and many more sites.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Example workflow](#example-workflow)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Resources](#resources)
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

Pick a **Resource** and an **Operation**. **Web Page** works with any site; every other resource is one site with ready-made structured data. Each input item makes one API call, and only successful calls are billed. A few operations collect several result pages in one call (their **Max Results** field says so), and each page is billed as one call.

### Web Page

#### Get Page Source (`POST /getPageSource`)

Fetches the fully rendered HTML source of a webpage through a residential proxy. Optionally waits for a specific element to appear before capturing the HTML, or returns structured JSON for supported domains.

| Parameter | Type | Required | Description |
|---|---|---|---|
| **URL** | string | Yes | The URL of the webpage you want to fetch. |
| **Browse From Country** | string | No | The country the site is opened from. If not set, a European country is picked. |
| **Wait for Element Method** | string | No | Selector strategy to wait for a specific element before capturing HTML. Useful for JavaScript-rendered pages. Must be used together with **Wait for Element Value**. Allowed values: `css`, `xPath`, `className`, `tagName`. |
| **Wait for Element Value** | string | No | The selector string to wait for, interpreted according to the chosen method. The request returns once a matching element appears (20 second timeout). Only shown when a method is selected. |
| **Parsed Data** | boolean | No | If enabled, returns structured JSON extracted from the page for supported domains instead of raw HTML. Defaults to `false`. |
| **Browser Steps** | json | No | A JSON array of browser actions run in a real browser after the page loads, before the HTML is captured. Leave empty to skip. See [Browser steps](#browser-steps) below. |
| **List Elements** | boolean | No | If enabled, returns structured JSON `{ url, count, elements }` describing the elements found on the page instead of raw HTML. Defaults to `false`. |

#### Example: Wait for a CSS element

Set **Wait for Element Method** to `css` and **Wait for Element Value** to `.main-content` to wait for the element with class `main-content` to appear before the HTML is captured.

#### When the page does not exist

If the target website answers **HTTP 404 or 410** (the page does not exist), the node does not fail. It outputs one item with `pageNotFound: true`, `originStatus` (404 or 410), `billed: true`, a `message`, and the target's own page in `body`. The call is billed like any fetched page, and retrying it returns the same answer, so route these items with an IF node on `pageNotFound` rather than retrying.

#### When nothing can be parsed

With **Parsed Data** on, a page that loads but holds no structured data still returns HTTP 200 and does not fail the node. The item keeps the usual shape (`data.page_type` is `unknown`, `data.data` is empty) and adds `data_extracted: false`, a `detail` line and the rendered page in `html`. The call is billed like a plain page fetch, so use that `html` instead of running the node again; route these items with an IF node on `data_extracted`.

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

#### Get Image (`POST /getImage`)

Downloads one image from a site that blocks direct downloads and returns it as a PNG file in the item's binary data (`data`), with `url`, `fileName`, `mimeType` and `fileSize` in the JSON. Parameters: **URL** of the image and **Browse From Country**.

### Structured data from popular sites

Each operation returns the site's data as clean JSON fields, one n8n item per result (product, listing, job, review...) or one item for "Get" operations. Search operations take a query and have filters under **Options**; result order, where the site has one, is under **Sort**.

**Simplify.** Results with many fields have a **Simplify** switch, on by default: each item then carries only the most useful fields (title, price, rating, URL, ID...). Turn it off to get every field the site returned.

**AI Agent tool.** The node can be attached to an n8n **AI Agent** as a tool. The tool has an **Output** setting instead of Simplify: **Simplified**, **Raw** (every field) or **Selected Fields** (the fields you pick), which keeps the agent's context small.

<!-- plugins:start -->
| Resource | Operation | What it does | Output |
|---|---|---|---|
| **Airbnb** | Search Stays | Find stays in a city with price, rating, reviews count and badges | One item per result, Simplify |
| **Airbnb** | Get Listing | Get the full details of one stay: host, rooms, amenities, rules and, for given dates, its price | One item, Simplify |
| **Airbnb** | Get Reviews | Get all guest reviews of one stay with rating, text, translation and host response | One item per result, Simplify |
| **Alibaba** | Search Products | Find wholesale products and their suppliers that match a keyword on Alibaba.com | One item per result, Simplify |
| **Alibaba** | Get Product | Get the full details of one Alibaba.com product: price tiers, variants, lead times and supplier | One item, Simplify |
| **AliExpress** | Search Products | Find products that match a keyword on AliExpress, with prices, ratings and orders | One item per result, Simplify |
| **Amazon** | Get Product | Get the price, availability, rating and details of one product on any Amazon marketplace | One item, Simplify |
| **Amazon** | Search Products | Find products that match a keyword on any Amazon marketplace | One item per result, Simplify |
| **Amazon** | Get Reviews | Get the star breakdown, the shoppers' summary and the top reviews of an Amazon product | One item, Simplify |
| **Amazon** | Get Best Sellers | Get the ranked top products of an Amazon category, such as best sellers or new releases | One item per result, Simplify |
| **App Store** | Get App | Get the full App Store listing of one app: rating, price, versions, privacy labels and more | One item, Simplify |
| **App Store** | Search Apps | Find App Store apps that match a keyword | One item per result, Simplify |
| **App Store** | Get Reviews | Get the customer reviews of an app, newest or most helpful first | One item per result |
| **AutoScout24** | Search Listings | Find cars for sale across Europe by make, model and filters | One item per result, Simplify |
| **Best Buy** | Search Products | Find electronics and appliances that match a keyword in the Best Buy US store | One item per result, Simplify |
| **Bing** | Search | Get the organic results, ads and related searches Bing shows for a query | One item per result |
| **Bing** | Search Images | Find images that match a keyword, with links to the full-size image and the page it is on | One item per result, Simplify |
| **Booking.com** | Search Hotels | Find places to stay in a city with price, review score and address | One item per result, Simplify |
| **Booking.com** | Get Reviews | Get the newest guest reviews of a hotel, with its likes, dislikes and score | One item per result, Simplify |
| **Brave** | Search | Get the organic results, ads and related searches Brave Search shows for a query | One item per result |
| **Capterra** | Get Reviews | Read user reviews of a software product: ratings, pros, cons and reviewer details | One item per result, Simplify |
| **Capterra** | Search Products | Find software products in Capterra's catalog by name or keyword | One item per result, Simplify |
| **Craigslist** | Search Listings | Find classified ads that match a keyword in one Craigslist city area | One item per result |
| **DuckDuckGo** | Search | Get the organic results and ads DuckDuckGo shows for a query | One item per result |
| **eBay** | Search Listings | Find listings that match a keyword on any regional eBay site | One item per result, Simplify |
| **Etsy** | Search Listings | Find handmade and vintage items that match a keyword on Etsy | One item per result |
| **G2** | Search Products | Find software products in G2's catalog by keyword | One item per result, Simplify |
| **Glassdoor** | Search Jobs | Find job listings with salary estimates that match a keyword | One item per result, Simplify |
| **Glassdoor** | Get Reviews | Read what employees say about a company: ratings, pros and cons | One item per result, Simplify |
| **Glassdoor** | Get Salaries | Pay ranges at a company for each job title, most-reported titles first | One item per result |
| **Google** | Search | Get the organic results, ads and AI Overview Google shows for a query | One item per result |
| **Google** | Search Images | Find images that match a keyword, with links to the full-size image and the page it is on | One item per result |
| **Google** | Search Jobs | Find job listings that Google collects from job boards and company sites | One item per result, Simplify |
| **Google** | Search Local Businesses | Find businesses for a query such as coffee shops in a city, with rating, address, phone and website | One item per result, Simplify |
| **Google** | Get Place | Get the full details of one Google Maps place: address, phone, opening hours, rating and more | One item, Simplify |
| **Google** | Search Shopping | Find products with their prices, stores and ratings on Google Shopping | One item per result |
| **Google** | Get Trends | Compare search interest in up to 5 terms over time and by region, with related queries | One item, Simplify |
| **Google Play** | Get App | Get the full Play Store listing of one app: rating, installs, price, developer contact and more | One item, Simplify |
| **Google Play** | Search Apps | Find Play Store apps that match a keyword | One item per result, Simplify |
| **Home Depot** | Search Products | Find tools, hardware and home products that match a keyword on Home Depot | One item per result, Simplify |
| **ImmobilienScout24** | Search Properties | Find apartments and houses for rent or for sale in a German city or region | One item per result, Simplify |
| **Indeed** | Search Jobs | Find job listings that match a keyword on any of 20 Indeed country sites | One item per result, Simplify |
| **Instagram** | Get Profile | Retrieve a public profile with follower counts, bio, links and recent posts | One item, Simplify |
| **Instagram** | Get Post | Retrieve one post or reel with its caption, likes, comments and media | One item, Simplify |
| **Leboncoin** | Search Listings | Find classified ads in France that match a keyword | One item per result, Simplify |
| **LinkedIn** | Get Company | Retrieve a public company page with industry, size, headquarters, followers and recent posts | One item, Simplify |
| **LinkedIn** | Search Jobs | Find job postings that match a keyword, with location, date, workplace and salary filters | One item per result, Simplify |
| **LinkedIn** | Get Job | Retrieve one job posting with its full description, seniority, salary and applicant count | One item, Simplify |
| **Meta Ad Library** | Get Ads | Retrieve an advertiser's Facebook and Instagram ads with copy, creatives, landing page and run dates | One item per result, Simplify |
| **mobile.de** | Search Listings | Find cars for sale in Germany by make and filters | One item per result, Simplify |
| **Naukri** | Search Jobs | Find job listings in India that match a keyword | One item per result, Simplify |
| **Oopbuy** | Search Products | Find products from 1688, Taobao or Oopbuy's own store that match a keyword, with USD prices | One item per result |
| **Product Hunt** | Get Leaderboard | A day's launches ranked by votes, with comments and topics | One item per result, Simplify |
| **Product Hunt** | Search Products | Find products that match a keyword, with their review rating | One item per result, Simplify |
| **Product Hunt** | Get Topic Products | The products listed under one topic | One item per result |
| **Product Hunt** | Get Product | One product's description, website, socials, review rating, followers and categories | One item, Simplify |
| **Redfin** | Search Properties | Find homes for sale or recently sold in a US ZIP code or city | One item per result, Simplify |
| **Rightmove** | Search Properties | Find UK properties for sale or to rent in a town, city or area | One item per result, Simplify |
| **SHEIN** | Search Products | Find products that match a keyword in the SHEIN US store | One item per result, Simplify |
| **Similarweb** | Get Traffic Overview | Visits, ranks, engagement, traffic sources, top countries and competitors of a website | One item, Simplify |
| **Skyscanner** | Search Flights | Find live flight itineraries and prices across airlines for a route and date | One item per result, Simplify |
| **Skyscanner** | Search Hotels | Find live hotel prices across booking sites for a destination and stay dates | One item per result, Simplify |
| **Skyscanner** | Search Car Hire | Find live car rental offers from many suppliers for a pickup place and dates | One item per result, Simplify |
| **Southwest Airlines** | Search Flights | Find every Southwest flight on a route and date with the price of each fare: one item per flight | One item per result, Simplify |
| **Target** | Search Products | Find products that match a keyword on Target.com | One item per result |
| **Telegram** | Get Channel Posts | Retrieve the newest posts of a public channel, or page back through its history | One item per result, Simplify |
| **Temu** | Search Products | Find the links of Temu products that match a keyword | One item per result |
| **Temu** | Get Product | Get the name, price, rating, images and video of one Temu product | One item, Simplify |
| **Threads** | Get Profile | Retrieve a public profile with bio, follower count and recent posts | One item |
| **TikTok** | Get Profile | Retrieve a creator's public profile with exact follower counts and their newest videos | One item, Simplify |
| **TikTok** | Get Video | Retrieve one video or photo post with exact engagement, music and media links | One item, Simplify |
| **TikTok** | Search Videos | Find videos for a keyword in TikTok's own ranking order | One item per result, Simplify |
| **TikTok** | Get Hashtag | Retrieve a hashtag's total views and video count with its top videos | One item |
| **TikTok** | Get Comments | Retrieve the comments of a video or photo post | One item per result, Simplify |
| **TikTok Shop** | Get Product | Retrieve a US product page with price, variants, shipping, seller and top reviews | One item, Simplify |
| **TikTok Shop** | Search Products | Find US products that match a keyword, or list the products of a category | One item per result, Simplify |
| **TikTok Shop** | Get Store | Retrieve a US store's profile, ratings and the products on its storefront | One item |
| **Tripadvisor** | Get List | Get the restaurants, hotels or things to do of a city from its Tripadvisor list page | One item per result, Simplify |
| **Trustpilot** | Get Reviews | Read the reviews customers left for a company, with its replies | One item per result, Simplify |
| **Vinted** | Search Listings | Find second-hand items that match a keyword on a Vinted marketplace | One item per result |
| **Yahoo** | Search | Get the organic results, ads and related searches Yahoo shows for a query | One item per result |
| **Yahoo** | Search Images | Find images that match a keyword, with links to the full-size image and the page it is on | One item per result, Simplify |
| **Yelp** | Search Businesses | Find businesses by keyword or category in a city or area, with rating and price level | One item per result, Simplify |
| **Yelp** | Get Business | Get one business's phone, address, website, opening hours, photos and popular dishes | One item, Simplify |
| **Yelp** | Get Reviews | Get the reviews of a business with star rating, text, author and owner response | One item per result, Simplify |
| **YouTube** | Get Channel Videos | Retrieve the newest videos, shorts or live streams of a channel | One item per result, Simplify |
| **YouTube** | Get Comments | Retrieve the comments of a video with likes, replies and pinned or hearted flags | One item per result, Simplify |
| **YouTube** | Search | Find videos, channels or playlists that match a keyword | One item per result, Simplify |
| **Zalando** | Search Products | Find fashion products that match a keyword in a European Zalando store | One item per result |
| **Zillow** | Search Properties | Find homes for sale, for rent or recently sold in a US city or ZIP code | One item per result, Simplify |
| **Zillow** | Get Property | Get the full record of one home, with price and tax history, schools, facts and photos | One item, Simplify |
<!-- plugins:end -->

## Example workflow

Copy the workflow below, paste it into the n8n editor (Ctrl+V / Cmd+V), open the **ScrapeUnblocker** node, select your **ScrapeUnblocker API** credential and click **Execute workflow**. It returns the first page of eBay listings for "nintendo switch", one simplified item per listing.

```json
{
  "nodes": [
    {
      "parameters": {},
      "name": "When clicking 'Execute workflow'",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [0, 0]
    },
    {
      "parameters": {
        "resource": "ebay",
        "operation": "searchListings",
        "keyword": "nintendo switch"
      },
      "name": "ScrapeUnblocker",
      "type": "n8n-nodes-scrapeunblocker.scrapeUnblocker",
      "typeVersion": 1,
      "position": [220, 0]
    }
  ],
  "connections": {
    "When clicking 'Execute workflow'": {
      "main": [[{ "node": "ScrapeUnblocker", "type": "main", "index": 0 }]]
    }
  }
}
```

## Credentials

You can obtain your API KEY for free by signing up at [scrapeunblocker.com/pricing](https://www.scrapeunblocker.com/pricing?utm_source=n8n&utm_medium=integration&utm_campaign=n8n-node)

After signing up you will be given 100 free calls for testing ScrapeUnblocker API service.

## Compatibility

n8n 2.8.3 and above

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [ScrapeUnblocker API documentation](https://docs.scrapeunblocker.com/introduction?utm_source=n8n&utm_medium=integration&utm_campaign=n8n-node)

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
- 0.1.14: Added UTM attribution to the in-UI credential and documentation links (signup, docs) so users arriving via the n8n node are attributed
- 0.1.15: Signup link now points to www.scrapeunblocker.com/pricing instead of the app subdomain, which immediately redirected to the login page before attribution could be recorded, so signups originating from the node are now attributed
- 0.1.16: A missing target page (HTTP 404/410 from the website) is output as an item with `pageNotFound: true`, `originStatus` and the target page, instead of failing the node with a generic error
- 0.1.17: With Parsed Data, a page with no structured data is output as an item with `noDataExtracted: true` (not billed) instead of failing the node with a validation error
- 0.1.18: With Parsed Data, a page with no structured data is output as the API's 200 answer: `data_extracted: false`, a `detail` line and the rendered page in `html` (billed like a page fetch). Replaces the `noDataExtracted` item from 0.1.17, which the API no longer produces
- 0.2.0: Resources and operations: Web Page (Get Page Source, new Get Image) plus structured data from many popular sites (Amazon, eBay, Google, TikTok, YouTube, LinkedIn, Zillow, Booking.com and more), with a Simplify setting (Output for the AI tool), Options and Sort collections. Existing workflows keep working unchanged.
