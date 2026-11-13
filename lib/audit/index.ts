import { FetchError, fetchPage, normalizeUrl } from "./fetcher";
import type { FetchResult } from "./fetcher";
import { parseRobots } from "./robots";
import { buildCtx, detectSiteType, extractBodyText, isProductPage, parseJsonLd } from "./context";
import type { Probes } from "./context";
import { ALL_CHECKS } from "./checks";
import type { Outcome } from "./checks";
import { CATEGORY_META } from "./types";
import type {
  AuditReport,
  CategoryId,
  CategoryScore,
  Recommendation,
  SiteType,
} from "./types";
import * as cheerio from "cheerio";

export { FetchError } from "./fetcher";
export type { AuditReport } from "./types";

const OPTIONAL_CHECKS = new Set(["ucp", "llms-txt"]);
const EFFORT_COST = { low: 1, medium: 1.6, high: 2.5 } as const;

const looksHtml =(s: string) => /^\s*<(!doctype|html|head|body|\?xml.*\?>\s*<html)/i.test(s);

async function probe(origin: URL, path: string, maxBytes = 400_000): Promise<FetchResult | null> {
  try {
    const r = await fetchPage(new URL(path, origin), { timeoutMs: 6000, maxBytes, maxRedirects: 3 });
    return r.status === 200 ? r : null;
  } catch {
    return null;
  }
}

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function runProbes(origin: URL, siteType: SiteType): Promise<Probes> {
  const eco = siteType === "ecommerce";
  const [robotsRes, sitemapRes, llmsRes, ucpRes, c1, c2] = await Promise.all([
    probe(origin, "/robots.txt"),
    probe(origin, "/sitemap.xml", 600_000),
    probe(origin, "/llms.txt"),
    eco ? probe(origin, "/.well-known/ucp") : Promise.resolve(null),
    eco ? probe(origin, "/products.json?limit=1") : probe(origin, "/openapi.json"),
    eco ? probe(origin, "/wp-json/wc/store/v1/products?per_page=1") : Promise.resolve(null),
  ]);

  const robotsText = robotsRes && !looksHtml(robotsRes.body) ? robotsRes.body : "";
  const parsed = robotsText ? parseRobots(robotsText) : null;

  const isSitemap = (b: string) => /<urlset|<sitemapindex/i.test(b);
  let sitemap: Probes["sitemap"] = { found: false };
  if (sitemapRes && isSitemap(sitemapRes.body)) {
    sitemap = { found: true, url: new URL("/sitemap.xml", origin).toString() };
  } else if (parsed?.sitemaps.length) {
    try {
      const u = new URL(parsed.sitemaps[0], origin);
      const r = await probe(u, u.toString(), 600_000);
      if (r && isSitemap(r.body)) sitemap = { found: true, url: u.toString() };
    } catch {
      /* ignore invalid sitemap url */
    }
  }

  const ucpJson = ucpRes ? tryJson(ucpRes.body) : null;
  let catalogKind: Probes["catalog"]["kind"] = null;
  if (eco) {
    const shop = c1 ? (tryJson(c1.body) as { products?: unknown } | null) : null;
    const woo = c2 ? tryJson(c2.body) : null;
    if (shop && Array.isArray(shop.products)) catalogKind = "shopify";
    else if (Array.isArray(woo)) catalogKind = "woocommerce";
  } else if (c1) {
    const api = tryJson(c1.body) as { openapi?: unknown; swagger?: unknown } | null;
    if (api && (api.openapi || api.swagger)) catalogKind = "openapi";
  }

  return {
    robots: { found: !!parsed, text: robotsText, parsed },
    sitemap,
    llms: !!llmsRes && !looksHtml(llmsRes.body) && llmsRes.body.trim().length > 10,
    ucp: !!ucpJson && typeof ucpJson === "object",
    catalog: { kind: catalogKind },
  };
}

function gradeFor(score: number): { label: string; summary: string } {
  if (score >= 85)
    return { label: "Agent-ready", summary: "AI agents can read, trust and act on this site with little friction." };
  if (score >= 70)
    return { label: "Nearly there", summary: "Solid foundations. A few gaps are holding back agent visibility and conversion." };
  if (score >= 50)
    return { label: "Partially ready", summary: "Agents can find you, but they're missing data or trust signals needed to recommend you confidently." };
  if (score >= 30)
    return { label: "Hard for agents to use", summary: "Important facts and trust signals are missing or hidden, so agents will often pick competitors instead." };
  return { label: "Not agent-ready", summary: "Agents can barely understand or verify this site. There is a lot of upside from the basics." };
}

export interface AuditInput {
  url: string;
  siteType?: SiteType | "auto";
}

export async function runAudit(input: AuditInput): Promise<AuditReport> {
  const startUrl = normalizeUrl(input.url);
  const page = await fetchPage(startUrl, { maxBytes: 2_500_000 });

  if (page.status === 401 || page.status === 403 || page.status === 429 || page.status === 503) {
    throw new FetchError(
      `The site blocked our audit request (HTTP ${page.status}). If this is your site, allow our crawler or try again later. Note that agents may be blocked the same way.`,
      "blocked",
    );
  }
  if (page.status >= 400) {
    throw new FetchError(`The site returned an error (HTTP ${page.status}).`, "http");
  }
  const ctype = String(page.headers["content-type"] || "").toLowerCase();
  if (ctype && !ctype.includes("html") && !looksHtml(page.body)) {
    throw new FetchError("That address didn't return a web page.", "content-type");
  }

  // Pre-parse once to decide the site type, then build the full context.
  const $0 = cheerio.load(page.body);
  const j0 = parseJsonLd($0);
  const text0 = extractBodyText($0);
  const detected = detectSiteType($0, page.finalUrl, j0, text0, page.body);
  const override = input.siteType && input.siteType !== "auto" ? input.siteType : null;
  const siteType: SiteType = override ?? detected;

  const probes = await runProbes(new URL(page.finalUrl.origin), siteType);
  const ctx = buildCtx(page.finalUrl, page.body, page.headers, page.ttfbMs, page.bytes, probes, siteType);

  // Run every applicable check. One failing check must never kill the audit.
  const outcomes: Outcome[] = [];
  for (const fn of ALL_CHECKS) {
    try {
      const o = fn(ctx);
      if (o) outcomes.push(o);
    } catch (err) {
      console.error("check failed", err);
    }
  }

  // Emerging / optional items shouldn't look like hard failures.
  for (const o of outcomes) {
    if (OPTIONAL_CHECKS.has(o.check.id) && o.check.status === "fail") o.check.status = "warn";
  }

  // Category scores.
  const catIds = (Object.keys(CATEGORY_META) as CategoryId[]).filter((id) =>
    outcomes.some((o) => o.check.category === id),
  );
  const shareTotal = catIds.reduce((s, id) => s + CATEGORY_META[id].weight, 0);
  const catTotals = new Map<CategoryId, number>();

  const categories: CategoryScore[] = catIds.map((id) => {
    const checks = outcomes.filter((o) => o.check.category === id).map((o) => o.check);
    const weight = checks.reduce((s, c) => s + c.weight, 0);
    const earned = checks.reduce((s, c) => s + c.earned, 0);
    catTotals.set(id, weight);
    return {
      id,
      label: CATEGORY_META[id].label,
      tagline: CATEGORY_META[id].tagline,
      score: Math.round((earned / weight) * 100),
      checks,
    };
  });

  const overall = Math.round(
    categories.reduce((s, c) => s + c.score * (CATEGORY_META[c.id].weight / shareTotal), 0),
  );

  // Recommendations, valued by how many overall points each is worth.
  const recommendations: Recommendation[] = outcomes
    .filter((o) => o.rec)
    .map((o) => {
      const lost = o.check.weight - o.check.earned;
      const share = CATEGORY_META[o.check.category].weight / shareTotal;
      const gain = (lost / (catTotals.get(o.check.category) || 1)) * share * 100;
      const rec = o.rec!;
      return {
        id: o.check.id,
        checkId: o.check.id,
        category: o.check.category,
        title: rec.title,
        why: rec.why,
        how: rec.how,
        effort: rec.effort,
        expert: rec.expert,
        pointsGain: Math.round(gain * 10) / 10,
        priority: OPTIONAL_CHECKS.has(o.check.id) ? "low" : gain >= 4 ? "high" : gain >= 2 ? "medium" : "low",
      } satisfies Recommendation;
    })
    // Quick wins first (points gained per unit of effort); optional items last.
    .sort((a, b) => {
      const opt = Number(OPTIONAL_CHECKS.has(a.id)) - Number(OPTIONAL_CHECKS.has(b.id));
      if (opt) return opt;
      return b.pointsGain / EFFORT_COST[b.effort] - a.pointsGain / EFFORT_COST[a.effort];
    });

  const potential = Math.min(100, Math.round(overall + recommendations.reduce((s, r) => s + r.pointsGain, 0)));

  const limitations = [
    "This audit reads the raw HTML of a single page, the way many AI crawlers do. It does not run JavaScript.",
    "Scores are readiness indicators based on best practices, not predictions of rankings or AI recommendations.",
    "CDN/WAF bot-blocking rules and live Merchant Center feed contents can't be seen from outside.",
  ];
  if (siteType === "ecommerce" && !isProductPage(ctx.$, ctx.url, ctx.jsonld, ctx.bodyText)) {
    limitations.push("This looks like a store page rather than a product page. For the most useful result, also audit a product URL.");
  }

  return {
    url: startUrl.toString(),
    finalUrl: page.finalUrl.toString(),
    fetchedAt: new Date().toISOString(),
    siteType,
    siteTypeDetected: !override,
    pageKind: ctx.pageKind,
    overall,
    potential,
    grade: gradeFor(overall),
    categories,
    recommendations,
    meta: {
      title: ctx.$("title").first().text().trim(),
      ttfbMs: page.ttfbMs,
      htmlBytes: page.bytes,
      wordCount: ctx.wordCount,
    },
    limitations,
  };
}
