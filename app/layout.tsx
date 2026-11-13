import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque/standard.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

const description =
  "Paste your website address and see how well AI shopping agents can read, trust and buy from it. Free score out of 100 with a fix list.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "AgentReady: can AI agents find, trust and buy from your site?", template: "%s | AgentReady" },
  description,
  openGraph: {
    title: "AgentReady: can AI agents find, trust and buy from your site?",
    description,
    siteName: "AgentReady",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1424" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
