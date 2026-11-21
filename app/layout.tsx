import type { Metadata, Viewport } from "next";
import { configuredSiteUrl } from "@/lib/envDefaults";

// Self-hosted webfonts via @fontsource (npm packages, not next/font/google).
// This app previously loaded Space Grotesk / Inter / JetBrains Mono from
// fonts.googleapis.com at build time via next/font/google. That's a hard
// network dependency: in any offline build, sandboxed CI runner, or
// network-restricted environment, `next build` fails outright with
// NextFontError and the app doesn't ship at all. @fontsource ships the
// actual .woff2 files inside the npm package itself, so `npm install`
// pulls them once from the npm registry (already a build-time dependency
// for every other package) and the bundler copies them into the build
// output — no request to Google's font CDN at build or runtime, in dev
// or in production. Only the weights actually used in the app are
// imported, to keep the shipped font payload small.
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { AiAssistantProvider } from "@/contexts/AiAssistantContext";
import { AssistantModalProvider } from "@/contexts/AssistantModalContext";
import AppShell from "@/components/AppShell";

// Falls back to localhost when unset (or left as an empty string, which is
// what an unset var in .env.local actually is — `??` alone doesn't catch
// that, only `null`/`undefined`, so this must be `||`) so `next build`
// never fails on a missing env var — see .env.local.example for why this
// needs setting in production (it's what makes the og:image/canonical URLs
// below resolve to a real, absolute address instead of a relative one
// nothing can share).
const siteUrl = configuredSiteUrl() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Balancr — inventory & unit economics",
  description: "Wholesale inventory, unit economics, and growth forecasting for a solo-run SME.",
  // Site-wide fallback — app/page.tsx (the actual marketing page) sets its
  // own more specific openGraph/twitter title+description that override
  // this for "/". Every other route (which is behind login anyway, so
  // basically never gets shared as a link) just inherits this plain
  // version rather than defining its own.
  openGraph: {
    type: "website",
    siteName: "Balancr",
  },
  twitter: {
    card: "summary_large_image",
  },
  // iOS Safari doesn't read app/manifest.ts for "Add to Home Screen" — it
  // wants these meta tags instead (Next's Metadata API emits them from
  // this one field). apple-touch-icon itself already comes from
  // app/apple-icon.tsx; this just adds the "launch without Safari's
  // address bar" behavior to match what app/manifest.ts gives Android/
  // Chrome/desktop.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Balancr",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B0E14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <DataProvider>
            {/* Nested inside DataProvider so it can read business data
                (receivables aging, stock levels, etc.) via useData() to
                generate reminders from, while keeping its own notification
                writes from re-rendering every DataContext consumer. */}
            <NotificationsProvider>
              <ToastProvider>
                <AiAssistantProvider>
                  <AssistantModalProvider>
                    <AppShell>{children}</AppShell>
                  </AssistantModalProvider>
                </AiAssistantProvider>
              </ToastProvider>
            </NotificationsProvider>
          </DataProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
