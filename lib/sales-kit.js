// lib/sales-kit.js - the owner's REAL sales material, kept apart from the AI: a booking link, true proof points, honest
// answers to the objections they hear most. The AI may use exactly these and nothing else (it is told so in its prompt), so
// drafts get the things that make replies likelier (an easy next step, a real result, a straight answer) without inventing any.
// Pure functions; no network. The profile is written by the browser, so everything is re-checked here when it is READ by the server.

export const KIT_LIMITS = { link: 200, proofCount: 3, proofLen: 160, objCount: 5, objQ: 80, objA: 220 };

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
  };
}

/** Lines appended to the profile block of every prompt. Facts, labelled as the only ones allowed. */
export function kitLines(kit) {
  const lines = [];
  if (kit.bookingLink) lines.push(`Booking link (the ONLY link you may include; offer it as the easy next step): ${kit.bookingLink}`);
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
