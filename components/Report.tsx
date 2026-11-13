import type { AuditReport, Status } from "@/lib/audit/types";
import { EXPERTS_ENABLED } from "@/lib/features";
import WeightBar, { toneFor } from "./WeightBar";

const EFFORT_LABEL = { low: "Quick fix", medium: "Some work", high: "Bigger project" } as const;
const IMPACT_LABEL = { high: "High impact", medium: "Medium impact", low: "Low impact" } as const;
const SITE_LABEL = {
  ecommerce: "Online store",
  saas: "Software / SaaS",
  local: "Local business",
  content: "Content site",
  general: "General site",
} as const;

function StatusIcon({ status }: { status: Status }) {
  const label = status === "pass" ? "Passed" : status === "warn" ? "Needs attention" : "Failed";
  return (
    <span className={`st st--${status}`} role="img" aria-label={label}>
      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
        {status === "pass" && <path d="M2.5 7.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
        {status === "warn" && <path d="M7 2.5v6M7 11.5v.01" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />}
        {status === "fail" && <path d="M3 3l8 8M11 3l-8 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />}
      </svg>
    </span>
  );
}

export default function Report({
  report,
  selected,
  onToggle,
}: {
  report: AuditReport;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}) {
  const pickable = EXPERTS_ENABLED && !!selected && !!onToggle;
  const toImprove = report.categories.flatMap((c) => c.checks).filter((c) => c.status !== "pass").length;
  const catName = Object.fromEntries(report.categories.map((c) => [c.id, c.label]));

  return (
    <section className="report" aria-label="Audit report">
      <header className="scorehead">
        <div className="scorehead__num" role="img" aria-label={`Overall score ${report.overall} out of 100`}>
          <span className="scorehead__score" aria-hidden="true">{report.overall}</span>
          <span className="scorehead__of" aria-hidden="true">/100</span>
        </div>
        <div className="scorehead__text">
          <h2>{report.grade.label}</h2>
          <p>{report.grade.summary}</p>
          {report.recommendations.length > 0 && (
            <p className="scorehead__potential">
              Doing every fix below could lift this to about <strong>{report.potential}</strong>.
            </p>
          )}
        </div>
      </header>

      <div className="scoremeta">
        <span className="chip chip--url">{report.finalUrl}</span>
        <span className="chip">
          {SITE_LABEL[report.siteType]}
          {report.siteTypeDetected ? ", auto-detected" : ""}
        </span>
        {report.pageKind === "product" && <span className="chip">Product page</span>}
        <span className="chip">
          {toImprove} thing{toImprove === 1 ? "" : "s"} to improve
        </span>
      </div>

      <WeightBar tall parts={report.categories.map((c) => ({ id: c.id, score: c.score }))} />
      <ul className="catlist">
        {report.categories.map((c) => (
          <li key={c.id} className="cat">
            <div className="cat__row">
              <span className="cat__name">{c.label}</span>
              <span className="cat__score" data-tone={toneFor(c.score)}>{c.score}</span>
            </div>
            <div className="cat__meta">{c.tagline}</div>
          </li>
        ))}
      </ul>

      <div className="block">
        <h2 className="block__title">What to fix, quickest wins first</h2>
        <p className="block__lead">
          Ranked by points gained for the effort involved. Do them in this order.
          {pickable ? " Tick the ones you'd like an expert to implement." : ""}
        </p>

        {report.recommendations.length === 0 ? (
          <div className="notice notice--ok allgood">Nothing major to fix. This page is in great shape.</div>
        ) : (
          <ol className="fixes">
            {report.recommendations.map((r, i) => (
              <li key={r.id}>
                <details className="fix" data-impact={r.priority} open={i < 3}>
                  <summary className="fix__sum">
                    <span className="fix__rank" aria-hidden="true">{i + 1}</span>
                    <span>
                      <span className="fix__title">{r.title}</span>
                      <span className="fix__tags" style={{ display: "flex" }}>
                        <span className={`tag tag--${r.priority}`}>{IMPACT_LABEL[r.priority]}</span>
                        <span className="tag">{EFFORT_LABEL[r.effort]}</span>
                        <span className="tag">{catName[r.category]}</span>
                      </span>
                    </span>
                    <span className="fix__gain">
                      +{r.pointsGain} pts
                      <span className="fix__chev" aria-hidden="true" />
                    </span>
                  </summary>
                  <div className="fix__body">
                    <p>
                      <strong>Why it matters.</strong> {r.why}
                    </p>
                    <p>
                      <strong>How to fix it.</strong> {r.how}
                    </p>
                    {pickable && (
                      <label className="fix__check">
                        <input type="checkbox" checked={selected!.has(r.id)} onChange={() => onToggle!(r.id)} />
                        Include in my expert request
                      </label>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="block">
        <h2 className="block__title">Every check we ran</h2>
        <p className="block__lead">What we looked for and what we found, grouped by layer.</p>
        <div className="results">
          {report.categories.map((c) => (
            <details key={c.id} className="rgroup">
              <summary>
                <span>{c.label}</span>
                <span className="rgroup__score">
                  <span className="cat__score" data-tone={toneFor(c.score)} style={{ fontSize: "1.1rem" }}>{c.score}/100</span>
                  <span className="fix__chev" aria-hidden="true" />
                </span>
              </summary>
              <ul className="checks">
                {c.checks.map((k) => (
                  <li key={k.id} className="check">
                    <StatusIcon status={k.status} />
                    <div>
                      <div className="check__title">{k.title}</div>
                      <div className="check__detail">{k.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>

      <div className="block">
        <h2 className="block__title">About this audit</h2>
        <ul className="limits">
          {report.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
