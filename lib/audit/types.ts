export type Status = "pass" | "warn" | "fail";
export type CategoryId = "machine" | "intent" | "trust" | "transaction";
export type Priority = "high" | "medium" | "low";
export type Effort = "low" | "medium" | "high";
export type SiteType = "ecommerce" | "saas" | "local" | "content" | "general";

/** Used to route a recommendation to the right kind of expert. */
export type ExpertSkill =
  | "schema"
  | "rendering"
  | "content"
  | "trust"
  | "feeds"
  | "payments"
  | "technical-seo";

export interface Recommendation {
  id: string;
  checkId: string;
  category: CategoryId;
  title: string;
  why: string;
  how: string;
  priority: Priority;
  effort: Effort;
  /** Points this fix is worth on the 0-100 overall scale (approximate). */
  pointsGain: number;
  expert: ExpertSkill;
}

export interface CheckResult {
  id: string;
  category: CategoryId;
  title: string;
  status: Status;
  weight: number;
  earned: number;
  detail: string;
}

export interface CategoryScore {
  id: CategoryId;
  label: string;
  tagline: string;
  score: number;
  checks: CheckResult[];
}

export interface AuditReport {
  /** Set when the report has been saved and can be shared at /r/<id>. */
  id?: string;
  url: string;
  finalUrl: string;
  fetchedAt: string;
  siteType: SiteType;
  siteTypeDetected: boolean;
  pageKind: "product" | "other";
  overall: number;
  /** Approximate score if every recommendation were implemented. */
  potential: number;
  grade: { label: string; summary: string };
  categories: CategoryScore[];
  recommendations: Recommendation[];
  meta: {
    title: string;
    ttfbMs: number;
    htmlBytes: number;
    wordCount: number;
  };
  limitations: string[];
}

export const CATEGORY_META: Record<
  CategoryId,
  { label: string; tagline: string; weight: number }
> = {
  machine: {
    label: "Machine readiness",
    tagline: "Can agents read your data without guessing?",
    weight: 0.35,
  },
  intent: {
    label: "Intent & use-case clarity",
    tagline: "Can agents tell who your offer is for?",
    weight: 0.25,
  },
  trust: {
    label: "Trust validation",
    tagline: "Will a human who clicks through believe you?",
    weight: 0.25,
  },
  transaction: {
    label: "Transaction readiness",
    tagline: "Can someone (or something) act on it quickly?",
    weight: 0.15,
  },
};
