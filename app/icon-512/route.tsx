import { ImageResponse } from "next/og";

// The larger of the two manifest icons — Chrome uses this size for the
// splash screen shown while an installed PWA cold-starts. See
// app/icon-192/route.tsx for why this is a plain route rather than Next's
// app/icon.tsx convention, and why nodejs rather than edge.
export const runtime = "nodejs";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 40,
          background: "#0B0E14",
          borderRadius: 90,
          padding: "97px 80px 80px",
        }}
      >
        <div style={{ width: 80, height: 176, borderRadius: 17, background: "#D9A441" }} />
        <div style={{ width: 80, height: 267, borderRadius: 17, background: "#D9A441" }} />
        <div style={{ width: 80, height: 358, borderRadius: 17, background: "#D9A441" }} />
      </div>
    ),
    { width: 512, height: 512 }
  );
}
