// app/robots.js - only the public pages are for search engines; the app itself and the API are not.
const base = () => { try { return new URL(String(process.env.NEXT_PUBLIC_BASE_URL || '').trim()).origin; } catch { return ''; } };

export default function robots() {
  const origin = base();
  return {
    rules: [{ userAgent: '*', allow: ['/', '/privacy', '/terms'], disallow: ['/api/', '/dashboard', '/crm', '/business', '/customers', '/billing', '/account', '/inbox', '/unsubscribe', '/enquire', '/admin'] }],
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
