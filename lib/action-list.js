import { viewedNoAnswer } from './quote-followup.js';
import { crossSellSuggestions } from './cross-sell.js';
import { feedbackActions } from './feedback-loop.js';

// Valuable customers (top of their book by value) with no activity for 120 days: the cheapest revenue there is.
export function quietValuable(deals = [], now = Date.now(), days = 120, top = 2) {
  const won = (Array.isArray(deals) ? deals : []).filter((d) => d && d.stage === 'closed_won' && d.email && Number(d.value) > 0);
  const sorted = [...won].sort((a, b) => Number(b.value) - Number(a.value));
  const cutoff = Math.max(1, Math.ceil(sorted.length * 0.2));
  const valuable = sorted.slice(0, cutoff).slice(0, top * 5);
  return valuable.filter((d) => {
    const last = ms(d.lastUpdate) ?? ms(d.stageTimes?.closed_won);
    return last !== null && now - last > days * DAY;
  }).slice(0, top).map((d) => ({ email: d.email, name: d.businessName || d.email, value: Number(d.value), idleDays: Math.floor((now - (ms(d.lastUpdate) ?? ms(d.stageTimes?.closed_won))) / DAY) }));
}
// lib/action-list.js - the short list of things to do this week, built from the owner's own records. Pure. Nothing is sent.
const DAY = 86400000;
const ms = (v) => {
  if (!v) return null;
  const t = typeof v === 'object' && v.toDate ? v.toDate().getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

export function buildActionList({ deals = [], tasks = [], quotes = [], invoices = [], members = [], productNames = {}, tickets = [], now = Date.now(), limit = 8 } = {}) {
  const out = [];
  for (const line of feedbackActions(tickets)) out.push({ priority: 3, kind: 'feedback', title: line.replace(/^- /, ''), why: 'from your support questions in the last weeks' });
  for (const d of (Array.isArray(deals) ? deals : []).filter((x) => x && x.stage === 'closed_won' && x.email)) {
    const won = ms(d.stageTimes?.closed_won) ?? ms(d.closedAt);
    if (won !== null && now - won >= 90 * DAY && now - won < 120 * DAY) out.push({ priority: 2, kind: 'account_review', title: `Account review: ${d.businessName || d.email}`, why: 'won about three months ago; review how they are doing and what they need next' });
  }
  for (const q of quietValuable(deals, now)) {
    out.push({ priority: 3, kind: 'reengage', title: `Re-engage ${q.name} (worth ${q.value.toFixed(2)})`, why: `No activity for ${q.idleDays} days` });
  }
  for (const s of crossSellSuggestions(invoices, { productNames, limit: 3 })) {
    out.push({ priority: 3, kind: 'cross_sell', title: `Suggest ${s.productName} to ${s.email}`, why: `${s.support} customers bought it with a product this customer already has` });
  }
  const names = new Map((Array.isArray(members) ? members : []).map((m) => [String(m.id), m.name || 'Team member']));
  const dueIn = (days) => new Date(now + days * DAY).toISOString().slice(0, 10);
  for (const t of Array.isArray(tasks) ? tasks : []) {
    const due = ms(t?.scheduledFor);
    if (t?.status === 'pending' && due !== null && now - due > DAY) {
      out.push({ priority: 1, kind: 'overdue_followup', title: `Follow up with ${t.leadEmail || 'a lead'}`, why: `Due ${Math.floor((now - due) / DAY)} days ago` });
    }
  }
  for (const i of Array.isArray(invoices) ? invoices : []) {
    const due = ms(i?.dueAt);
    if (i && i.status !== 'paid' && i.status !== 'void' && due !== null && now > due) {
      out.push({ priority: 1, kind: 'overdue_invoice', title: `Collect ${i.number || 'an invoice'} from ${i.businessName || i.email || 'a customer'}`, why: `${Math.floor((now - due) / DAY)} days overdue`, owner: 'Unassigned', dueBy: dueIn(1) });
    }
  }
  for (const d of Array.isArray(deals) ? deals : []) {
    if (!d?.email || d.stage === 'closed_won' || d.stage === 'closed_lost') continue;
    const since = ms(d.stageTimes?.[d.stage]) ?? ms(d.lastUpdate);
    if (since !== null && now - since > 14 * DAY) {
      out.push({ priority: 2, kind: 'stalled_deal', title: `Move or close ${d.businessName || d.email}`, why: `No change in ${Math.floor((now - since) / DAY)} days`, owner: names.get(String(d.ownerId)) || 'Unassigned', dueBy: dueIn(3) });
    }
  }
  for (const q of viewedNoAnswer(quotes, now, 1)) {
    out.push({ priority: 1, kind: 'quote_viewed', title: `Follow up on the quote: ${q.title}`, why: `Opened ${q.viewCount} time${q.viewCount === 1 ? '' : 's'}, no answer yet` });
  }
  for (const q of Array.isArray(quotes) ? quotes : []) {
    if (!q || (q.status !== 'sent' && q.status !== 'open')) continue;
    const at = ms(q.sentAt) ?? ms(q.createdAt);
    if (at !== null && now - at > 7 * DAY) {
      out.push({ priority: 2, kind: 'quote_no_reply', title: `Chase the quote: ${q.title || q.customerEmail || 'untitled'}`, why: `Sent ${Math.floor((now - at) / DAY)} days ago, no answer` });
    }
  }
  return out.map((a) => (a.owner ? a : { ...a, owner: 'Unassigned', dueBy: a.dueBy || dueIn(2) })).sort((a, b) => a.priority - b.priority).slice(0, limit);
}

/** One line per action for the digest. */
export function actionText(actions = []) {
  return actions.map((a) => `- ${a.title} (${a.why}; owner ${a.owner || 'Unassigned'}, by ${a.dueBy || 'this week'})`);
}
