export interface RobotsRule {
  type: "allow" | "disallow";
  path: string;
}
export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}
export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
}

export function parseRobots(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      if (current) current.rules.push({ type: key, path: value });
    } else if (key === "sitemap") {
      lastWasAgent = false;
      if (value) sitemaps.push(value);
    } else {
      lastWasAgent = false;
    }
  }
  return { groups, sitemaps };
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + escaped + (anchored ? "$" : ""));
}

export interface RobotsDecision {
  allowed: boolean;
  /** Whether a group naming this bot exists, or only the wildcard group applied. */
  matched: "specific" | "wildcard" | "none";
}

/** Is `agent` allowed to fetch `path`, per RFC 9309 longest-match semantics? */
export function checkRobots(robots: ParsedRobots, agent: string, path = "/"): RobotsDecision {
  const token = agent.toLowerCase();
  const specific = robots.groups.filter((g) => g.agents.includes(token));
  const wildcard = robots.groups.filter((g) => g.agents.includes("*"));
  const groups = specific.length ? specific : wildcard;
  const matched = specific.length ? "specific" : wildcard.length ? "wildcard" : "none";
  if (!groups.length) return { allowed: true, matched };

  let best: { len: number; type: "allow" | "disallow" } | null = null;
  for (const g of groups) {
    for (const rule of g.rules) {
      if (!rule.path) continue; // empty Disallow means allow everything
      if (!patternToRegex(rule.path).test(path)) continue;
      const len = rule.path.length;
      if (!best || len > best.len || (len === best.len && rule.type === "allow")) {
        best = { len, type: rule.type };
      }
    }
  }
  return { allowed: !best || best.type === "allow", matched };
}
