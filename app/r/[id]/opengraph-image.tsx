import { ImageResponse } from "next/og";
import { getReport } from "@/lib/store";
import { CATEGORY_META } from "@/lib/audit/types";

export const runtime = "nodejs";
export const alt = "AgentReady score";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const tone = (s: number) => (s >= 70 ? "#4fd1a0" : s >= 50 ? "#f0b95a" : "#ff8f85");

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getReport(id);
  const host = report ? new URL(report.finalUrl).hostname : "Report not found";
  const total = report ? report.categories.reduce((s, c) => s + CATEGORY_META[c.id].weight, 0) : 1;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b2545",
          color: "#ffffff",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 700 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: "#ffe066", display: "flex" }} />
          AgentReady
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 40 }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <div style={{ fontSize: 250, fontWeight: 800, lineHeight: 0.85, letterSpacing: -8, display: "flex" }}>
              {report ? report.overall : "?"}
            </div>
            <div style={{ fontSize: 56, fontWeight: 600, color: "#9aa8c0", display: "flex" }}>/100</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", paddingBottom: 14 }}>
            <div style={{ fontSize: 64, fontWeight: 800, display: "flex" }}>{report ? report.grade.label : ""}</div>
            <div style={{ fontSize: 38, color: "#c5d0e3", marginTop: 6, display: "flex" }}>{host}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {report?.categories.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                height: 28,
                width: `${(CATEGORY_META[c.id].weight / total) * 1040}px`,
                borderRadius: 6,
                background: "#22334f",
              }}
            >
              <div style={{ display: "flex", height: 28, width: `${c.score}%`, borderRadius: 6, background: tone(c.score) }} />
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
