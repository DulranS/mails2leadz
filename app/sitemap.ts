import type { MetadataRoute } from "next";
import { configuredSiteUrl } from "@/lib/envDefaults";

// Deliberately short — see components/AppShell.tsx's `isMarketingPage` for
// the exact same three routes this list mirrors (plus /legal, which is
// "standalone" there for the same "no login required" reason). Every other
// route in this app requires auth and immediately redirects to /login for
// a signed-out visitor, so listing them here would just send a crawler
// into a redirect loop for no SEO benefit — see app/robots.ts, which
// disallows them outright for the same reason.
const siteUrl = configuredSiteUrl() || "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${siteUrl}/request-trial`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/legal`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
  ];
}
