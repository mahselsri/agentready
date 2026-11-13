import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuditReport } from "./audit/types";

/**
 * Report storage. Three modes, chosen automatically:
 *
 *  1. "redis": Upstash Redis over its REST API. Used when UPSTASH_REDIS_REST_URL
 *     and UPSTASH_REDIS_REST_TOKEN are set (or KV_REST_API_URL / KV_REST_API_TOKEN,
 *     which Vercel's Upstash integration creates). Reports expire after 30 days.
 *  2. "disk": JSON files in data/reports/. For local development and servers
 *     with a persistent disk.
 *  3. "none": on Vercel without Redis the filesystem is not persistent, so a
 *     saved report would quickly turn into a broken link. We don't save, and
 *     the UI simply doesn't show a share link.
 */

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const TTL_SECONDS = 60 * 60 * 24 * 30;

export const storageMode: "redis" | "disk" | "none" =
  REST_URL && REST_TOKEN ? "redis" : process.env.VERCEL ? "none" : "disk";

const DIR = path.join(process.cwd(), "data", "reports");
const ID_RE = /^[A-Za-z0-9_-]{8,32}$/;

export const isValidReportId = (id: string) => ID_RE.test(id);

async function redis(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(REST_URL!, {
    method: "POST",
    headers: { authorization: `Bearer ${REST_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis request failed (${res.status})`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(data.error);
  return data.result;
}

let warned = false;

/** Returns the new report id, or null when this deployment can't store reports. */
export async function saveReport(report: AuditReport): Promise<string | null> {
  if (storageMode === "none") {
    if (!warned) {
      warned = true;
      console.warn(
        "Share links are off: add an Upstash Redis database (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) to enable them on Vercel.",
      );
    }
    return null;
  }
  const id = randomBytes(9).toString("base64url"); // 12 URL-safe chars, unguessable
  const json = JSON.stringify({ ...report, id });
  if (storageMode === "redis") {
    await redis(["SET", `report:${id}`, json, "EX", TTL_SECONDS]);
  } else {
    await mkdir(DIR, { recursive: true });
    await writeFile(path.join(DIR, `${id}.json`), json, "utf8");
  }
  return id;
}

export async function getReport(id: string): Promise<AuditReport | null> {
  if (!isValidReportId(id)) return null; // also blocks path traversal
  try {
    if (storageMode === "redis") {
      const raw = await redis(["GET", `report:${id}`]);
      return typeof raw === "string" ? (JSON.parse(raw) as AuditReport) : null;
    }
    if (storageMode === "disk") {
      return JSON.parse(await readFile(path.join(DIR, `${id}.json`), "utf8")) as AuditReport;
    }
    return null;
  } catch {
    return null;
  }
}
