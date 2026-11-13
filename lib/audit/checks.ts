import type {
  CategoryId,
  CheckResult,
  Effort,
  ExpertSkill,
  Status,
} from "./types";
import type { Ctx } from "./context";
import { LOCAL_TYPES, hasAnyType, nodesOfType } from "./context";
import { checkRobots } from "./robots";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export interface RecInput {
  title: string;
  why: string;
  how: string;
  effort: Effort;
  expert: ExpertSkill;
}

export interface Outcome {
  check: CheckResult;
  ratio: number;
  rec?: RecInput;
}

interface Def {
  id: string;
  category: CategoryId;
  title: string;
  weight: number;
}

type CheckFn = (c: Ctx) => Outcome | null;

function mk(def: Def, ratio: number, detail: string, rec?: RecInput): Outcome {
  const r = Math.max(0, Math.min(1, ratio));
  const status: Status = r >= 0.9 ? "pass" : r > 0 ? "warn" : "fail";
  return {
    ratio: r,
    check: { ...def, status, earned: +(def.weight * r).toFixed(2), detail },
    rec: status === "pass" ? undefined : rec,
  };
}

const asArray = (v: Json): Json[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const has = (node: Json, keys: string): boolean =>
  keys.split("|").some((k) => {
    const v = node?.[k];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  });

function links(c: Ctx): { href: string; text: string }[] {
  return c.$("a[href]")
    .toArray()
    .map((el) => ({
      href: (c.$(el).attr("href") || "").toLowerCase(),
      text: c.$(el).text().replace(/\s+/g, " ").trim().toLowerCase(),
    }));
}

const ORG_TYPES = [
  "Organization", "Corporation", "OnlineStore", "NGO", "EducationalOrganization",
  "OnlineBusiness", "Store", ...LOCAL_TYPES,
];

/* ───────────────────────── MACHINE READINESS ───────────────────────── */

const jsonld: CheckFn = (c) => {
  const def: Def = {
    id: "jsonld",
    category: "machine",
    title: "Structured data (JSON-LD) is present and valid",
    weight: 8,
  };
  const { blocks, parseErrors, types } = c.jsonld;
  const rec: RecInput = {
    title: "Add valid JSON-LD structured data",
    why: "AI agents and search engines read schema.org markup to understand what a page is about without guessing from layout or marketing copy.",
    how: "Add <script type=\"application/ld+json\"> blocks describing your organization and key entities, then validate them with Google's Rich Results Test and the Schema Markup Validator. Fix any block that fails to parse.",
    effort: "low",
    expert: "schema",
  };
  if (blocks === 0) return mk(def, 0, "No JSON-LD structured data found in the page HTML.", rec);
  if (parseErrors > 0)
    return mk(def, 0.5, `${blocks} JSON-LD block(s) found, but ${parseErrors} could not be parsed.`, rec);
  if (types.size === 0)
    return mk(def, 0.5, `${blocks} JSON-LD block(s) found, but none declare an @type.`, rec);
  return mk(def, 1, `${blocks} JSON-LD block(s) found. Types: ${[...types].slice(0, 8).join(", ")}.`);
};

const entitySchema: CheckFn = (c) => {
  const j = c.jsonld;
  if (c.pageKind === "product") {
    const def: Def = {
      id: "entity-schema",
      category: "machine",
      title: "Product + Offer schema describes what you sell",
      weight: 10,
    };
    const rec: RecInput = {
      title: "Add Product and Offer schema to product pages",
      why: "Shopping agents compare products using price, currency and availability. If those aren't in structured data, you're easier to skip or mis-quote.",
      how: "Output a Product object with name, image, description, brand, sku/gtin and an Offer containing price, priceCurrency, availability (schema.org/InStock etc.) and url. Most platforms (Shopify, WooCommerce) can do this through theme settings or a schema app; the values must match what's visible on the page.",
      effort: "medium",
      expert: "schema",
    };
    const products = nodesOfType(j, "Product", "ProductGroup", "IndividualProduct");
    if (!products.length)
      return mk(def, 0, "This looks like a product page, but no Product schema was found.", rec);
    const offers = [
      ...products.flatMap((p) => asArray(p.offers)),
      ...nodesOfType(j, "Offer", "AggregateOffer"),
    ].filter(Boolean);
    if (!offers.length)
      return mk(def, 0.4, "Product schema found, but it has no Offer (price / availability).", rec);
    const complete = offers.some(
      (o) => (o.price != null || o.lowPrice != null) && o.priceCurrency && o.availability,
    );
    return complete
      ? mk(def, 1, "Product schema with price, currency and availability found.")
      : mk(def, 0.7, "Offer found, but price, priceCurrency or availability is missing.", rec);
  }

  const def: Def = {
    id: "entity-schema",
    category: "machine",
    title: "Core entity schema says who you are",
    weight: 10,
  };
  const rec: RecInput = {
    title: "Add Organization / WebSite schema (and a type-specific entity)",
    why: "Entity schema tells agents your official name, URL, logo and profiles, which is how they connect your site to the business they are recommending.",
    how: "Add Organization (or LocalBusiness / SoftwareApplication / Article as appropriate) plus WebSite JSON-LD on the homepage. Include name, url, logo and sameAs links to your official profiles.",
    effort: "low",
    expert: "schema",
  };
  const org = hasAnyType(j, ...ORG_TYPES);
  const site = hasAnyType(j, "WebSite");
  let ratio = 0;
  let detail = "";
  switch (c.siteType) {
    case "saas":
      if (hasAnyType(j, "SoftwareApplication", "WebApplication")) { ratio = 1; detail = "SoftwareApplication schema found."; }
      else if (org && site) { ratio = 0.8; detail = "Organization and WebSite schema found; consider SoftwareApplication for the product."; }
      else if (org) { ratio = 0.6; detail = "Organization schema found, but no WebSite or SoftwareApplication."; }
      break;
    case "local":
      if (LOCAL_TYPES.some((t) => j.types.has(t))) { ratio = 1; detail = "LocalBusiness-type schema found."; }
      else if (org) { ratio = 0.5; detail = "Organization schema found, but not a LocalBusiness type with address and hours."; }
      break;
    case "content":
      if (hasAnyType(j, "Article", "BlogPosting", "NewsArticle")) { ratio = 1; detail = "Article schema found."; }
      else if (org) { ratio = 0.6; detail = "Organization schema found, but no Article markup on this page."; }
      break;
    default:
      if (org && site) { ratio = 1; detail = "Organization and WebSite schema found."; }
      else if (org) { ratio = 0.7; detail = "Organization schema found, but no WebSite schema."; }
      else if (site) { ratio = 0.4; detail = "WebSite schema found, but no Organization schema."; }
  }
  if (!detail) detail = "No Organization, WebSite or business-type schema found.";
  return mk(def, ratio, detail, rec);
};

const schemaComplete: CheckFn = (c) => {
  const j = c.jsonld;
  const pick = (...t: string[]) => nodesOfType(j, ...t)[0];
  let node: Json;
  let label = "";
  let fields: string[] = [];
  if (c.pageKind === "product" && (node = pick("Product", "ProductGroup", "IndividualProduct"))) {
    label = "Product";
    fields = ["name", "image", "description", "brand", "sku|gtin|gtin13|gtin8|mpn", "aggregateRating|review"];
  } else if ((node = nodesOfType(j, ...LOCAL_TYPES)[0])) {
    label = "LocalBusiness";
    fields = ["name", "address", "telephone", "openingHours|openingHoursSpecification", "geo|hasMap", "image"];
  } else if ((node = pick("SoftwareApplication", "WebApplication"))) {
    label = "SoftwareApplication";
    fields = ["name", "description", "applicationCategory", "offers", "aggregateRating"];
  } else if ((node = pick("Article", "BlogPosting", "NewsArticle"))) {
    label = "Article";
    fields = ["headline", "author", "datePublished", "image", "publisher"];
  } else if ((node = nodesOfType(j, ...ORG_TYPES)[0])) {
    label = "Organization";
    fields = ["name", "url", "logo", "sameAs", "contactPoint|telephone|email"];
  } else return null; // no entity: already penalised by the checks above

  const def: Def = {
    id: "schema-complete",
    category: "machine",
    title: `${label} schema has the fields agents look for`,
    weight: 6,
  };
  const missing = fields.filter((f) => !has(node, f)).map((f) => f.split("|")[0]);
  const ratio = (fields.length - missing.length) / fields.length;
  return mk(
    def,
    ratio,
    missing.length
      ? `${label} schema is missing: ${missing.join(", ")}.`
      : `${label} schema includes all the key fields we check.`,
    {
      title: `Fill in the missing ${label} schema fields`,
      why: "Complete entities are easier to match to a user's request and to cite accurately. Missing identifiers (brand, SKU/GTIN, address, hours) are a common reason listings get ignored.",
      how: `Add these properties to your ${label} JSON-LD: ${missing.join(", ")}. Only include values that are visible and accurate on the page.`,
      effort: "low",
      expert: "schema",
    },
  );
};

const rawContent: CheckFn = (c) => {
  const def: Def = {
    id: "ssr-content",
    category: "machine",
    title: "Content is present in the raw HTML (no JavaScript needed)",
    weight: 8,
  };
  const w = c.wordCount;
  const shell = c.$("#root,#app,#__next,#___gatsby,#app-root").length > 0 && w < 150;
  // Product pages are naturally shorter than homepages or articles.
  const full = c.pageKind === "product" ? 150 : 250;
  const partial = c.pageKind === "product" ? 80 : 120;
  const ratio = w >= full ? 1 : w >= partial ? 0.7 : w >= 40 ? 0.3 : 0;
  const detail = `${w} words of readable text in the initial HTML response${shell ? "; this looks like a client-side-rendered shell" : ""}.`;

  // A near-empty page is a rendering problem; a short page is a content problem.
  if (shell || w < 40) {
    return mk(def, ratio, detail, {
      title: "Server-render (or pre-render) your core content",
      why: "Many AI crawlers and agents fetch HTML without running JavaScript. If your product details, prices and copy only appear after scripts execute, those agents see an empty page.",
      how: "Use server-side rendering or static generation for key pages (Next.js, Nuxt, Astro, or your platform's default theme rendering). Verify with `curl -s <url>` or View Source: your product name, price, description and policies should be visible there.",
      effort: "high",
      expert: "rendering",
    });
  }
  return mk(def, ratio, detail, {
    title: "Add more substantive, factual content to the page",
    why: "The page is server-rendered, which is good, but there is little text for an agent to quote or match against a request.",
    how: "Expand the page with what a buyer needs to decide: who it's for, what's included, measurable specifications, delivery and return terms, and answers to common questions.",
    effort: "medium",
    expert: "content",
  });
};

const keyFacts: CheckFn = (c) => {
  if (c.siteType !== "ecommerce" || c.pageKind !== "product") return null;
  const def: Def = {
    id: "key-facts",
    category: "machine",
    title: "Price and stock status are in the raw HTML",
    weight: 6,
  };
  const offers = nodesOfType(c.jsonld, "Offer", "AggregateOffer");
  const price =
    offers.some((o) => o.price != null || o.lowPrice != null) ||
    c.$('[itemprop="price"], meta[property="product:price:amount"], meta[property="og:price:amount"]').length > 0 ||
    /(?:₹|rs\.?|inr|\$|€|£)\s?\d[\d,.]*/i.test(c.bodyText);
  const avail =
    offers.some((o) => o.availability) ||
    /in stock|out of stock|sold out|pre-?order|available|ships (in|within)|add to (cart|bag)/i.test(c.bodyText);
  const ratio = (price ? 0.6 : 0) + (avail ? 0.4 : 0);
  return mk(
    def,
    ratio,
    `Price ${price ? "found" : "NOT found"}, availability ${avail ? "found" : "NOT found"} in the initial HTML.`,
    {
      title: "Put price and stock status in the initial HTML",
      why: "Agents compare price and availability first. If they only load after JavaScript runs, the agent may quote stale data or skip you.",
      how: "Render the price and an in-stock / out-of-stock label on the server, and mirror both in Offer schema (price, priceCurrency, availability). Keep them in sync with your catalog.",
      effort: "medium",
      expert: "rendering",
    },
  );
};

const RETRIEVAL_BOTS = [
  "Googlebot", "Bingbot", "OAI-SearchBot", "ChatGPT-User",
  "PerplexityBot", "Claude-SearchBot", "Claude-User",
];
const TRAINING_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended", "CCBot"];

const aiCrawlers: CheckFn = (c) => {
  const def: Def = {
    id: "ai-crawlers",
    category: "machine",
    title: "AI search & assistant crawlers are allowed in robots.txt",
    weight: 8,
  };
  const { robots } = c.probes;
  if (!robots.found || !robots.parsed) {
    return mk(def, 1, "No robots.txt found, so crawlers are allowed by default.");
  }
  const blocked = RETRIEVAL_BOTS.filter((b) => !checkRobots(robots.parsed!, b, "/").allowed);
  const trainingBlocked = TRAINING_BOTS.filter((b) => !checkRobots(robots.parsed!, b, "/").allowed);
  const ratio = 1 - blocked.length / RETRIEVAL_BOTS.length;
  const tail = trainingBlocked.length
    ? ` Training crawlers blocked (not scored, your choice): ${trainingBlocked.join(", ")}.`
    : "";
  return mk(
    def,
    ratio,
    blocked.length
      ? `Blocked from the homepage: ${blocked.join(", ")}.${tail}`
      : `All search and assistant crawlers we check are allowed.${tail}`,
    {
      title: "Allow AI search and assistant crawlers",
      why: "These bots fetch pages when an assistant is answering a live question or building a search index. If they're blocked, you can't be recommended from fresh results.",
      how: `Remove the Disallow rules affecting ${blocked.join(", ")}. These are separate from model-training crawlers (GPTBot, ClaudeBot, Google-Extended), so you can allow one group and block the other. Also check CDN/WAF bot settings (for example Cloudflare's AI crawler controls), which override robots.txt and aren't visible to this audit.`,
      effort: "low",
      expert: "technical-seo",
    },
  );
};

const sitemap: CheckFn = (c) => {
  const def: Def = {
    id: "sitemap",
    category: "machine",
    title: "XML sitemap is available",
    weight: 4,
  };
  return c.probes.sitemap.found
    ? mk(def, 1, `Sitemap found at ${c.probes.sitemap.url}.`)
    : mk(def, 0, "No sitemap found in robots.txt or at /sitemap.xml.", {
        title: "Publish an XML sitemap and reference it in robots.txt",
        why: "Sitemaps are how crawlers discover every product and page, including new ones.",
        how: "Generate /sitemap.xml (most platforms and CMS plugins do this automatically), include lastmod dates, and add a `Sitemap:` line to robots.txt.",
        effort: "low",
        expert: "technical-seo",
      });
};

const metadata: CheckFn = (c) => {
  const def: Def = {
    id: "metadata",
    category: "machine",
    title: "Page metadata is clear (title, description, canonical, h1, lang)",
    weight: 4,
  };
  const $ = c.$;
  const title = $("title").first().text().trim();
  const desc = ($('meta[name="description"]').attr("content") || "").trim();
  const parts = {
    title: title.length >= 10 && title.length <= 70,
    "meta description": desc.length >= 50 && desc.length <= 180,
    canonical: $('link[rel="canonical"]').length > 0,
    "single h1": $("h1").length === 1,
    "html lang": !!$("html").attr("lang"),
  };
  const missing = Object.entries(parts).filter(([, ok]) => !ok).map(([k]) => k);
  return mk(
    def,
    (5 - missing.length) / 5,
    missing.length ? `Needs attention: ${missing.join(", ")}.` : "All five basics are in place.",
    {
      title: "Fix basic page metadata",
      why: "Titles, descriptions and canonical URLs are the cheapest signals an agent uses to decide what a page is and which URL is the real one.",
      how: `Fix: ${missing.join(", ")}. Aim for a 10-70 character descriptive title, a 50-180 character factual description, one <h1>, a rel=canonical link and <html lang>.`,
      effort: "low",
      expert: "technical-seo",
    },
  );
};

const llms: CheckFn = (c) => {
  const def: Def = {
    id: "llms-txt",
    category: "machine",
    title: "llms.txt guide for AI systems (optional, emerging)",
    weight: 2,
  };
  return c.probes.llms
    ? mk(def, 1, "/llms.txt found.")
    : mk(def, 0, "No /llms.txt found. This is an emerging convention; support by AI providers is unconfirmed.", {
        title: "Consider adding an llms.txt file",
        why: "A short Markdown index of your most important pages is cheap to publish and may help some agents and developer tools. Treat it as low priority.",
        how: "Create /llms.txt with your business summary and links to key pages (products, pricing, policies, docs).",
        effort: "low",
        expert: "technical-seo",
      });
};

/* ───────────────────────── INTENT & USE-CASE ───────────────────────── */

const faq: CheckFn = (c) => {
  const def: Def = {
    id: "faq",
    category: "intent",
    title: "Direct question-and-answer content",
    weight: 6,
  };
  const $ = c.$;
  const q = $("h2,h3,h4,summary,dt")
    .toArray()
    .filter((el) => $(el).text().trim().endsWith("?")).length;
  const schema = hasAnyType(c.jsonld, "FAQPage");
  const ratio = (q >= 3 ? 0.7 : q >= 1 ? 0.35 : 0) + (schema ? 0.3 : 0);
  return mk(
    def,
    ratio,
    `${q} question-style heading(s) found${schema ? "; FAQPage schema present" : "; no FAQPage schema"}.`,
    {
      title: "Add fact-first Q&A blocks for real customer questions",
      why: "People ask assistants full questions (\"Is this good for flat feet?\"). Pages that state a direct answer in the first sentence are easy to quote accurately.",
      how: "Write 5-10 questions customers actually ask (from support tickets and reviews). Use the question as a heading, answer in one or two factual sentences, and optionally mark it up as FAQPage schema. Keep the visible text identical to the markup.",
      effort: "medium",
      expert: "content",
    },
  );
};

const SPEC_WORDS = [
  "material", "size", "dimension", "weight", "colou?r", "capacity", "compatib", "warranty",
  "ingredient", "battery", "fabric", "care", "model", "sku", "power", "voltage",
  "storage", "memory", "display", "resolution", "fit",
];

const specs: CheckFn = (c) => {
  const $ = c.$;
  if (c.pageKind === "product") {
    const def: Def = {
      id: "specs",
      category: "intent",
      title: "Objective product specifications are listed",
      weight: 6,
    };
    const text = $("table, dl, ul li")
      .toArray()
      .map((el) => $(el).text().toLowerCase())
      .join(" ");
    const hits = SPEC_WORDS.filter((w) => new RegExp(w).test(text)).length;
    const ratio = hits >= 4 ? 1 : hits >= 2 ? 0.6 : hits === 1 ? 0.3 : 0;
    return mk(def, ratio, `${hits} spec-style attribute(s) found in tables or lists (material, size, weight, etc.).`, {
      title: "List objective specifications in a table or list",
      why: "Agents filter on facts: size, material, capacity, compatibility, warranty. Poetic descriptions can't be matched to a request like \"waterproof, under 500 g\".",
      how: "Add a specification table (<table> or <dl>) with measurable attributes and units: dimensions, weight, materials, compatibility, warranty period, care instructions.",
      effort: "medium",
      expert: "content",
    });
  }
  const def: Def = {
    id: "specs",
    category: "intent",
    title: "Facts are in structured lists or tables",
    weight: 5,
  };
  const lists = $("ul, ol").toArray().filter((el) => $(el).children("li").length >= 3).length;
  const n = $("table").length + $("dl").length + lists;
  const ratio = n >= 2 ? 1 : n === 1 ? 0.6 : 0;
  return mk(def, ratio, `${n} structured list(s) or table(s) found.`, {
    title: "Present key facts in lists and tables, not just paragraphs",
    why: "Plans, features, pricing, hours and specifications are easiest for machines to extract (and for people to scan) from lists and tables.",
    how: "Convert feature, pricing and spec paragraphs into bullet lists or comparison tables with clear labels and units.",
    effort: "low",
    expert: "content",
  });
};

const headings: CheckFn = (c) => {
  const def: Def = {
    id: "headings",
    category: "intent",
    title: "Heading structure is logical",
    weight: 4,
  };
  const levels = c.$("h1,h2,h3,h4,h5,h6")
    .toArray()
    .map((el) => Number((el as { tagName?: string }).tagName?.slice(1)) || 0);
  const oneH1 = levels.filter((l) => l === 1).length === 1;
  const manyH2 = levels.filter((l) => l === 2).length >= 2;
  let skips = false;
  for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) skips = true;
  const issues = [
    !oneH1 && "not exactly one <h1>",
    !manyH2 && "fewer than two <h2> sections",
    skips && "heading levels are skipped",
  ].filter(Boolean) as string[];
  return mk(def, (3 - issues.length) / 3, issues.length ? `Issues: ${issues.join("; ")}.` : "Clean h1 → h2 → h3 hierarchy.", {
    title: "Fix the heading hierarchy",
    why: "Headings are the outline agents use to find the part of a page that answers a question.",
    how: `Use one <h1> for the page topic, <h2> for sections, <h3> for subsections, without skipping levels. Currently: ${issues.join("; ")}.`,
    effort: "low",
    expert: "content",
  });
};

const FLUFF =
  /\b(best[- ]in[- ]class|world[- ]class|cutting[- ]edge|state[- ]of[- ]the[- ]art|revolutionary|game[- ]chang(?:er|ing)|next[- ]gen(?:eration)?|seamless(?:ly)?|innovative|unleash|unlock|supercharge|leverage|synerg\w+|holistic|robust|elevate|transform your|premium quality|world's (?:best|leading))\b/gi;

const specificity: CheckFn = (c) => {
  if (c.wordCount < 80) return null;
  const def: Def = {
    id: "specificity",
    category: "intent",
    title: "Copy is specific rather than vague marketing language",
    weight: 4,
  };
  const fluff = (c.bodyText.match(FLUFF) || []).length;
  const nums = (c.bodyText.match(/\b\d[\d,.]*\b/g) || []).length;
  const fluffPer100 = (fluff / c.wordCount) * 100;
  const numPer100 = (nums / c.wordCount) * 100;
  const ratio = 1 - Math.min(0.5, fluffPer100 * 0.2) - (numPer100 < 0.8 ? 0.3 : 0);
  return mk(
    def,
    ratio,
    `${fluff} vague buzzword(s) and ${nums} concrete number(s) in ${c.wordCount} words (heuristic).`,
    {
      title: "Replace vague claims with specifics",
      why: "\"Innovative, seamless, world-class\" gives an agent nothing to match a request against. Numbers, units, names and conditions do.",
      how: "Rewrite headline benefits as facts: what it is, who it's for, sizes/prices/timeframes, what's included, and proof (certifications, test results, customer counts).",
      effort: "medium",
      expert: "content",
    },
  );
};

const altText: CheckFn = (c) => {
  const imgs = c.$("img").toArray();
  if (!imgs.length) return null;
  const def: Def = {
    id: "alt-text",
    category: "intent",
    title: "Images have descriptive alt text",
    weight: 3,
  };
  const withAlt = imgs.filter((el) => (c.$(el).attr("alt") || "").trim().length > 0).length;
  const ratio = withAlt / imgs.length;
  return mk(def, ratio, `${withAlt} of ${imgs.length} images have alt text.`, {
    title: "Add alt text to images",
    why: "Alt text is often the only way a text-based agent \"sees\" your product photos, and it also supports screen-reader users.",
    how: "Describe what's in each meaningful image in a short factual phrase (\"Navy waterproof trail jacket, front view\"). Leave alt empty only for purely decorative images.",
    effort: "low",
    expert: "content",
  });
};

const useCases: CheckFn = (c) => {
  const def: Def = {
    id: "use-cases",
    category: "intent",
    title: "Who it's for / what it works with is stated explicitly",
    weight: 3,
  };
  const n = (
    c.bodyText.match(
      /\b(best for|ideal for|perfect for|designed for|suitable for|compatible with|works with|made for|built for|great for|not suitable for)\b/gi,
    ) || []
  ).length;
  return mk(def, n >= 2 ? 1 : n === 1 ? 0.6 : 0, `${n} explicit "best for / compatible with" statement(s) found.`, {
    title: "State who it's for and what it's compatible with",
    why: "Assistants match offers to situations (\"for flat feet\", \"works with Next.js 14\"). If you never say, they can't confidently recommend you for it.",
    how: "Add short \"Best for\", \"Not ideal for\" and \"Compatible with\" lines near the top of product and service pages, and echo them in your schema where properties exist.",
    effort: "low",
    expert: "content",
  });
};

/* ───────────────────────── TRUST VALIDATION ───────────────────────── */

const https: CheckFn = (c) => {
  const def: Def = {
    id: "https",
    category: "trust",
    title: "Secure connection (HTTPS + HSTS)",
    weight: 5,
  };
  const secure = c.url.protocol === "https:";
  const hsts = !!c.headers["strict-transport-security"];
  if (!secure)
    return mk(def, 0, "The page is served over plain HTTP.", {
      title: "Serve the whole site over HTTPS",
      why: "Browsers warn on HTTP pages and agents treat them as unsafe for any purchase or data entry.",
      how: "Install a TLS certificate (free via Let's Encrypt or your host), redirect all HTTP to HTTPS, then enable HSTS.",
      effort: "low",
      expert: "technical-seo",
    });
  return hsts
    ? mk(def, 1, "HTTPS with an HSTS header.")
    : mk(def, 0.8, "HTTPS is on, but no Strict-Transport-Security (HSTS) header was found.", {
        title: "Enable HSTS",
        why: "HSTS forces browsers to always use HTTPS, protecting visitors who arrive from an AI recommendation link.",
        how: "Send `Strict-Transport-Security: max-age=31536000; includeSubDomains` from your server or CDN once HTTPS works everywhere.",
        effort: "low",
        expert: "technical-seo",
      });
};

const contact: CheckFn = (c) => {
  const def: Def = {
    id: "contact",
    category: "trust",
    title: "Clear ways to contact a real person",
    weight: 5,
  };
  const ls = links(c);
  const direct = ls.some((l) => l.href.startsWith("tel:") || l.href.startsWith("mailto:"));
  const page = ls.some((l) => /contact|support|help|get-in-touch|reach-us/.test(l.href + " " + l.text));
  const schema = nodesOfType(c.jsonld, ...ORG_TYPES).some((n) => has(n, "contactPoint|telephone|email"));
  const pts = [direct, page, schema].filter(Boolean).length;
  return mk(def, Math.min(1, pts / 2), `Phone/email link: ${direct ? "yes" : "no"}; contact page link: ${page ? "yes" : "no"}; contact info in schema: ${schema ? "yes" : "no"}.`, {
    title: "Make contact details obvious",
    why: "When a person clicks through from an AI recommendation, they look for proof there's a real, reachable business behind the site.",
    how: "Add a phone number or email in the header/footer as tel:/mailto: links, link a Contact page, and add contactPoint to your Organization schema.",
    effort: "low",
    expert: "trust",
  });
};

const POLICY_PATTERNS: Record<string, RegExp> = {
  "returns/refunds": /return|refund|exchange|cancellation/,
  "shipping/delivery": /shipping|delivery|dispatch/,
  privacy: /privacy/,
  terms: /terms|conditions|\btos\b/,
};

const policies: CheckFn = (c) => {
  const def: Def = {
    id: "policies",
    category: "trust",
    title: "Policies are published and linked",
    weight: 6,
  };
  const wanted =
    c.siteType === "ecommerce"
      ? ["returns/refunds", "shipping/delivery", "privacy", "terms"]
      : ["privacy", "terms"];
  const ls = links(c);
  const found = wanted.filter((k) => ls.some((l) => POLICY_PATTERNS[k].test(l.href + " " + l.text)));
  const missing = wanted.filter((k) => !found.includes(k));
  return mk(
    def,
    found.length / wanted.length,
    missing.length ? `No link found for: ${missing.join(", ")}.` : `Links found for: ${found.join(", ")}.`,
    {
      title: "Publish and link your policies",
      why: "Return, shipping and privacy terms are the first things shoppers (and agents acting for them) check before trusting a store.",
      how: `Create clear pages for ${missing.join(", ")} and link them from the footer on every page. Spell out time windows, costs and who to contact.`,
      effort: "low",
      expert: "trust",
    },
  );
};

const identity: CheckFn = (c) => {
  const def: Def = {
    id: "identity",
    category: "trust",
    title: "Business identity: About page and a physical address",
    weight: 4,
  };
  const about = links(c).some((l) => /about|our-story|our story|who-we-are|who we are|team/.test(l.href + " " + l.text));
  const address =
    hasAnyType(c.jsonld, "PostalAddress") ||
    c.$("address").length > 0 ||
    /(address|registered office|headquarters?)\s*[:\-]/i.test(c.bodyText);
  return mk(def, (about ? 0.5 : 0) + (address ? 0.5 : 0), `About page link: ${about ? "yes" : "no"}; address: ${address ? "found" : "not found"}.`, {
    title: "Show who you are and where you operate",
    why: "A named company, an About page and a real address separate legitimate businesses from throwaway stores, for people and for agents that screen sellers.",
    how: "Add an About page (story, team, registration details), and show your business address in the footer using <address> and PostalAddress schema.",
    effort: "low",
    expert: "trust",
  });
};

const REVIEW_HOSTS =
  /trustpilot|yotpo|judge\.me|judgeme|stamped\.io|loox|okendo|reviews\.io|bazaarvoice|g2\.com|capterra|google\.com\/maps|growave|ali-reviews/i;

const reviews: CheckFn = (c) => {
  const def: Def = {
    id: "reviews",
    category: "trust",
    title: "Verifiable customer reviews / social proof",
    weight: 5,
  };
  const schema = hasAnyType(c.jsonld, "AggregateRating", "Review");
  const widget = REVIEW_HOSTS.test(c.html);
  const text = /testimonial|customer reviews?|verified (buyer|purchase|review)|rated \d|\d(\.\d)? ?(out of|\/) ?5/i.test(c.bodyText);
  const ratio = Math.min(1, (schema ? 0.5 : 0) + (widget ? 0.5 : 0) + (text ? 0.3 : 0));
  return mk(def, ratio, `Review schema: ${schema ? "yes" : "no"}; third-party review widget: ${widget ? "yes" : "no"}; visible testimonials/ratings: ${text ? "yes" : "no"}.`, {
    title: "Show verified reviews from a third-party platform",
    why: "Visitors arriving from an AI answer want fast proof that real customers are satisfied. Third-party verified reviews are far more credible than self-written testimonials.",
    how: "Connect a review platform (Trustpilot, Judge.me, Yotpo, Google reviews), display dated reviews on product pages, and let the platform output AggregateRating schema. Only mark up reviews that are genuinely visible on the page.",
    effort: "medium",
    expert: "trust",
  });
};

const social: CheckFn = (c) => {
  const def: Def = {
    id: "social",
    category: "trust",
    title: "Active social profiles are linked",
    weight: 3,
  };
  const hosts = new Set<string>();
  for (const l of links(c)) {
    const m = l.href.match(/(facebook|instagram|twitter|x|linkedin|youtube|pinterest|tiktok|github)\.com/);
    if (m) hosts.add(m[1]);
  }
  const n = hosts.size;
  return mk(def, n >= 3 ? 1 : n === 2 ? 0.7 : n === 1 ? 0.4 : 0, `${n} social profile link(s) found${n ? `: ${[...hosts].join(", ")}` : ""}.`, {
    title: "Link your official social profiles",
    why: "Linked, active profiles help people (and entity-resolution systems) confirm that your brand is real and consistent across the web.",
    how: "Link at least three official profiles from the footer and list them in Organization schema under sameAs.",
    effort: "low",
    expert: "trust",
  });
};

const POPUP_VENDORS = /privy|optinmonster|sumo\.com|justuno|wisepops|popupsmart|convertflow|poptin|mailmunch|optimonk|picreel/i;

const intrusive: CheckFn = (c) => {
  const def: Def = {
    id: "intrusive",
    category: "trust",
    title: "No intrusive pop-ups or fake-urgency timers",
    weight: 3,
  };
  const vendor = POPUP_VENDORS.test(c.html);
  const timer =
    c.$('[class*="countdown" i], [id*="countdown" i], [class*="timer" i]').length > 0 ||
    /(hurry|only \d+ left|ends in \d|limited time offer|offer ends)/i.test(c.bodyText);
  const n = (vendor ? 1 : 0) + (timer ? 1 : 0);
  return mk(def, n === 0 ? 1 : n === 1 ? 0.6 : 0.3, n ? `Signals found: ${[vendor && "pop-up/lead-capture script", timer && "countdown or urgency wording"].filter(Boolean).join(", ")} (heuristic, from raw HTML only).` : "No pop-up vendors or countdown timers detected in the raw HTML.", {
    title: "Remove aggressive pop-ups and fake countdowns",
    why: "Visitors who click through from an AI recommendation are checking whether you're legitimate. Forced newsletter modals and fake timers are classic low-trust signals.",
    how: "Delay or remove entry pop-ups, and only show urgency (stock, deadlines) when it's real and verifiable.",
    effort: "low",
    expert: "trust",
  });
};

const speed: CheckFn = (c) => {
  const def: Def = {
    id: "speed",
    category: "trust",
    title: "Fast server response and lean HTML",
    weight: 4,
  };
  const t = c.ttfbMs;
  const base = t < 600 ? 1 : t < 1200 ? 0.6 : t < 2500 ? 0.3 : 0;
  const heavy = c.htmlBytes > 1_000_000;
  return mk(def, base * (heavy ? 0.6 : 1), `Server responded in ${t} ms; HTML is ${(c.htmlBytes / 1024).toFixed(0)} KB (a proxy for speed, not a full Lighthouse run).`, {
    title: "Speed up the server response",
    why: "Slow pages are abandoned by people and may be skipped or timed out by agents fetching in real time.",
    how: "Use a CDN and page caching, trim render-blocking plugins and apps, and keep HTML under ~500 KB. Aim for a server response under 600 ms.",
    effort: "medium",
    expert: "technical-seo",
  });
};

/* ───────────────────────── TRANSACTION READINESS ───────────────────────── */

const catalog: CheckFn = (c) => {
  const eco = c.siteType === "ecommerce";
  const def: Def = {
    id: "catalog",
    category: "transaction",
    title: eco
      ? "Catalog is exposed as machine-readable data"
      : "Machine-readable feed or API description is available",
    weight: eco ? 6 : 4,
  };
  const kind = c.probes.catalog.kind;
  const feed = c.$('link[rel="alternate"][type*="rss"], link[rel="alternate"][type*="atom"]').length > 0;
  const label = { shopify: "Shopify /products.json", woocommerce: "WooCommerce Store API", openapi: "OpenAPI description" }[kind ?? "openapi"];
  const ratio = kind ? 1 : feed ? 0.5 : 0;
  return mk(
    def,
    ratio,
    kind
      ? `${label} is publicly available.`
      : feed
        ? "An RSS/Atom feed is advertised, but no catalog or API description was found."
        : `No public catalog endpoint or ${eco ? "feed" : "API description"} found.${eco ? " Note: a Merchant Center feed can't be verified from outside; confirm yours is live." : ""}`,
    eco
      ? {
          title: "Publish your catalog in standard feed formats",
          why: "Agent ecosystems pull price and stock from feeds rather than scraping pages. A fresh, accurate feed is the most dependable way to appear in shopping answers.",
          how: "Set up and keep live a Google Merchant Center feed (and Microsoft Merchant Center if relevant) with price, availability, GTIN/brand and images. Confirm it syncs on every price or stock change, and match the data to your on-page values.",
          effort: "medium",
          expert: "feeds",
        }
      : {
          title: "Publish a feed or API description agents can use",
          why: "If agents can discover what you offer through a feed or an OpenAPI file, they can integrate with you instead of guessing from page text.",
          how: "Expose an RSS/Atom feed for content and an OpenAPI description (/openapi.json) for any public API.",
          effort: "medium",
          expert: "feeds",
        },
  );
};

const WALLETS: Record<string, RegExp> = {
  "Apple Pay": /apple[ -]?pay|applepay/i,
  "Google Pay": /google[ -]?pay|googlepay|gpay/i,
  "Shop Pay": /shop[ -]?pay|shopify-payment-button/i,
  PayPal: /paypal/i,
  "Amazon Pay": /amazon[ -]?pay/i,
  UPI: /\bupi\b|phonepe|paytm|gpay/i,
};
const PROCESSORS = /stripe|razorpay|cashfree|payu|braintree|adyen|checkout\.com|klarna|afterpay/i;

const wallets: CheckFn = (c) => {
  if (c.siteType !== "ecommerce") return null;
  const def: Def = {
    id: "wallets",
    category: "transaction",
    title: "One-tap wallets and local payment methods",
    weight: 6,
  };
  const found = Object.entries(WALLETS).filter(([, re]) => re.test(c.html)).map(([k]) => k);
  const processor = PROCESSORS.test(c.html);
  const ratio = found.length >= 2 ? 1 : found.length === 1 ? 0.6 : processor ? 0.4 : 0;
  return mk(
    def,
    ratio,
    found.length
      ? `Detected: ${found.join(", ")}.`
      : processor
        ? "A payment processor was detected, but no one-tap wallets on this page. They may only appear at checkout."
        : "No wallet or payment-method signals found on this page. They may only appear at checkout.",
    {
      title: "Offer one-tap wallet payments",
      why: "Every extra form field loses buyers. Wallets (Apple Pay, Google Pay, Shop Pay, and UPI in India) cut checkout to seconds, which matters when someone arrives ready to buy from an AI recommendation.",
      how: "Enable Apple Pay, Google Pay and your region's fast methods (UPI / Razorpay / PayPal) in your payment provider, and show the express checkout buttons on product and cart pages.",
      effort: "medium",
      expert: "payments",
    },
  );
};

const cta: CheckFn = (c) => {
  const $ = c.$;
  const eco = c.siteType === "ecommerce";
  const def: Def = {
    id: "cta",
    category: "transaction",
    title: eco ? "Buying path is visible in the HTML" : "Clear next step (book, buy, sign up, contact)",
    weight: 6,
  };
  const clickable = $("button, input[type=submit], a")
    .toArray()
    .map((el) => ($(el).text() + " " + ($(el).attr("value") || "")).toLowerCase())
    .join(" | ");
  if (eco && c.pageKind === "product") {
    const buy = /add to (cart|bag|basket)|buy (it )?now|order now|buy now/.test(clickable) || $('form[action*="cart"]').length > 0;
    return mk(def, buy ? 1 : 0, buy ? "An add-to-cart / buy button is in the raw HTML." : "No add-to-cart or buy button found in the raw HTML. It may be rendered only by JavaScript.", {
      title: "Make the add-to-cart path visible and simple",
      why: "Agents that act for a shopper (or humans on mobile) need an obvious, working buy action. A button hidden behind scripts can't be used by many agents.",
      how: "Render the add-to-cart form server-side with a real <form> and <button>, keep it above the fold, and avoid requiring an account before checkout.",
      effort: "medium",
      expert: "rendering",
    });
  }
  const strong = /(book|schedule|reserve).*(demo|call|appointment|table|now)|get started|sign up|start (your )?(free )?trial|get a quote|request (a )?(quote|demo)|order (online|now)|buy now|shop now|add to (cart|bag)|call now/.test(clickable);
  const weak = $("form").length > 0 || $('a[href^="tel:"]').length > 0 || /contact/.test(clickable);
  return mk(def, strong ? 1 : weak ? 0.6 : 0, strong ? "A clear call-to-action was found." : weak ? "Only a generic contact path (form / phone) was found, with no clear primary action." : "No clear call-to-action found in the raw HTML.", {
    title: "Add one clear primary action",
    why: "After an AI recommendation, people want a single obvious next step. Ambiguity ends the journey.",
    how: "Add one primary button (\"Book a demo\", \"Get a quote\", \"Shop now\") above the fold and repeat it after key sections. Make sure it is a real link or form, not script-only.",
    effort: "low",
    expert: "content",
  });
};

const ucp: CheckFn = (c) => {
  if (c.siteType !== "ecommerce") return null;
  const def: Def = {
    id: "ucp",
    category: "transaction",
    title: "Agentic commerce manifest (UCP) published (emerging)",
    weight: 3,
  };
  return c.probes.ucp
    ? mk(def, 1, "/.well-known/ucp manifest found.")
    : mk(def, 0, "No /.well-known/ucp manifest found. Universal Commerce Protocol is new and still rolling out.", {
        title: "Check your platform's support for the Universal Commerce Protocol",
        why: "UCP, developed by Google with partners including Shopify, lets AI agents discover a merchant's capabilities and check out directly. Early support is a differentiator, but it's new.",
        how: "Check whether your commerce platform offers UCP before building anything custom. If you run a custom stack, publish a manifest at /.well-known/ucp following the spec at ucp.dev.",
        effort: "high",
        expert: "feeds",
      });
};

export const ALL_CHECKS: CheckFn[] = [
  jsonld, entitySchema, schemaComplete, rawContent, keyFacts, aiCrawlers, sitemap, metadata, llms,
  faq, specs, headings, specificity, altText, useCases,
  https, contact, policies, identity, reviews, social, intrusive, speed,
  catalog, wallets, cta, ucp,
];
