import { NextResponse } from "next/server";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { EXPERTS_ENABLED } from "@/lib/features";

export const runtime = "nodejs";

/**
 * Captures "connect me with an expert" requests.
 *
 * MVP storage: append to data/leads.jsonl (works locally and on a VM).
 * Optional: set LEADS_WEBHOOK_URL (Slack/Zapier/Make/CRM) to forward each lead.
 * On serverless hosts (Vercel) the filesystem is read-only, so use the webhook
 * or replace this with a database insert.
 */

interface LeadBody {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  phone?: unknown;
  message?: unknown;
  url?: unknown;
  score?: unknown;
  recommendationIds?: unknown;
  siteType?: unknown;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  if (!EXPERTS_ENABLED) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }
  let b: LeadBody;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = str(b.email, 200);
  const name = str(b.name, 120);
  if (!name) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const ids = Array.isArray(b.recommendationIds)
    ? b.recommendationIds.filter((x): x is string => typeof x === "string").slice(0, 40)
    : [];

  const lead = {
    receivedAt: new Date().toISOString(),
    name,
    email,
    company: str(b.company, 160),
    phone: str(b.phone, 40),
    message: str(b.message, 2000),
    url: str(b.url, 2048),
    siteType: str(b.siteType, 20),
    score: typeof b.score === "number" ? b.score : null,
    recommendationIds: ids,
  };

  let stored = false;
  try {
    const dir = path.join(process.cwd(), "data");
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, "leads.jsonl"), JSON.stringify(lead) + "\n", "utf8");
    stored = true;
  } catch (err) {
    console.error("could not write lead to disk", err);
  }

  const hook = process.env.LEADS_WEBHOOK_URL;
  let forwarded = false;
  if (hook) {
    try {
      const r = await fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(lead),
      });
      forwarded = r.ok;
    } catch (err) {
      console.error("lead webhook failed", err);
    }
  }

  if (!stored && !forwarded) {
    return NextResponse.json(
      { error: "We couldn't save your request. Please try again." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
