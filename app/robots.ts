import type { MetadataRoute } from "next";
import { configuredSiteUrl } from "@/lib/envDefaults";

// Only "/", /request-trial, /legal, and /login are actually reachable by a
// signed-out visitor — every other route requires auth and immediately
// redirects to /login (see components/AppShell.tsx's isMarketingPage /
// isStandalonePage), so there's nothing for a crawler to index there and
// every disallowed hit here is just wasted crawl budget, not a security
// boundary (Firestore security rules are the real access control).
const siteUrl = configuredSiteUrl() || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/$", "/request-trial", "/legal", "/login"],
      disallow: "/",
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
