// lib/first-email-batch.js - pure helpers behind "Draft first emails with AI, approve together".
// No Firebase, no network: given the loaded CSV and what was already emailed, say who is worth drafting for,
// and (after a send) which follow-up tasks must exist so the lead enters the follow-up queue.

import { parseCsvRow, parseMultipleEmails } from './dashboard-utils.js';

export const FIRST_EMAIL_BATCH_MAX = 10; // keeps AI spend predictable and the review window readable

const QUALITY_RANK = { HOT: 3, WARM: 2, COLD: 1 };
const pick = (row, names) => {
  for (const n of names) if (row[n] && String(row[n]).trim()) return String(row[n]).trim();
  return '';
};

/**
 * Leads from the loaded CSV that can be drafted for now, best first.
 * Skips: no valid email, already emailed, replied, opted out / lost (blocked), and the lead-quality filter.
 * Reads the CSV itself (not the contact list, which only holds rows that have a phone number).
 */
export function pickFirstEmailCandidates(csvContent, { emailed = [], blocked = [], qualityFilter = 'all', max = FIRST_EMAIL_BATCH_MAX } = {}) {
  const lines = String(csvContent || '').replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) return { candidates: [], total: 0 };
  const headers = parseCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
  const skip = new Set([...emailed, ...blocked].map((e) => String(e || '').trim().toLowerCase()));
  const seen = new Set();
  const out = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvRow(lines[i]);
    if (values.length !== headers.length) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

    const quality = (row.lead_quality || '').trim().toUpperCase() || 'HOT';
    if (qualityFilter !== 'all' && row.lead_quality !== undefined && quality !== qualityFilter) continue;

    const email = parseMultipleEmails(pick(row, ['email', 'email_address', 'email_primary']))[0];
    if (!email || skip.has(email) || seen.has(email)) continue;
    seen.add(email);

    out.push({
      email,
      business: pick(row, ['business_name', 'business', 'company', 'company_name', 'name']) || 'your business',
      website: pick(row, ['website', 'url', 'site']),
      category: pick(row, ['category']),
      address: pick(row, ['address', 'location']),
      contactName: pick(row, ['first_name']),
      quality,
      score: Number(row.lead_quality_score) || 0,
    });
  }
  out.sort((a, b) => (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0) || b.score - a.score);
  return { candidates: out.slice(0, Math.max(1, max)), total: out.length };
}

/**
 * Follow-up tasks for leads that were just emailed. Same shape the bulk sender creates, one per ENABLED email
 * follow-up template, scheduled `delayDays` after `now`. (Duplicates are the caller's job: it checks each one.)
 */
export function followUpTasksFor(recipients, templates, now = new Date()) {
  const schedule = (templates || []).filter((t) => t && t.enabled).sort((a, b) => a.delayDays - b.delayDays);
  const tasks = [];
  for (const r of recipients || []) {
    if (!r?.email) continue;
    for (const t of schedule) {
      const when = new Date(now);
      when.setDate(when.getDate() + (Number(t.delayDays) || 0));
      tasks.push({
        leadEmail: String(r.email).trim().toLowerCase(),
        leadName: r.name || r.email,
        companyName: r.company || r.name || '',
        channel: 'email',
        followUpStage: t.name,
        templateId: t.id,
        scheduledFor: when.toISOString(),
      });
    }
  }
  return tasks;
}
