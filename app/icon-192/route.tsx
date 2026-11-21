import { ImageResponse } from "next/og";

// Android/Chrome's "Install app" icon — see app/icon.tsx for why a real
// icon exists at all. app/icon.tsx's 32×32 favicon is too small for Chrome
// to accept as an install/home-screen icon (it wants ≥192px), so this is
// the same three-bar mark redrawn at manifest size rather than reused.
// A plain route (not Next's app/icon.tsx convention) because that
// convention only serves one size per file and app/manifest.ts needs an
// explicit, stable URL to point "sizes: 192x192" at. nodejs runtime to
// match every other route in this app (see app/api/*/route.ts) rather than
// edge, which isn't assumed to be available wherever this deploys.
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
          gap: 15,
          background: "#0B0E14",
          borderRadius: 34,
          padding: "36px 30px 30px",
        }}
      >
        <div style={{ width: 30, height: 66, borderRadius: 6, background: "#D9A441" }} />
        <div style={{ width: 30, height: 100, borderRadius: 6, background: "#D9A441" }} />
        <div style={{ width: 30, height: 134, borderRadius: 6, background: "#D9A441" }} />
      </div>
    ),
    { width: 192, height: 192 }
  );
}
