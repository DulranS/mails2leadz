// lib/sales-kit.js - the owner's REAL sales material, kept apart from the AI: a booking link, true proof points, honest
// answers to the objections they hear most. The AI may use exactly these and nothing else (it is told so in its prompt), so
// drafts get the things that make replies likelier (an easy next step, a real result, a straight answer) without inventing any.
// Pure functions; no network. The profile is written by the browser, so everything is re-checked here when it is READ by the server.

export const KIT_LIMITS = { link: 200, proofCount: 3, proofLen: 160, objCount: 5, objQ: 80, objA: 220, line: 220, pkgCount: 3, pkgName: 40, pkgPrice: 40, pkgIncludes: 160 };

const oneLine = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** https only: a booking link ends up inside emails, so no javascript:, data:, http: or credentials-in-URL tricks. '' when not acceptable. */
export function safeHttpsUrl(v) {
  const raw = String(v ?? '').trim();
  if (!raw || raw.length > KIT_LIMITS.link || /\s/.test(raw)) return '';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) return '';
    return u.toString();
  } catch { return ''; }
}

/** One proof point per line, max 3, each short. */
export function parseProofPoints(text) {
  return String(text ?? '').split(/\r?\n/).map((l) => oneLine(l.replace(/^[-*•\d.)\s]+/, ''), KIT_LIMITS.proofLen)).filter((l) => l.length >= 8).slice(0, KIT_LIMITS.proofCount);
}

/** "objection = answer" per line (also "objection -> answer" or "objection: answer"), max 5. */
export function parseObjections(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = line.match(/^(.{3,}?)\s*(?:=>|->|=|:)\s*(.{8,})$/);
    if (!m) continue;
    const q = oneLine(m[1], KIT_LIMITS.objQ);
    const a = oneLine(m[2], KIT_LIMITS.objA);
    if (q.length >= 3 && a.length >= 8) out.push({ q, a });
    if (out.length >= KIT_LIMITS.objCount) break;
  }
  return out;
}

/** What the profile form stored -> the clean kit the AI is allowed to see. */
export function sanitizeKit(profile, { validAngleIds = [] } = {}) {
  const p = profile && typeof profile === 'object' ? profile : {};
  const lean = String(p.leanAngle || '');
  return {
    bookingLink: safeHttpsUrl(p.bookingLink),
    proofPoints: parseProofPoints(p.proofText),
    objections: parseObjections(p.objectionsText),
    leanAngle: validAngleIds.includes(lean) ? lean : '',
    // The persuasion levers, each ONLY as true facts the owner typed (the AI may use them and invent nothing):
    guarantee: oneLine(p.guarantee, KIT_LIMITS.line),          // risk reversal: a real policy (refund, free redo, cancel any time)
    firstStep: oneLine(p.firstStep, KIT_LIMITS.line),          // the smallest yes: a free audit, a 15 minute call, a pilot
    costOfInaction: oneLine(p.costOfInaction, KIT_LIMITS.line),// what waiting really costs them (loss framing, only if true)
    beforeAfter: oneLine(p.beforeAfter, KIT_LIMITS.line),      // the contrast: how it is now versus after
    honestLimit: oneLine(p.honestLimit, KIT_LIMITS.line),      // a real limitation, said upfront (it raises trust in everything else)
    availability: oneLine(p.availability, KIT_LIMITS.line),    // true scarcity: places left, a real deadline
    packages: parsePackages(p.packagesText),
    intake: p.intakeQuestions === true,
  };
}

/**
 * Up to 3 offers, one per line: "Name | price | what is included | best" (the 4th part, if it says best or recommended or ends the line
 * with a star, marks the ONE offer to highlight). Few real choices beat many: this is what a proposal may present, and nothing else.
 */
export function parsePackages(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const star = /\*\s*$/.test(line);
    const parts = line.replace(/\*\s*$/, '').split('|').map((x) => x.trim());
    if (parts.length < 2) continue;
    const name = oneLine(parts[0], KIT_LIMITS.pkgName);
    const price = oneLine(parts[1], KIT_LIMITS.pkgPrice);
    if (name.length < 2 || !price) continue;
    const flag = /^(best|recommended|best value|popular)$/i.test(parts[3] || '') || star;
    out.push({ name, price, includes: oneLine(parts[2] || '', KIT_LIMITS.pkgIncludes), recommended: flag });
    if (out.length >= KIT_LIMITS.pkgCount) break;
  }
  // Only one offer is ever highlighted: the first one marked.
  let seen = false;
  return out.map((o) => { const r = o.recommended && !seen; if (r) seen = true; return { ...o, recommended: r }; });
}

/** Lines appended to the profile block of every prompt. Facts, labelled as the only ones allowed. */
export function kitLines(kit) {
  const lines = [];
  if (kit.bookingLink) lines.push(`Booking link (the ONLY link you may include; offer it as the easy next step): ${kit.bookingLink}`);
  if (kit.firstStep) lines.push(`The smallest first step the sender offers (ask for THIS instead of the whole sale): ${kit.firstStep}`);
  if (kit.guarantee) lines.push(`A real policy that removes the buyer's risk (mention it as given, never turn it into a promise of results): ${kit.guarantee}`);
  if (kit.costOfInaction) lines.push(`What waiting costs the buyer, per the sender (use only if it fits this prospect): ${kit.costOfInaction}`);
  if (kit.beforeAfter) lines.push(`Before and after, per the sender (use only if it fits): ${kit.beforeAfter}`);
  if (kit.honestLimit) lines.push(`A real limitation the sender says upfront (you may state it plainly, once, to build trust): ${kit.honestLimit}`);
  if (kit.availability) lines.push(`True availability, per the sender (the ONLY scarcity or deadline you may mention; never invent any): ${kit.availability}`);
  if (kit.proofPoints?.length) lines.push(`Real proof points from the sender (the ONLY results you may cite, in your own words; add no numbers or names):\n${kit.proofPoints.map((x) => `- ${x}`).join('\n')}`);
  return lines;
}

/** For prompts that answer a prospect's questions (reply help, enquiry replies, closing nudges). */
export function objectionBlock(kit) {
  if (!kit.objections?.length) return '';
  return `The sender's own honest answers to common objections (use one only if it truly fits what the person said; otherwise ignore them):\n${kit.objections.map((o) => `- "${o.q}": ${o.a}`).join('\n')}`;
}

/**
 * Add one real result to the owner's proof points (the only results the AI may cite). Never exceeds the limits, never duplicates.
 * Returns { ok, text } on success, { ok: false, reason } when it cannot (too short, already there, no free slot).
 */
export function addProofPoint(existingText, line) {
  const points = parseProofPoints(existingText);
  const next = oneLine(String(line ?? '').replace(/^[-*\u2022\d.)\s]+/, ''), KIT_LIMITS.proofLen);
  if (next.length < 8) return { ok: false, reason: 'Write the result in at least a few words.' };
  if (points.some((x) => x.toLowerCase() === next.toLowerCase())) return { ok: false, reason: 'That is already one of your proof points.' };
  if (points.length >= KIT_LIMITS.proofCount) return { ok: false, reason: `You already use all ${KIT_LIMITS.proofCount} proof points. Free one in Account, Your business, then add this.` };
  return { ok: true, text: [...points, next].join('\n') };
}

/** For prompts that write a proposal or a closing note: the offers as they really are, with the highlighted one marked. */
export function packagesBlock(kit) {
  if (!kit.packages?.length) return '';
  const rows = kit.packages.map((o) => `- ${o.name}: ${o.price}${o.includes ? `. Includes: ${o.includes}` : ''}${o.recommended ? ' [the sender recommends this one: highlight it as the best value]' : ''}`);
  return `The sender's real offers. Present only these (at most ${kit.packages.length}), with these exact prices, and invent no other option, price, discount or original price:\n${rows.join('\n')}`;
}

/** First-email only: answer the most likely worry in one short sentence before they voice it (only a real answer the sender wrote). */
export function preemptLine(kit) {
  const o = kit.objections?.[0];
  return o ? `If it fits naturally, spend ONE short sentence on this likely worry before the prospect raises it, using only the sender's own answer. Worry: "${o.q}". Answer: ${o.a}` : '';
}

/** Which message angles may run: the base angles always, and each lever angle only once the owner supplied the real material for it. */
export function eligibleAngleIds(kit, baseIds, gatedIds = {}) {
  const k = kit || {};
  const ok = { lose_by_waiting: !!k.costOfInaction, proof_peers: (k.proofPoints || []).length > 0, before_after: !!k.beforeAfter };
  return baseIds.filter((id) => !(id in gatedIds) || ok[id] === true);
}

/** How complete the playbook is: which real levers are filled and why each matters. A guide, never a score to game. */
export function playbookStrength(kit) {
  const k = kit || {};
  const items = [
    { id: 'booking', label: 'Easy next step (booking link)', ok: !!k.bookingLink, why: 'Every extra click loses people. One link to book removes thinking.' },
    { id: 'first_step', label: 'Smallest first step', ok: !!k.firstStep, why: 'A tiny yes (a free audit, a short call) leads to the big one far more often than asking for the sale.' },
    { id: 'proof', label: 'Real proof points', ok: (k.proofPoints || []).length > 0, why: 'People follow what others already trusted. Real results beat any claim.' },
    { id: 'guarantee', label: 'Risk reversal (a real guarantee or trial)', ok: !!k.guarantee, why: 'Buyers fear a bad choice more than they want a good one. Take the risk onto yourself, if you really can.' },
    { id: 'objections', label: 'Honest answers to objections', ok: (k.objections || []).length > 0, why: 'The worry they do not say out loud is the one that stops the reply.' },
    { id: 'cost', label: 'What waiting costs them', ok: !!k.costOfInaction, why: 'Losing something hurts more than missing a gain. Say what staying as they are costs, only if true.' },
    { id: 'before_after', label: 'Before and after', ok: !!k.beforeAfter, why: 'Contrast makes the value clear without a long explanation.' },
    { id: 'limit', label: 'An honest limitation', ok: !!k.honestLimit, why: 'Admitting one small real limit makes everything else more believable.' },
    { id: 'packages', label: '2 or 3 clear offers, one highlighted', ok: (k.packages || []).length >= 2, why: 'More than three options and people choose none. Show real prices and point to the best value.' },
    { id: 'availability', label: 'True availability or deadline', ok: !!k.availability, why: 'Real scarcity makes people act now. Only if it is true: never fake it.' },
  ];
  const done = items.filter((i) => i.ok).length;
  return { items, done, total: items.length, next: items.filter((i) => !i.ok).slice(0, 2) };
}
