// lib/apollo.js - turns an Apollo person-match reply into the fields the CRM shows. Pure.
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function apolloEnrichment(json, now = new Date()) {
  const p = json?.person;
  if (!p || typeof p !== 'object') return null;
  const org = p.organization || {};
  const size = Number(org.estimated_num_employees);
  const out = {
    title: clip(p.title, 120),
    company: clip(org.name, 160),
    company_size: Number.isFinite(size) && size > 0 ? Math.round(size) : null,
    industry: clip(org.industry, 80),
    enrichedAt: now.toISOString(),
    source: 'apollo',
  };
  return out.title || out.company ? out : null;
}
