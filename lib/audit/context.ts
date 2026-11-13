import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { IncomingHttpHeaders } from "node:http";
import type { ParsedRobots } from "./robots";
import type { SiteType } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export interface JsonLdInfo {
  blocks: number;
  parseErrors: number;
  /** every object that has an @type, anywhere in any block */
  nodes: Json[];
  types: Set<string>;
}

export interface Probes {
  robots: { found: boolean; text: string; parsed: ParsedRobots | null };
  sitemap: { found: boolean; url?: string };
  llms: boolean;
  ucp: boolean;
  catalog: { kind: "shopify" | "woocommerce" | "openapi" | null };
}

export interface Ctx {
  url: URL;
  html: string;
  $: CheerioAPI;
  headers: IncomingHttpHeaders;
  ttfbMs: number;
  htmlBytes: number;
  jsonld: JsonLdInfo;
  bodyText: string;
  wordCount: number;
  siteType: SiteType;
  pageKind: "product" | "other";
  probes: Probes;
}

export function typeName(t: unknown): string[] {
  const arr = Array.isArray(t) ? t : [t];
  return arr
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/^https?:\/\/schema\.org\//, ""));
}

export function parseJsonLd($: CheerioAPI): JsonLdInfo {
  const info: JsonLdInfo = { blocks: 0, parseErrors: 0, nodes: [], types: new Set() };

  const walk = (v: Json) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      if (v["@type"]) {
        info.nodes.push(v);
        typeName(v["@type"]).forEach((t) => info.types.add(t));
      }
      Object.values(v).forEach(walk);
    }
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    info.blocks++;
    const raw = $(el).contents().text().trim();
    if (!raw) {
      info.parseErrors++;
      return;
    }
    try {
      walk(JSON.parse(raw));
    } catch {
      info.parseErrors++;
    }
  });
  return info;
}

export function nodesOfType(info: JsonLdInfo, ...names: string[]): Json[] {
  const want = new Set(names);
  return info.nodes.filter((n) => typeName(n["@type"]).some((t) => want.has(t)));
}

export function hasAnyType(info: JsonLdInfo, ...names: string[]): boolean {
  return names.some((n) => info.types.has(n));
}

export function extractBodyText($: CheerioAPI): string {
  const $body = $("body").clone();
  $body.find("script,style,noscript,svg,template,iframe").remove();
  return $body.text().replace(/\s+/g, " ").trim();
}

export const LOCAL_TYPES = [
  "LocalBusiness", "Restaurant", "Store", "Dentist", "MedicalBusiness", "MedicalClinic",
  "HealthAndBeautyBusiness", "BeautySalon", "HairSalon", "LodgingBusiness", "Hotel",
  "AutoRepair", "AutoDealer", "RealEstateAgent", "LegalService", "FoodEstablishment",
  "CafeOrCoffeeShop", "HomeAndConstructionBusiness", "Physician", "Gym", "SportsActivityLocation",
];

export function isProductPage($: CheerioAPI, url: URL, info: JsonLdInfo, text: string): boolean {
  if (hasAnyType(info, "Product", "ProductGroup", "IndividualProduct")) return true;
  if ($('meta[property="og:type"]').attr("content")?.toLowerCase().includes("product")) return true;
  if (/\/(products?|p|item|items|dp|shop)\/[^/]+/i.test(url.pathname)) return true;
  const hasAddToCart = /add to (cart|bag|basket)|buy (it )?now/i.test(text);
  const hasPrice = /(?:₹|rs\.?|inr|\$|€|£)\s?\d[\d,.]*/i.test(text);
  return hasAddToCart && hasPrice;
}

export function detectSiteType(
  $: CheerioAPI,
  url: URL,
  info: JsonLdInfo,
  text: string,
  html: string,
): SiteType {
  const lower = text.toLowerCase();
  const generator = ($('meta[name="generator"]').attr("content") || "").toLowerCase();

  const ecommerce =
    hasAnyType(info, "Product", "ProductGroup", "OnlineStore", "Offer", "AggregateOffer") ||
    /shopify|woocommerce|magento|bigcommerce|prestashop/.test(generator) ||
    /cdn\.shopify\.com|woocommerce|\/wp-content\/plugins\/woocommerce/i.test(html) ||
    /add to (cart|bag|basket)|buy it now|view cart|shopping cart/.test(lower) ||
    /\/(products?|collections?|shop)\//i.test(url.pathname);
  if (ecommerce) return "ecommerce";

  if (LOCAL_TYPES.some((t) => info.types.has(t))) return "local";

  const saasSignals = [
    /free trial|start (your )?free|book a demo|request a demo|get started|sign up free/,
    /\bapi\b|integrations?|\bsdk\b|dashboard|per user|per month|\/month/,
    /pricing|plans/,
  ].filter((re) => re.test(lower)).length;
  if (hasAnyType(info, "SoftwareApplication", "WebApplication") || saasSignals >= 2) return "saas";

  if (hasAnyType(info, "Article", "BlogPosting", "NewsArticle", "Blog")) return "content";
  return "general";
}

export function buildCtx(
  url: URL,
  html: string,
  headers: IncomingHttpHeaders,
  ttfbMs: number,
  htmlBytes: number,
  probes: Probes,
  siteType: SiteType,
): Ctx {
  const $ = cheerio.load(html);
  const jsonld = parseJsonLd($);
  const bodyText = extractBodyText($);
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;
  return {
    url,
    html,
    $,
    headers,
    ttfbMs,
    htmlBytes,
    jsonld,
    bodyText,
    wordCount,
    siteType,
    pageKind: isProductPage($, url, jsonld, bodyText) ? "product" : "other",
    probes,
  };
}
