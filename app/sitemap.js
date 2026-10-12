// app/sitemap.js - the three public pages. Empty until NEXT_PUBLIC_BASE_URL is a valid URL.
export default function sitemap() {
  let origin = '';
  try { origin = new URL(String(process.env.NEXT_PUBLIC_BASE_URL || '').trim()).origin; } catch { /* no base URL yet */ }
  if (!origin) return [];
  const now = new Date();
  return ['/', '/privacy', '/terms'].map((path) => ({ url: `${origin}${path}`, lastModified: now }));
}
