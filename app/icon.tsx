import { ImageResponse } from "next/og";

// Browser tab / bookmark icon. Was entirely missing before — Next.js falls
// back to no favicon at all, or a stale default, which reads as broken/
// unfinished on a page whose whole pitch is "a real business, not a
// half-built signup form". Same three-bar mark as BalancrMark in
// app/page.tsx (components/AppShell.tsx has its own copy for the app
// chrome), rendered once at build/request time rather than duplicating an
// SVG asset — same shape, same brand colors, guaranteed to never drift
// from the mark used everywhere else on the site.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 2.5,
          background: "#0B0E14",
          borderRadius: 6,
          padding: "6px 5px 5px",
        }}
      >
        <div style={{ width: 5, height: 11, borderRadius: 1, background: "#D9A441" }} />
        <div style={{ width: 5, height: 17, borderRadius: 1, background: "#D9A441" }} />
        <div style={{ width: 5, height: 23, borderRadius: 1, background: "#D9A441" }} />
      </div>
    ),
    { ...size }
  );
}
