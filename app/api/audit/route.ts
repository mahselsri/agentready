import { NextResponse } from "next/server";
import { FetchError, runAudit } from "@/lib/audit";
import type { SiteType } from "@/lib/audit/types";
import { saveReport } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Minimal in-memory rate limit (per IP). Fine for a single instance / MVP.
 * For production on serverless or multiple instances, swap for Redis/Upstash.
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 15;
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return false;
}

const SITE_TYPES = ["auto", "ecommerce", "saas", "local", "content", "general"];

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (limited(ip)) {
    return NextResponse.json(
      { error: "You've run a lot of audits. Please try again in a bit." },
      { status: 429 },
    );
  }

  let body: { url?: unknown; siteType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.url !== "string") {
    return NextResponse.json({ error: "Please enter a website address." }, { status: 400 });
  }
  const siteType =
    typeof body.siteType === "string" && SITE_TYPES.includes(body.siteType)
      ? (body.siteType as SiteType | "auto")
      : "auto";

  try {
    const report = await runAudit({ url: body.url, siteType });
    try {
      const id = await saveReport(report);
      if (id) report.id = id;
    } catch (err) {
      // Saving is best-effort: the person still gets their report, just no share link.
      console.error("could not save report", err);
    }
    return NextResponse.json(report);
  } catch (err) {
    if (err instanceof FetchError) {
      const status = err.code === "invalid" || err.code === "blocked" ? 400 : 422;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error("audit failed", err);
    return NextResponse.json(
      { error: "Something went wrong while auditing that site. Please try again." },
      { status: 500 },
    );
  }
}
