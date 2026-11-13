import { ImageResponse } from "next/og";

export const alt = "AgentReady: can AI agents find, trust and buy from your site?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
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
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 36, fontWeight: 700 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "#ffe066", display: "flex" }} />
          AgentReady
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2, display: "flex", maxWidth: 1000 }}>
            Can AI agents find, trust and buy from your site?
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 48 }}>
            {[35, 25, 25, 15].map((w, i) => (
              <div
                key={i}
                style={{ display: "flex", height: 26, width: `${w * 10.5}px`, borderRadius: 6, background: "#ffe066" }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
