"use client";

import { useState } from "react";
import type { AuditReport } from "@/lib/audit/types";

export default function LeadForm({
  report,
  selectedIds,
}: {
  report: AuditReport;
  selectedIds: string[];
}) {
  const [form, setForm] = useState({ name: "", email: "", company: "", phone: "", message: "" });
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          url: report.finalUrl,
          score: report.overall,
          siteType: report.siteType,
          recommendationIds: selectedIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send your request.");
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="leadform">
        <div className="notice notice--ok">
          Request sent. We&apos;ve passed {selectedIds.length} selected fix{selectedIds.length === 1 ? "" : "es"} to an
          expert, who will email {form.email}.
        </div>
      </div>
    );
  }

  return (
    <form className="leadform" onSubmit={submit}>
      <h2>Get an expert to implement these fixes</h2>
      <p className="block__lead">
        We&apos;ll match you with a specialist for the {selectedIds.length} fix{selectedIds.length === 1 ? "" : "es"} you
        selected and send a scoped quote. No obligation.
      </p>
      <div className="field">
        <label className="field__label" htmlFor="lf-name">Name</label>
        <input className="input" id="lf-name" value={form.name} onChange={set("name")} required maxLength={120} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="lf-email">Work email</label>
        <input className="input" id="lf-email" type="email" value={form.email} onChange={set("email")} required maxLength={200} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="lf-company">Company (optional)</label>
        <input className="input" id="lf-company" value={form.company} onChange={set("company")} maxLength={160} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="lf-phone">Phone or WhatsApp (optional)</label>
        <input className="input" id="lf-phone" value={form.phone} onChange={set("phone")} maxLength={40} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="lf-msg">Anything we should know? (optional)</label>
        <textarea className="textarea input" id="lf-msg" rows={3} value={form.message} onChange={set("message")} maxLength={2000} />
      </div>
      {error && <div className="notice notice--error" role="alert" style={{ marginTop: 14 }}>{error}</div>}
      <div style={{ marginTop: 18 }}>
        <button className="btn" type="submit" disabled={state === "sending" || selectedIds.length === 0}>
          {state === "sending" ? "Sending…" : "Send to an expert"}
        </button>
      </div>
      {selectedIds.length === 0 && <p className="auditform__hint" style={{ marginTop: 10 }}>Tick at least one fix above to continue.</p>}
    </form>
  );
}
