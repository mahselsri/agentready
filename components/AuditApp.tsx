"use client";

import { useEffect, useRef, useState } from "react";
import type { AuditReport } from "@/lib/audit/types";
import Report from "./Report";
import LeadForm from "./LeadForm";
import ShareLink from "./ShareLink";
import AgentView, { STEPS } from "./AgentView";
import { EXPERTS_ENABLED } from "@/lib/features";

const SITE_TYPES = [
  { value: "auto", label: "Auto-detect" },
  { value: "ecommerce", label: "Online store" },
  { value: "saas", label: "Software / SaaS" },
  { value: "local", label: "Local business" },
  { value: "content", label: "Content / blog" },
  { value: "general", label: "Other" },
];

export default function AuditApp({ children }: { children?: React.ReactNode }) {
  const [url, setUrl] = useState("");
  const [siteType, setSiteType] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const reportRef = useRef<HTMLDivElement>(null);

  // Allow /?url=example.com so a shared report can link back to "audit again".
  useEffect(() => {
    const u = new URLSearchParams(window.location.search).get("url");
    if (u) setUrl(u.slice(0, 2048));
  }, []);

  // The audit is one request, so the steps advance on a timer and hold on the last one.
  useEffect(() => {
    if (!loading) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1600);
    return () => clearInterval(t);
  }, [loading]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, siteType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The audit failed. Check the address and try again.");
      const r = data as AuditReport;
      setReport(r);
      setSelected(new Set(r.recommendations.filter((x) => x.priority !== "low").map((x) => x.id)));
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <section className="hero">
        <div className="wrap hero__grid">
          <div>
            <h1>Can AI agents find, trust and buy from your site?</h1>
            <p className="hero__lead">
              Paste your website address. We read the page the way an AI agent does, score it out of 100, and
              list the fixes with the quickest wins first.
            </p>

            <form className="auditform" onSubmit={onSubmit} noValidate={false}>
              <div className="field">
                <label className="field__label" htmlFor="site-url">Website address</label>
                <div className="auditform__row">
                  <input
                    id="site-url"
                    className="input"
                    type="text"
                    inputMode="url"
                    autoComplete="url"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="yourstore.com/products/an-item"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                  />
                  <button className="btn" type="submit" disabled={loading}>
                    {loading ? "Auditing…" : "Audit this site"}
                  </button>
                </div>
              </div>
              <div className="auditform__opts">
                <div className="field">
                  <label className="field__label" htmlFor="site-type">Site type</label>
                  <select id="site-type" className="select" value={siteType} onChange={(e) => setSiteType(e.target.value)}>
                    {SITE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <p className="auditform__hint">
                  Free, no sign-up. For online stores, paste a product page for the most useful result.
                </p>
              </div>

              {error && (
                <div className="notice notice--error" role="alert">
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                    <circle cx="9" cy="9" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
                    <path d="M9 5v5M9 12.5v.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}
            </form>
          </div>

          <AgentView loading={loading} step={step} />
        </div>
      </section>

      {report && (
        <div className="wrap wrap--narrow" ref={reportRef} id="report" style={{ scrollMarginTop: 16, paddingBottom: 24 }}>
          {report.id && <ShareLink id={report.id} />}
          <Report report={report} selected={selected} onToggle={toggle} />
          {EXPERTS_ENABLED && <LeadForm report={report} selectedIds={[...selected]} />}
        </div>
      )}

      {children}
    </>
  );
}
