import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import zlib from "node:zlib";

/**
 * SSRF-safe page fetcher.
 *
 * Because users submit arbitrary URLs, we must never let the server be tricked
 * into calling internal services (localhost, cloud metadata, private ranges).
 * Protections:
 *  - only http/https, only ports 80/443, no credentials in the URL
 *  - every hop of a redirect chain is re-validated
 *  - DNS is resolved by a custom `lookup` that rejects private/reserved
 *    addresses at connect time (so DNS rebinding cannot slip through)
 *  - response size and total time are capped
 *
 * Set AUDIT_ALLOW_PRIVATE=1 ONLY for local development / tests.
 */

const ALLOW_PRIVATE = process.env.AUDIT_ALLOW_PRIVATE === "1";
// Site owners see this in their logs. Set AUDIT_BOT_CONTACT to a real email or URL.
const USER_AGENT = `AgentReadyAuditBot/0.1 (website readiness audit; contact: ${
  process.env.AUDIT_BOT_CONTACT || "set AUDIT_BOT_CONTACT"
})`;

export class FetchError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export interface FetchResult {
  finalUrl: URL;
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  bytes: number;
  truncated: boolean;
  ttfbMs: number;
  redirects: string[];
}

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::" || l === "::1") return true;
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    const mappedHex = l.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return (
      l.startsWith("fc") ||
      l.startsWith("fd") ||
      l.startsWith("fe8") ||
      l.startsWith("fe9") ||
      l.startsWith("fea") ||
      l.startsWith("feb") ||
      l.startsWith("ff")
    );
  }
  return true; // not an IP we understand: treat as unsafe
}

export function normalizeUrl(input: string): URL {
  let raw = (input || "").trim();
  if (!raw) throw new FetchError("Please enter a website address.", "invalid");
  if (raw.length > 2048) throw new FetchError("That address is too long.", "invalid");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = "https://" + raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError("That doesn't look like a valid website address.", "invalid");
  }
  validateUrl(url);
  url.hash = "";
  return url;
}

function validateUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchError("Only http and https addresses can be audited.", "invalid");
  }
  if (url.username || url.password) {
    throw new FetchError("Addresses with credentials are not allowed.", "invalid");
  }
  if (url.port && url.port !== "80" && url.port !== "443" && !ALLOW_PRIVATE) {
    throw new FetchError("Only standard web ports (80/443) can be audited.", "invalid");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!ALLOW_PRIVATE) {
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
      throw new FetchError("That address is not publicly reachable.", "blocked");
    }
    if (net.isIP(host) && isPrivateAddress(host)) {
      throw new FetchError("That address is not publicly reachable.", "blocked");
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeLookup(hostname: string, options: any, cb: any): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const list = addrs as unknown as dns.LookupAddress[];
    if (!list.length) return cb(new FetchError("Could not resolve that host.", "dns"));
    if (!ALLOW_PRIVATE && list.some((a) => isPrivateAddress(a.address))) {
      return cb(new FetchError("That address is not publicly reachable.", "blocked"));
    }
    if (options && options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

interface Hop {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  truncated: boolean;
  ttfbMs: number;
}

function requestOnce(url: URL, timeoutMs: number, maxBytes: number): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const started = Date.now();
    let settled = false;
    let ttfbMs = 0;
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    let status = 0;
    let headers: http.IncomingHttpHeaders = {};

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) return reject(err);
      resolve({ status, headers, body: Buffer.concat(chunks), truncated, ttfbMs });
    };

    const req = mod.request(
      url,
      {
        method: "GET",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lookup: safeLookup as any,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "en",
        },
      },
      (res) => {
        ttfbMs = Date.now() - started;
        status = res.statusCode ?? 0;
        headers = res.headers;

        // Redirects: we only need the headers.
        if (status >= 300 && status < 400) {
          res.resume();
          return finish();
        }

        const enc = String(res.headers["content-encoding"] || "").toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (enc === "gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());

        stream.on("data", (c: Buffer) => {
          if (settled) return;
          size += c.length;
          if (size > maxBytes) {
            truncated = true;
            req.destroy();
            return finish();
          }
          chunks.push(c);
        });
        stream.on("end", () => finish());
        stream.on("error", (e) => (truncated ? finish() : finish(e as Error)));
      },
    );

    const timer = setTimeout(() => {
      req.destroy();
      finish(new FetchError("The site took too long to respond.", "timeout"));
    }, timeoutMs);

    req.on("error", (e) => {
      if (e instanceof FetchError) return finish(e);
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
        return finish(new FetchError("We couldn't find that website. Check the address.", "dns"));
      }
      if (code === "ECONNREFUSED" || code === "ECONNRESET") {
        return finish(new FetchError("The site refused the connection.", "connect"));
      }
      if (truncated) return finish();
      finish(new FetchError(`Could not reach the site (${code || e.message}).`, "network"));
    });
    req.end();
  });
}

export async function fetchPage(rawUrl: string | URL, opts: FetchOptions = {}): Promise<FetchResult> {
  const timeoutMs = opts.timeoutMs ?? 12000;
  const maxBytes = opts.maxBytes ?? 2_500_000;
  const maxRedirects = opts.maxRedirects ?? 5;

  let url = typeof rawUrl === "string" ? normalizeUrl(rawUrl) : rawUrl;
  const redirects: string[] = [];

  for (let hop = 0; hop <= maxRedirects; hop++) {
    validateUrl(url);
    const r = await requestOnce(url, timeoutMs, maxBytes);
    const loc = r.headers.location;
    if (r.status >= 300 && r.status < 400 && loc) {
      let next: URL;
      try {
        next = new URL(loc, url);
      } catch {
        throw new FetchError("The site sent an invalid redirect.", "redirect");
      }
      redirects.push(next.toString());
      url = next;
      continue;
    }
    return {
      finalUrl: url,
      status: r.status,
      headers: r.headers,
      body: new TextDecoder("utf-8").decode(r.body),
      bytes: r.body.length,
      truncated: r.truncated,
      ttfbMs: r.ttfbMs,
      redirects,
    };
  }
  throw new FetchError("The site redirected too many times.", "redirect");
}
