// lib/pdl.js - People Data Labs person-enrichment reply, mapped to the same fields the CRM shows as Apollo's. Pure.
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function pdlEnrichment(json, now = new Date()) {
  const p = json?.data || json;
  if (!p || typeof p !== 'object') return null;
  const out = {
    title: clip(p.job_title, 120),
    company: clip(p.job_company_name, 160),
    company_size: clip(p.job_company_size, 40) || null,
    industry: clip(p.job_company_industry, 80),
    enrichedAt: now.toISOString(),
    source: 'pdl',
  };
  return out.title || out.company ? out : null;
}
