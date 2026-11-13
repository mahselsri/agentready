# AgentReady

Paste a website address, get an **agent readiness score (0-100)** and a fix list ordered by quickest win. Every report gets a shareable link. An expert-request flow is built but switched off (see Config).

Built with Next.js 15 (App Router) + TypeScript. The audit runs in Node on the server.

## Run it

```bash
npm install
npm run dev            # http://localhost:3000
```

Audit from the terminal:

```bash
npm run audit -- https://yourstore.com/products/some-product
npm run audit -- yourstore.com ecommerce     # force a site type
```

Production build: `npm run build && npm start`.

## Deploy to Vercel

1. Push this repo to GitHub, then in Vercel choose **Add New > Project** and import it. No build settings need changing.
2. **Optional but recommended:** add an Upstash Redis database (Vercel dashboard > Storage / Marketplace > Upstash Redis) and connect it to the project. This adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` variables automatically. Without it, audits still work but **share links are switched off**, because Vercel's filesystem doesn't persist between requests. Saved reports expire after 30 days.
3. Set `AUDIT_BOT_CONTACT` to a real email or URL. Site owners see it in the crawler's User-Agent.
4. Optionally set `NEXT_PUBLIC_SITE_URL` to your final domain so link previews use it. On Vercel it falls back to the deployment URL.
5. Do **not** set `AUDIT_ALLOW_PRIVATE`.

Audits can take up to ~20 seconds on slow sites; the audit route allows 60 seconds. The rate limiter (15 audits per IP per hour) is in memory, so on Vercel it is per server instance and only a soft limit. That is fine for friends testing. Use Upstash rate limiting before opening it to the public.

## What it checks (A.I.R.V. framework)

| Layer | Weight | Examples |
| --- | --- | --- |
| Machine readiness | 35% | JSON-LD validity, Product/Offer or Organization schema, schema completeness, content present in raw HTML, price/stock in HTML, AI crawlers allowed in robots.txt, sitemap, metadata, llms.txt |
| Intent & use-case | 25% | Q&A content, objective specs, heading structure, specific vs vague copy, alt text, "best for / compatible with" statements |
| Trust validation | 25% | HTTPS/HSTS, contact info, policies, About + address, verified reviews, social profiles, pop-ups/fake timers, server speed |
| Transaction readiness | 15% | Catalog endpoint (Shopify/Woo/OpenAPI), wallets & UPI, visible add-to-cart / CTA, UCP manifest |

Checks adapt to the site type (store, SaaS, local business, content, general) and to whether the page is a product page. Each failing check produces a recommendation with *why*, *how*, effort, estimated points gained and an `expert` skill tag you can use to route work later.

## Layout

```
app/page.tsx                    landing page
app/opengraph-image.tsx         link-preview image for the site
app/r/[id]/page.tsx             shared report (noindex)
app/r/[id]/opengraph-image.tsx  link-preview image showing that report's score
app/api/audit/route.ts          POST {url, siteType?} -> AuditReport (rate-limited, saves the report)
app/api/leads/route.ts          expert request -> data/leads.jsonl (+ webhook). 404 unless experts enabled
app/globals.css                 design tokens and all styles
components/AuditApp.tsx         hero, form, loading state, report mount
components/AgentView.tsx        the "what an agent reads" panel (also the progress display)
components/WeightBar.tsx        the score drawn as four weighted segments
components/Report.tsx           score, ranked fixes, every check (no client JS needed)
components/ShareLink.tsx        copy-link bar
components/LeadForm.tsx         expert request form (hidden by default)
lib/store.ts                    report storage: Upstash Redis, local disk, or off
lib/features.ts                 feature flags
lib/audit/fetcher.ts            SSRF-safe fetcher
lib/audit/robots.ts             robots.txt parser (RFC 9309 longest-match)
lib/audit/context.ts            HTML/JSON-LD parsing, site-type detection
lib/audit/checks.ts             every check + its recommendation text
lib/audit/index.ts              orchestration, probes, scoring, ranking
scripts/audit-cli.ts            terminal runner
```

To add a check: write a function in `checks.ts` returning `mk(def, ratio, detail, recommendation)` and add it to `ALL_CHECKS`. Scores renormalise automatically.

## Config

Copy `.env.example` to `.env.local` for local use; set the same names in Vercel for deployment.

| Variable | Purpose |
| --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) | Report storage on serverless hosts. Without them: local disk in development, no share links on Vercel. |
| `AUDIT_BOT_CONTACT` | Contact shown in the crawler's User-Agent. |
| `NEXT_PUBLIC_SITE_URL` | Public site URL for link previews. |
| `NEXT_PUBLIC_ENABLE_EXPERTS=1` | Turns the expert-request flow on (tick-boxes, lead form, `/api/leads`). Off by default. Rebuild after changing it. |
| `LEADS_WEBHOOK_URL` | Forwards each expert request as JSON (Slack, Zapier, Make, CRM). Only used when experts are enabled. |
| `AUDIT_ALLOW_PRIVATE=1` | Lets the auditor fetch localhost/private IPs. **Development and tests only. Never in production.** |

## Security notes

The server fetches URLs that strangers type in, so the fetcher blocks SSRF: http/https on ports 80/443 only, no embedded credentials, private/loopback/link-local/metadata addresses rejected **at DNS-resolution time** (defeats DNS rebinding), every redirect hop re-validated, response size and time capped.

Reports describe third-party sites. Share links use 12 random characters so they can't be guessed, pages are `noindex`, and Redis storage expires after 30 days.

## Known limits

- Reads raw HTML for **one page** and does not execute JavaScript. This mirrors many AI crawlers, but means client-rendered sites score low by design.
- CDN/WAF bot blocking and the contents of a Merchant Center feed can't be seen from outside.
- Scores are best-practice indicators, not predictions of AI recommendations. Keep marketing claims in line with that.
- Thresholds were tuned on local test pages only. Run a handful of real stores and adjust before wider launch.

## Suggested next steps

1. Crawl several pages (home + 3 products + a policy page) and average.
2. Downloadable PDF report; email the report to the person who ran it.
3. Expert marketplace: match on the `expert` tag, quote per recommendation.
4. Monitoring subscription: re-audit weekly, alert on regressions.
5. AI-visibility tracking: run category prompts through assistant APIs and report how often the brand is cited versus competitors.
