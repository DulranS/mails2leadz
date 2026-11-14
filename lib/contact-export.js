// lib/contact-export.js - a person's copy of their own data (subject access), packaged for them. Pure. Invoices are included because they are their record too.
export function packageExport({ email = '', found = {}, now = new Date() } = {}) {
  const counts = Object.fromEntries(Object.entries(found || {}).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]));
  return {
    email: String(email || '').trim().toLowerCase(),
    exportedAt: now.toISOString(),
    summary: counts,
    note: 'This is a copy of the personal information this business holds about you. Ask for corrections or erasure at any time; erasure keeps tax and accounting records as the law requires.',
    data: found,
  };
}
