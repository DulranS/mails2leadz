import { ImageResponse } from "next/og";

// Same card as app/opengraph-image.tsx, duplicated because Twitter/X reads
// its own `twitter:image` convention separately rather than falling back
// to Open Graph in every client — this file is the route-convention name
// Next.js looks for to serve that tag. See opengraph-image.tsx for the
// full reasoning on why this exists at all.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#0B0E14",
          padding: "0 100px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 36 }}>
          <div style={{ width: 14, height: 30, borderRadius: 3, background: "#D9A441" }} />
          <div style={{ width: 14, height: 46, borderRadius: 3, background: "#D9A441" }} />
          <div style={{ width: 14, height: 62, borderRadius: 3, background: "#D9A441" }} />
          <div style={{ fontSize: 34, fontWeight: 700, color: "#E8E6E1", marginLeft: 14 }}>Balancr</div>
        </div>
        <div style={{ display: "flex", fontSize: 66, fontWeight: 700, color: "#E8E6E1", lineHeight: 1.1, maxWidth: 920 }}>
          Just type what happened. Balancr does the accounting.
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#8A92A6", marginTop: 28, maxWidth: 820, lineHeight: 1.4 }}>
          Stock, invoices, staff pay and profit, kept up to date for you. Try a sample shop in one tap.
        </div>
      </div>
    ),
    { ...size }
  );
}
