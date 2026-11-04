// lib/action-list.js - the short list of things to do this week, built from the owner's own records. Pure. Nothing is sent.
const DAY = 86400000;
const ms = (v) => {
  if (!v) return null;
  const t = typeof v === 'object' && v.toDate ? v.toDate().getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

export function buildActionList({ deals = [], tasks = [], quotes = [], invoices = [], members = [], now = Date.now(), limit = 8 } = {}) {
  const out = [];
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
