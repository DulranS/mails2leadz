import { ImageResponse } from "next/og";

// "Add to Home Screen" icon on iOS — see app/icon.tsx for why this existing
// at all matters. Apple's convention wants a larger, unrounded square (iOS
// applies its own corner mask), 180×180.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 14,
          background: "#0B0E14",
          padding: "34px 28px 28px",
        }}
      >
        <div style={{ width: 28, height: 62, borderRadius: 6, background: "#D9A441" }} />
        <div style={{ width: 28, height: 94, borderRadius: 6, background: "#D9A441" }} />
        <div style={{ width: 28, height: 126, borderRadius: 6, background: "#D9A441" }} />
      </div>
    ),
    { ...size }
  );
}
