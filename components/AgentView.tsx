type Kind = "plain" | "found" | "missing";

const SAMPLE: { text: string; kind: Kind }[] = [
  { text: "<title>TrailRunner Pro | Stride Co</title>", kind: "plain" },
  { text: "<h1>TrailRunner Pro Waterproof Shoe</h1>", kind: "plain" },
  { text: '"@type": "Product"', kind: "found" },
  { text: '"price": "6499", "priceCurrency": "INR"', kind: "found" },
  { text: "availability: not in the HTML", kind: "missing" },
  { text: '<a href="/policies/returns">Returns</a>', kind: "found" },
  { text: "reviews: load after JavaScript runs", kind: "missing" },
  { text: '<button>Add to cart</button>', kind: "found" },
];

export const STEPS = [
  "Fetching the page",
  "Reading structured data",
  "Checking robots.txt and sitemap",
  "Looking for trust signals",
  "Checking how people can buy",
  "Scoring and ranking fixes",
];

const Tick = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M2.5 7.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Gap = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 3l8 8M11 3l-8 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

export default function AgentView({ loading, step }: { loading: boolean; step: number }) {
  return (
    <figure className="agentview">
      <figcaption className="agentview__head">
        <div className="agentview__title">{loading ? "Reading your site" : "What an agent reads"}</div>
        <div className="agentview__sub">
          {loading ? "This takes about 10 seconds." : "Example: the raw HTML of a product page"}
        </div>
      </figcaption>

      <div className="agentview__body" aria-live="polite">
        {loading
          ? STEPS.map((label, i) => {
              const state = i < step ? "done" : i === step ? "active" : "todo";
              return (
                <div key={label} className="av-line av-step" data-state={state}>
                  <span className="av-line__n">{i + 1}</span>
                  <span className="av-line__t">{label}</span>
                  <span className="av-line__s">
                    {state === "done" ? <Tick /> : state === "active" ? <span className="spin" aria-hidden="true" /> : null}
                    <span className="sr-only">{state === "done" ? "done" : state === "active" ? "in progress" : ""}</span>
                  </span>
                </div>
              );
            })
          : SAMPLE.map((l, i) => (
              <div key={i} className={`av-line av-line--${l.kind}`}>
                <span className="av-line__n">{i + 1}</span>
                <span className="av-line__t">{l.text}</span>
                <span className="av-line__s">
                  {l.kind === "found" && <Tick />}
                  {l.kind === "missing" && <Gap />}
                  <span className="sr-only">{l.kind === "found" ? "usable fact" : l.kind === "missing" ? "missing" : ""}</span>
                </span>
              </div>
            ))}
      </div>

      {!loading && (
        <div className="agentview__foot">
          Highlighted lines are facts an agent can use. Dashed lines are facts it can&apos;t find.
        </div>
      )}
    </figure>
  );
}
