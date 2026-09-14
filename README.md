# Lighthouse SEO Specialist

A complete, local-first SEO page and domain analysis application for Lighthouse Digital. Enter a target URL, 1–20 keywords, and up to five competitors. The backend retrieves their HTML, extracts evidence, calculates transparent optimization scores, and returns prioritized recommendations through a streaming endpoint.

## Run locally

Requirements: Node.js 22.9+ (Node 24 recommended) and npm or pnpm.

```sh
npm install
```

For a reproducible installation using the checked-in lockfile:

```sh
pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env` (optional for rule-based mode):

```powershell
Copy-Item .env.example .env
```

```sh
npm start
```

Open **http://127.0.0.1:3000**. Alternatively, run `node --env-file-if-exists=.env server/index.js` directly. Development with automatic server reload: `npm run dev`. Frontend files are served directly; refresh the browser after edits. No frontend build step is required.

## Domain Analysis

Switch between **Page Analysis** and **Domain Analysis** above the form. Domain mode accepts a bare domain or homepage URL, optional keywords/general topic, up to five competitor domains, and **10, 25 (default), or 50** HTML URL requests per domain. Redirects and errors consume the budget. Page mode retains its original workflow.

The ten domain tabs cover the overview, content inventory, topical map, architecture, internal links, local SEO, competitors, technical issues, content opportunities and action plan. Six editorial proposals identify an existing service/topic page to support and explain their evidence and priority. Verify actual offerings and uncrawled coverage before creating proposed pages.

Domain discovery follows same-host/root-www navigation, internal links, XML sitemaps and sitemap indexes. It removes tracking parameters and excludes other parameter URLs, login/cart/account pages, tags and media. Requests are sequential with at least 500 ms between starts. Each domain has a three-minute crawl deadline, six-sitemap limit, 5,000 discovery-candidate limit, and 24 MB decoded-response budget. Session responses are cached. Partial crawls and failed competitors remain explicit.

The separate **Domain Competitive Score** weights topical coverage 25%, architecture 20%, content quality/depth 20%, internal linking 15%, local coverage 10%, and technical consistency 10%. Non-local reports redistribute local weight to topical coverage (30%) and content (25%). Calculations appear in the report. These are bounded-sample heuristics, not authority or ranking metrics. Discovery counts are not indexed-page counts; orphan-like pages and click depth use only observed links.

With OpenAI configured, domain classification sends batches of up to 25 pages with title/headings and up to 1,800 body characters per page. Accepted topic labels require validated source quotations; rules provide fallback labels. AI labels do not change deterministic scores. Content opportunities are evidence-informed editorial proposals, not measured search demand.

`POST /api/analyze/domain` accepts:

```json
{"targetUrl":"example.com","keywords":[],"competitorUrls":["iana.org"],"crawlLimit":25}
```

It uses the same NDJSON progress/report protocol as page mode. Domain reports carry `mode: "domain"`; both modes support history, checklists and exports. Domain modules live in `server/domain/`, rendering in `public/domain-render.js`, and regression tests in `test/domain.test.js`.

With the server running, `npm run test:domain` validates a live IANA crawl, the ten-request cap, competitor failure isolation, six content proposals and HTML/JSON export endpoints. `npm run test:export` validates page exports. The unit suite includes domain discovery, sitemap indexes, robots policy, redirect/error budgets, graphs, duplicate metadata, scores and AI evidence guards.

## Optional AI analysis

Set `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env`, then restart. Choose a model available to your OpenAI account that supports the Responses API and Structured Outputs. No model name or API key is embedded in frontend code. The application does not require an API key to generate its full deterministic report.

The optional backend calls `POST https://api.openai.com/v1/responses`, with strict JSON schema under `text.format`, `store: false`, a 60-second deadline, and no tools. This follows the official [Responses migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses) and [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).

Selected retrieved text (up to 22,000 body characters per page), headings, keywords and findings are sent to OpenAI when configured. AI results are advisory: every accepted item must include an exact source quotation of at least 12 characters. Quotes are validated against the retrieved source and replacement drafts may cite only the target page. Unknown source URLs and unsupported quotations are discarded. The AI cannot modify page observations, numerical scores or deterministic findings. A failed, incomplete, refused or ungrounded AI response falls back to the rule-based report.

**Source validation is not a proof against hallucination.** A valid quotation can still be misinterpreted. All AI interpretations and drafts remain labeled for human review. Live OpenAI generation was not exercised during initial validation because no API key/model was configured; response handling and evidence validation have automated tests.

## Features

- Responsive vanilla JavaScript dashboard; Overview, Keywords, On-Page, Content, Local SEO, Competitors, Technical and Action Plan tabs.
- Real stage updates from the backend, cancellation, clear target failures and isolated competitor errors.
- Title, description, H1–H6, static main text, approximate word count, alt attributes, links, canonical, robots directives, JSON-LD, microdata types, Open Graph, viewport, response duration, HTML size, redirect chain and source hash.
- Per-keyword lexical placement and intent review, repetition flags, local signals, content-gap candidates with competitor quotations, a side-by-side competitor selector and a suggested outline.
- Evidence-backed prioritized fixes, target-preserving editorial drafts, copy buttons and an interactive action checklist.
- Self-contained printable HTML and structured JSON exports; Print / PDF uses the browser’s print dialog and Save as PDF. JSON includes raw extracted evidence, scores, warnings, AI provenance and checked actions.
- Up to ten reports saved in this browser’s local storage, with timestamps, URLs, keywords, competitors and scores. Quota failures evict older reports first and show a warning if the current report cannot be saved. Reports are not shared between browsers or devices.

## Project structure

```text
server/
  index.js             Express, security headers, limits, NDJSON endpoint
  crawler.js           URL/DNS validation, robots.txt, safe HTTP fetching
  parser.js            HTML/content extraction
  keywords.js          Query intent, lexical matching and topic concepts
  rules.js             Prioritized findings and targeted content drafts
  scoring.js           Weighted, explainable scores
  competitors.js       Comparison factors and sourced candidate gaps
  ai.js                Optional Responses API and quotation validation
  report.js            Analysis pipeline and versioned report contract
  integrations/        Provider contract for future real integrations
public/
  index.html           Application shell and input form
  styles.css           Dashboard, responsive and print styles
  app.js               User interaction and streaming response handling
  render.js            Escaped, accessible report rendering
  export.js            Printable HTML, JSON and recommendation text
  storage.js           Local report history and checklist persistence
test/fixtures/         Five representative HTML pages
test/core.test.js      Parser, score, input, safety and report tests
scripts/live-check.js  Real-page and end-to-end validation
```

## Scoring methodology

Scores are prioritization heuristics, **not Google ranking scores**. Category labels represent areas for review; the measurements use imperfect proxies and cannot establish true content quality, authority or search intent. Each category displays its calculation basis in the report.

| Category | Local | Non-local |
|---|---:|---:|
| Search Intent & Relevance | 20% | 25% |
| Content Quality & Topic Coverage | 20% | 25% |
| On-Page SEO | 20% | 20% |
| Technical/Page Structure | 15% | 15% |
| Internal Linking & Site Signals | 10% | 10% |
| Local SEO Signals | 10% | 0% |
| Conversion/Trust Signals | 5% | 5% |

The overall score is the rounded weighted category sum. An observed `noindex`/`none` directive caps it at 35; the raw score is retained. Missing local signals do not affect non-local reports. Keyword scores separately combine title (18%), H1 (15%), introductory terms (12%), body/heading coverage (20%), inferred intent (20%), relevant internal anchors (5%) and local signals or body match (10%). A potential repetition flag deducts 15 points. Exact phrase frequency is used only to flag unusually repetitive copy; there is no recommended keyword density.

Comparative position uses the difference from the mean of successfully analyzed supplied competitors: at least +10 = Ahead; -9 through +9 = Competitive; -24 through -10 = Moderate Gap; below -24 = Significant Gap. Failed competitors never receive a score and are excluded. These comparisons are not ranking or market-share evidence. Reports preserve their score version; old reports are not silently recalculated.

## Crawl and security boundaries

- Public HTTP(S), standard ports only. No embedded credentials or private/reserved IP ranges. DNS answers are validated and pinned to the connection; redirects repeat validation, preventing DNS-rebinding and redirect-based SSRF.
- One target plus at most five competitors, processed sequentially within each report. Page mode does not traverse links; domain mode uses the bounded discovery described above. `robots.txt` is checked per origin and applied to every page redirect. A disallow or unavailable robots policy fails closed. Robots 404/410 means no declared policy. Crawl-delay up to ten seconds is honored; larger delays are declined.
- Defaults: 15-second network timeout, maximum 3 MB HTML (limits apply to compressed and decompressed bytes), five page redirects, three robots redirects, ten-minute page report deadline (30 minutes for domain reports including competitors and AI), two concurrent analyses, ten starts per minute per client. Gzip, deflate and Brotli are decoded. Configurable limits are bounded in code.
- Static-only HTML: scripts are not executed. Client-rendered sites, bot challenges and very sparse pages may be unavailable or have low-confidence extraction. Source extraction excludes common non-content elements but is not a full browser visibility model.
- Local loopback binding by default. A non-loopback `HOST` requires `APP_PASSWORD`; Basic Auth username is `lighthouse`. Use a private network/VPN or authenticated TLS reverse proxy when deploying for a team. Do not expose Basic Auth over public plain HTTP. Set a reverse proxy’s read timeout to at least 30 minutes for domain reports and disable response buffering for both analysis endpoints.
- The static server exposes only `public/`. `.env`, source and test fixtures are not served. HTML and copy are escaped. CSP disallows arbitrary scripts and remote resources. Same-origin request checks and rate/concurrency limits protect the crawl endpoint.
- This MVP is ready for internal local use, not a multi-tenant public service. Shared persistence, per-user authentication and distributed rate limits are future deployment work.

## Important limitations

The engine currently uses English-language rules, a limited city list, schema localities and explicit `in/near [place]` wording. Local or semantic intent can be missed; validate uncertain classifications manually. Trust/review wording, schema, business names and dates are declared page signals, not verified claims. Missing evidence is described as “not detected,” not proof of absence from the rendered site. There is no visual inspection of image subjects, no exhaustive broken-link testing or external inbound-link crawl. Domain mode records HTTP errors on attempted URLs and inbound links from its retrieved sample. Approximate word count is descriptive; adding filler does not improve the content score. Title/description lengths are review cues rather than rigid targets. No actual ranks, traffic, backlinks, Core Web Vitals or conversions are fabricated.

## API and future integrations

`GET /api/health` returns readiness, whether AI is configured, and an export CSRF token (no API credentials). The token is readable only by the same origin, is not cached, and rotates when the server restarts.

`POST /api/analyze` accepts:

```json
{
  "targetUrl": "https://example.com/",
  "keywords": ["example domain", "documentation examples"],
  "competitorUrls": ["https://www.iana.org/help/example-domains"]
}
```

The response streams `application/x-ndjson`: progress events (`type`, `message`), then one report event (`type: "report"`, `report`) or error event (`type: "error"`, `error`). Input errors use HTTP 400; rate/capacity errors use 429. `keywords` may also be a comma/newline-separated string.

`POST /api/export` accepts a URL-encoded form containing `format` (`html` or `json`), the current export `token`, and `payload` (JSON with `report` and `checked`). It returns a native HTTP attachment instead of a blob URL, for embedded-browser compatibility. The token protects against cross-site form submissions even when the embedded browser uses an opaque form origin. Export payloads are limited to 12 MB and are not stored on the server. Reload the browser after a server restart to refresh the token.

Report schema version 1 is JSON-serializable. `public/storage.js` is the replacement boundary for future server-side history. `server/integrations/index.js` defines real provider registration, configuration checks, collection and failure isolation. Add Search Console, PageSpeed Insights, rank tracking or Google Business Profile providers there, returning attributed metrics with collection timestamps. Integrations remain an empty list when not requested or configured; attempted provider failures are explicitly recorded; external metrics must not be merged into the heuristic score without versioning its methodology.

## Testing

```sh
npm test
# Start the application in another terminal first:
npm run test:live
```

The core suite tests the five fixture types, logical scoring changes, noindex, no reward for filler, local weighting, source extraction, URL safety, missing metadata, invalid JSON-LD, competitor failure isolation, export escaping and AI quotation rejection. Fixtures are strictly test data and never appear as fabricated live reports.

The live test retrieves example.com, verifies title, description, H1/H2 and first-paragraph extraction against its fetched HTML, then runs the actual API with IANA and an intentionally unavailable competitor. Snapshots are written to ignored `artifacts/`. Override `TEST_ORIGIN`, `TEST_TARGET` and `TEST_KEYWORD` to test another server or page. Browser validation covers analysis, tabs, competitors, checklist persistence, copy, export, errors and responsive layout.

## Google PageSpeed Insights

Set `PAGESPEED_API_KEY` in `.env`, enable PageSpeed Insights API in that Google Cloud project, and restart. The key stays on the backend; `.env` is ignored by Git. A configured key enables the “Include PageSpeed Insights” checkbox. New reports show results under **Technical** and include them in history and HTML/JSON exports. Old reports are not backfilled.

Page mode tests the target URL on mobile and desktop. Domain mode tests the first retrieved page plus one distinct service-page candidate, if present, on both devices (at most four requests). Competitors are excluded. Tests run sequentially, have a 90-second timeout each, and successful compact results are cached for 15 minutes (40 runs maximum). Google receives the tested public URLs. API failures remain visible without invalidating the SEO report.

Results include Lighthouse performance, accessibility, best-practices and SEO scores, FCP, LCP, Speed Index, TBT, CLS and a selection of failing diagnostics. These are simulated **lab results**, separate from the app’s heuristic scores; TBT is not INP. Real-user Core Web Vitals are not collected here. A future CrUX integration can add them with explicit page/origin scope and coverage labels. No missing metric is converted to zero.

The page report deadline is ten minutes when including optional integrations. Official API documentation: https://developers.google.com/speed/docs/insights/v5/get-started .

### Manual Google rankings (SearchApi.io)

Set `SEARCHAPI_API_KEY` in `.env` and restart. **Check Google rankings** is optional and off by default in Page and Domain Analysis. Choose country (Canada, US, UK or Australia), English/French, mobile/desktop and an optional city/location. Checks use the first five supplied keywords at most; no scheduled or background tracking runs. Usage may be billable under your SearchApi plan. Each keyword requests up to 100 organic results once; client and competitor positions share that response. Successful identical searches are cached in memory for one hour (100 entries), including across targets. Restarting clears this cache.

The Rankings tab distinguishes the target page from the domain’s best-ranking page and includes timestamp, location used, device, returned-result count and search depth. Matching treats www and non-www as equivalent, excludes other subdomains, ignores URL fragments/trailing slashes, and retains query strings. No result is not an indexing verdict. API errors produce unavailable results, never a score of zero. Rank data does not change the existing SEO scores. Top competing results can be added to the next crawl without making additional search requests.

Snapshots are stored with existing browser report history (last 10 reports); there are no scheduled checks or trend calculations. HTML and Print/PDF exports include only the compact ranking summary; JSON retains the full saved snapshot. Search result snippets are not used as proof of a page’s content.

The backend uses Bearer authentication, a 95-second request timeout, sequential checks and stops subsequent requests on authentication/quota failures. API credentials and upstream error bodies are never included in reports. The isolated provider is `server/integrations/searchapi.js`. Tests use fixtures; `node scripts/searchapi-live-check.js` explicitly performs one manual live query through the running app and writes an ignored artifact.

### Client-friendly checks and PageSpeed actions

The Page Analysis Keywords tab includes a compact keyword-placement matrix for the supplied phrases: title, description, H1, H2/H3, opening copy and body. Green means the normalized phrase is present; amber means some non-stopword terms are present; red means no match was found. These presence observations are not a verdict on search intent or rankings. On-Page checks use readable status rows and retrieved evidence instead of a plain metadata table. Existing detailed keyword cards omit the four placement tiles already represented in the matrix.

Poor PageSpeed results now generate one Fix First action per tested page/device, combining poor category scores (below 50) and poor lab measurements using the same thresholds as the Technical tab. Each action retains the URL, device, measurements and test date, points to actual returned diagnostics, and recommends investigation/retesting without claiming a confirmed cause. Failed/unavailable runs do not create actions. This also works when reopening saved reports containing PageSpeed data, and applies to copied recommendations and exports. SEO scores remain unchanged.

Overview now shows only Mobile Performance and Desktop Performance gauges when valid PageSpeed results exist. Domain Overview uses the first sampled page rather than a site-wide average. Detailed metrics remain in Technical, and existing optimization scores are unchanged. PageSpeed defaults on when configured (also for API requests omitting includePageSpeed); explicit false skips the current scan. The UI restores the default after each scan. Old reports without results do not show empty gauges.

### PDF Report preview

The report toolbar now offers **PDF Report**, replacing Export JSON and Print / PDF. It generates a concise, actual PDF and opens it in the browser's PDF viewer, where the reader can print or save it. Export HTML and Copy Recommendations remain. The PDF includes an executive summary, On-Page Checks, keyword placement, compact rankings when available, the top five recommendations with examples, the action plan, and two dedicated PageSpeed pages (mobile and desktop). Missing device results are explicitly labeled, never filled with invented scores. For Domain Analysis the On-Page and PageSpeed pages describe the first sampled page, not the entire domain; full inventories remain in HTML/the dashboard.

PDF rendering requires Microsoft Edge installed on the server, or `PDF_BROWSER_PATH` pointing to an installed compatible Chromium browser. The renderer uses an isolated headless browser, blocks network requests, and disables JavaScript. No new crawl or paid API query is performed when generating a PDF. Only one PDF renders at a time, with a timeout. Up to five PDFs are temporarily kept in server memory for 15 minutes; preview links expire and inherit app authentication. JSON export remains available through the existing API for compatibility, but its UI button is removed.


### Simplified public analyzer

Open **http://127.0.0.1:3000/audit** for the visitor interface. The existing agency workspace remains at `/` and `/agency`. On a hosted server, set `APP_PASSWORD` to protect agency routes; `/audit`, its explicitly allowed assets and `/public-api/*` remain publicly accessible. Public requests cannot invoke domain crawls, competitor crawls, OpenAI or SearchApi rankings, even if those fields are manually submitted.

Public scans accept one webpage and 1–3 phrases. They use the shared safe crawler/parser/rules and, when configured, mobile/desktop PageSpeed. Limits are three attempts per IP per 24-hour window, one active public scan, and 20 accepted scans per UTC day across the server (`PUBLIC_DAILY_SCAN_LIMIT`). Failed/cancelled attempts still consume their allowance. The five-minute timeout bounds each scan. Counters/cache are in memory and reset on restart; use a shared persistent limiter before scaling across multiple processes. Behind a reverse proxy, configure `TRUST_PROXY_HOPS` only for your known topology so client limits work as intended.

Reports are held in memory for 30 minutes (maximum 20); opaque random report IDs grant PDF access. No public report history or directory is exposed. PDF generation is rate limited, uses stored server-generated data rather than caller-supplied reports, and reuses the generated PDF. The public PDF checklist is initially unchecked; interactive checkmarks on the visitor page are temporary. No scan is triggered on page load.

Set `PUBLIC_BOOKING_URL` to the actual consultation link; the default goes to Lighthouse Digital's homepage. Once hosted with HTTPS, set your GoHighLevel form's on-submit redirect to `https://YOUR-AUDIT-HOST/audit`. This is a redirect, not an access gate, and does not transmit contact details or create CRM records. GoHighLevel remains responsible for your lead form. Hosting/DNS and the actual GoHighLevel form redirect have not been configured by this local implementation.

`node scripts/public-check.js` checks public/private route separation, asset delivery, origin checks and scan rate limits using a separate password-protected test server. Unit tests cover public input bounds; desktop/mobile layout and a real public scan/PDF flow were checked locally.
