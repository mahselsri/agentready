import AuditApp from "@/components/AuditApp";
import Logo from "@/components/Logo";
import WeightBar from "@/components/WeightBar";
import { CATEGORY_META } from "@/lib/audit/types";
import type { CategoryId } from "@/lib/audit/types";

const LAYERS: { id: CategoryId; desc: string }[] = [
  {
    id: "machine",
    desc: "Can an agent read the facts without running JavaScript? Structured data, rendered HTML, robots.txt, sitemap.",
  },
  {
    id: "intent",
    desc: "Does the page say who it's for and what it works with? Specs, direct answers, \"best for\" statements.",
  },
  {
    id: "trust",
    desc: "Would a person who clicks through believe you? Reviews, policies, contact details, HTTPS.",
  },
  {
    id: "transaction",
    desc: "Can someone act quickly? A catalog feed, wallets and UPI, a visible buy or contact button.",
  },
];

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="wrap">
          <Logo />
          <span className="site-header__note">Free audit</span>
        </div>
      </header>

      <main id="main">
        <AuditApp>
          <section className="section" aria-labelledby="scored-h">
            <div className="wrap">
              <h2 id="scored-h">Four layers make up your score</h2>
              <p className="section__lead">
                The wider the segment, the more it counts. Your report fills each one in to show how much you earned.
              </p>
              <WeightBar parts={LAYERS.map((l) => ({ id: l.id }))} />
              <ul className="layers">
                {LAYERS.map((l) => (
                  <li key={l.id} className="layer">
                    <div className="layer__name">{CATEGORY_META[l.id].label}</div>
                    <div className="layer__weight">{Math.round(CATEGORY_META[l.id].weight * 100)}% of the score</div>
                    <p className="layer__desc">{l.desc}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </AuditApp>
      </main>

      <footer className="footer">
        <div className="wrap">
          AgentReady reads public pages only. A score shows how ready a page is, not a promise that AI assistants will
          recommend it.
        </div>
      </footer>
    </>
  );
}
