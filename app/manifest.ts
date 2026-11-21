import type { MetadataRoute } from "next";

// Next.js auto-discovers this file and injects <link rel="manifest">
// site-wide — no wiring needed in app/layout.tsx. This is pure "make the
// app installable" polish: an SME owner who opens Balancr daily gets a
// real app icon on their phone/desktop home screen and a standalone
// window (no browser address bar), the same way any native app would
// feel, using only a browser-native capability — no service worker, no
// offline caching, no push notifications, nothing that turns this into a
// project of its own. (Firestore's own offline persistence — see
// lib/firebase.ts's persistentLocalCache — already covers "the app still
// opens with a spotty connection"; this manifest is only about how it
// looks and launches once installed.)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Balancr — inventory & unit economics",
    short_name: "Balancr",
    description: "Wholesale inventory, unit economics, and growth forecasting for a solo-run SME.",
    // Deliberately "/" rather than e.g. "/dashboard": a signed-out install
    // lands on the marketing page and gets redirected to /login by the
    // normal auth flow (see app/page.tsx / AppShell), same as visiting the
    // site in a browser tab. No separate "installed app" routing to keep in sync.
    start_url: "/",
    display: "standalone",
    background_color: "#0B0E14",
    theme_color: "#0B0E14",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
    ],
  };
}
