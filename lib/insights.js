// lib/insights.js - winning patterns, rep performance, message critique and the proof bank, from the owner's own records. Pure.
const DAY = 86400000;

/** Synced ad spend for one month, by platform (meta, google). Records without a known platform are ignored. */
export function spendFromMarketing(rows = [], month) {
  const out = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || r.month !== month) continue;
    const ch = r.source === 'meta' ? 'meta' : r.source === 'google' ? 'google' : null;
    if (ch) out[ch] = (out[ch] || 0) + (Number(r.amount) || 0);
  }
  return out;
}

/** Each owner's record over the last year: deals taken, won, win rate and won value. Deals with no owner are shown as unassigned. */
export function repScorecard(deals = [], now = Date.now()) {
  const year = now - 365 * DAY;
  const by = new Map();
  for (const d of Array.isArray(deals) ? deals : []) {
    if (!d || !(d.stage === 'closed_won' || d.stage === 'closed_lost')) continue;
    const closed = Date.parse(d.stageTimes?.[d.stage] || d.closedAt || '') || 0;
    if (closed < year) continue;
    const key = d.ownerId || 'unassigned';
    const row = by.get(key) || { owner: key, won: 0, lost: 0, wonValue: 0 };
    if (d.stage === 'closed_won') { row.won++; row.wonValue += Number(d.value) || 0; } else row.lost++;
    by.set(key, row);
  }
  return [...by.values()].map((r) => ({ ...r, wonValue: Math.round(r.wonValue * 100) / 100, winRatePct: r.won + r.lost ? Math.round((r.won / (r.won + r.lost)) * 100) : null }))
    .sort((a, b) => b.wonValue - a.wonValue);
}

/** "quote | customer | yes" lines. Only lines marked yes (written consent) are usable publicly. */
export function parseProof(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0] && p[0].length >= 10).slice(0, 100).map(([quote, customer = '', consent = '']) => ({
    quote: quote.slice(0, 400),
    customer: customer.slice(0, 120),
    consent: /^y(es)?$/i.test(consent),
  }));
}

export const approvedProof = (entries = []) => (Array.isArray(entries) ? entries : []).filter((e) => e && e.consent === true && e.quote);

/** The prompt for critiquing one message against the owner's own standard. Nothing is sent; it only reads. */
export function critiquePrompt(standard, draft) {
  const std = String(standard || '').trim() || 'Clear, honest, warm and brief. No hype, no invented claims.';
  return {
    system: 'You review a business message against the owner\'s own standard. Be specific and brief: five bullet points at most, each naming a line and what to change. Never rewrite the whole message. Never invent facts or numbers.',
    prompt: `Standard:\n${std}\n\nMessage to review:\n${String(draft).slice(0, 3000)}`,
  };
}

/** The prompt for patterns in won and lost customers, using only the owner's notes. */
export function patternsPrompt(wonNotes = [], lostNotes = []) {
  const won = wonNotes.map((n) => `- ${String(n).slice(0, 300)}`).join('\n') || '- (none)';
  const lost = lostNotes.map((n) => `- ${String(n).slice(0, 300)}`).join('\n') || '- (none)';
  return {
    system: 'You find patterns in a small business\'s own notes. Use only what is written. If the notes are too few to say, say so. Never invent figures or names.',
    prompt: `Notes from customers who bought:\n${won}\n\nNotes from customers who did not:\n${lost}\n\nGive up to five things the buyers have in common, and up to three reasons the others did not buy, each with the note it comes from.`,
  };
}

/** The spend audit prompt: synced spend per month and platform, and won deals per source. Numbers only from these figures. */
export function spendAuditPrompt(rows = [], won = {}) {
  const spend = (Array.isArray(rows) ? rows : []).map((r) => `- ${r.month} ${r.source}: ${r.amount}`).join('\n');
  const wins = Object.entries(won || {}).map(([s, c]) => `- ${s}: ${c} won deal${c === 1 ? '' : 's'}`).join('\n') || '- (none)';
  return {
    system: 'You audit a small business\'s ad spend using only the figures given. Name where spend looks wasted and which source wins most, with the figures you used. If the figures are too few to judge, say so. Never invent numbers.',
    prompt: `Synced ad spend by month and platform:\n${spend}\n\nWon deals by where the customer came from:\n${wins}\n\nGive up to four points: where spend looks wasted, which source earns most per unit of spend, what to test next, and what data is missing.`,
  };
}

/** The reactivation grouping prompt: notes from lost deals only. Drafts are for the owner to read; nothing is sent. */
export function reactivationPrompt(notes = []) {
  const list = (Array.isArray(notes) ? notes : []).map((n) => `- ${String(n).slice(0, 300)}`).join('\n');
  return {
    system: 'You group notes from lost deals into interest buckets and draft one short, honest reactivation message per bucket. Use only the notes. Never invent offers, prices, dates or claims.',
    prompt: `Notes from lost deals:\n${list}\n\nGroup them into up to five interest buckets. For each: the bucket name, how many notes, and a two-sentence reactivation message that refers only to what the notes say.`,
  };
}
