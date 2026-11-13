import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Logo from "@/components/Logo";
import Report from "@/components/Report";
import { getReport } from "@/lib/store";

// Reports are read from storage per request, never prerendered at build time.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) return { title: "Report not found" };
  const host = new URL(report.finalUrl).hostname;
  const title = `${host} scores ${report.overall}/100 for AI agent readiness`;
  return {
    title,
    description: `${report.grade.label}. See what AI shopping agents can and can't read on ${host}, with a fix list.`,
    openGraph: { title, type: "article" },
    // Reports describe other people's sites; keep them out of search results.
    robots: { index: false, follow: false },
  };
}

export default async function SharedReport({ params }: Props) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) notFound();
  const host = new URL(report.finalUrl).hostname;

  return (
    <>
      <header className="site-header">
        <div className="wrap">
          <Logo />
          <span className="site-header__note">Shared report</span>
        </div>
      </header>

      <main id="main" className="wrap wrap--narrow">
        <div className="pagehead">
          <h1>{host}</h1>
          <p>
            Audited{" "}
            {new Date(report.fetchedAt).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            })}{" "}
            IST. Sites change, so audit again after making fixes.
          </p>
        </div>

        <Report report={report} />

        <div className="reportcta">
          <p>See how your own site scores.</p>
          <Link href="/" className="btn">Audit my site</Link>
          <Link href={`/?url=${encodeURIComponent(report.finalUrl)}`} className="btn btn--quiet">
            Audit this site again
          </Link>
        </div>
      </main>

      <footer className="footer">
        <div className="wrap">
          A score shows how ready a page is, not a promise that AI assistants will recommend it.
        </div>
      </footer>
    </>
  );
}
