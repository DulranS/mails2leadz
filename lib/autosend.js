// lib/autosend.js - the rules of "Autosend": the server sends the drafts that were prepared overnight, without a person pressing Send.
// Pure functions only (no Firebase, no network, no AI), so every guardrail is testable.
//
// Autosend is OFF by default and the owner switches it on knowingly. It exists so the outbound spine runs by itself
// (find -> draft -> send -> follow up), and it is deliberately boring about safety, because the owner's own Gmail
// reputation is the asset being protected:
//   * a small daily cap (default 15, never above 50) on top of the platform cap,
//   * only inside a send window (default 09:00-17:00 local time, weekdays),
//   * inbound replies first (someone asked to hear from you), then follow-ups, then cold first emails (best lead first),
//   * it stops by itself when mail bounces, when Gmail rejects the sends, or when Gmail access has expired,
//   * the owner can pause it with one switch, and every send is listed in Customers/Dashboard history like a hand-sent one.
export const AUTOSEND_PER_DAY_MAX = 50;
export const AUTOSEND_PER_RUN_MAX = 25; // one cron run must finish inside its time budget, with a pause between emails
export const BOUNCE_PAUSE_RATE = 0.05; // 5% hard bounces over the last 7 days ...
export const BOUNCE_PAUSE_MIN_SENT = 20; // ... but only once there are enough sends for the rate to mean something
export const MAX_RUN_FAILURES = 3; // this many failed sends in a row end the run

export const AUTOSEND_DEFAULTS = {
  autoSend: false,
  autoSendPerDay: 15,
  sendHourStart: 9,
  sendHourEnd: 17,
  tzOffsetMin: 330, // Asia/Colombo (UTC+05:30). Minutes east of UTC.
  weekdaysOnly: true,
  autoSendPaused: false,
  autoSendPauseReason: '',
  // The rest of the daily job (lib/server/daily-ops.js). Each is its own switch; "Run on autopilot" in Account turns them all on.
  autoBilling: false, // raise the monthly subscription invoices, email them, and send polite payment reminders
  autoContent: false, // draft next week's posts when the calendar is running empty (posting itself stays a tap)
  contentPlatforms: ['linkedin', 'facebook'],
  weeklyReport: false, // email the weekly report to yourself on Monday morning
  dailyBrief: false, // a short morning email, only on days something needs you (replies, money, posts due, a stopped Autosend)
  autoLearn: false, // favour the cold-email angle that gets the most replies, once the data is clear (your own choice in Account always wins)
};
export const CONTENT_PLATFORM_IDS = ['linkedin', 'instagram', 'facebook', 'tiktok', 'x'];

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** Whatever the browser sends -> safe autosend settings (unknown keys dropped, numbers clamped). `current` supplies what is not in `raw`. */
export function sanitizeAutoSend(raw, current = AUTOSEND_DEFAULTS) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const base = { ...AUTOSEND_DEFAULTS, ...current };
  let start = clampInt(r.sendHourStart, 0, 23, base.sendHourStart);
  let end = clampInt(r.sendHourEnd, 1, 24, base.sendHourEnd);
  if (end <= start) { start = base.sendHourStart; end = base.sendHourEnd; if (end <= start) { start = 9; end = 17; } } // a window must have a length
  const paused = typeof r.autoSendPaused === 'boolean' ? r.autoSendPaused : !!base.autoSendPaused;
  return {
    autoSend: typeof r.autoSend === 'boolean' ? r.autoSend : !!base.autoSend,
    autoSendPerDay: clampInt(r.autoSendPerDay, 1, AUTOSEND_PER_DAY_MAX, base.autoSendPerDay),
    sendHourStart: start,
    sendHourEnd: end,
    tzOffsetMin: clampInt(r.tzOffsetMin, -720, 840, base.tzOffsetMin),
    weekdaysOnly: typeof r.weekdaysOnly === 'boolean' ? r.weekdaysOnly : base.weekdaysOnly !== false,
    autoBilling: typeof r.autoBilling === 'boolean' ? r.autoBilling : !!base.autoBilling,
    autoContent: typeof r.autoContent === 'boolean' ? r.autoContent : !!base.autoContent,
    contentPlatforms: (() => {
      const pick = (v) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x).toLowerCase()))].filter((x) => CONTENT_PLATFORM_IDS.includes(x)).slice(0, 5);
      const mine = Array.isArray(r.contentPlatforms) ? pick(r.contentPlatforms) : null;
      return mine && mine.length ? mine : pick(base.contentPlatforms).length ? pick(base.contentPlatforms) : ['linkedin', 'facebook'];
    })(),
    weeklyReport: typeof r.weeklyReport === 'boolean' ? r.weeklyReport : !!base.weeklyReport,
    dailyBrief: typeof r.dailyBrief === 'boolean' ? r.dailyBrief : !!base.dailyBrief,
    autoLearn: typeof r.autoLearn === 'boolean' ? r.autoLearn : !!base.autoLearn,
    autoSendPaused: paused,
    // switching it back on (paused -> false) clears the reason; otherwise keep what the system wrote
    autoSendPauseReason: paused ? String(typeof r.autoSendPauseReason === 'string' ? r.autoSendPauseReason : base.autoSendPauseReason || '').replace(/[\r\n]+/g, ' ').slice(0, 200) : '',
  };
}

/** Local weekday (0 = Sunday) and hour (0-23, fractional minutes ignored) for an instant and a UTC offset in minutes. */
export function localParts(nowMs, tzOffsetMin = 0) {
  const d = new Date(Number(nowMs) + Number(tzOffsetMin) * 60000);
  return { dow: d.getUTCDay(), hour: d.getUTCHours(), dateKey: d.toISOString().slice(0, 10) };
}

/** Is "now" inside the owner's send window? { ok, why } - why is plain words for the status line when not. */
export function inSendWindow(nowMs, s) {
  const { dow, hour } = localParts(nowMs, s.tzOffsetMin);
  if (s.weekdaysOnly && (dow === 0 || dow === 6)) return { ok: false, why: 'weekend' };
  if (hour < s.sendHourStart) return { ok: false, why: 'before_window' };
  if (hour >= s.sendHourEnd) return { ok: false, why: 'after_window' };
  return { ok: true, why: '' };
}

/** How many more may go out today: the lowest of the owner's cap, the platform cap and one run's cap. */
export function sendRoom({ autoSentToday = 0, sentToday = 0, perDay = 15, platformCap = 500, perRun = AUTOSEND_PER_RUN_MAX }) {
  return Math.max(0, Math.min(perDay - autoSentToday, platformCap - sentToday, perRun));
}

const RANK = { inbound: 0, followup: 1, first: 2 };
const tier = (q) => (q.kind === 'followup' ? RANK.followup : q.inbound ? RANK.inbound : RANK.first);

/**
 * Which ready drafts go out this run. Inbound replies first, then follow-ups (a lead is waiting), then first emails, best lead first.
 * One draft per address. Anything not "ready", without an address, subject or body is ignored.
 */
export function planAutosend(ready, room) {
  if (!(room > 0)) return [];
  const seen = new Set();
  const usable = (ready || []).filter((q) => q && q.status === 'ready' && q.email && q.subject && q.body);
  usable.sort((a, b) => tier(a) - tier(b) || (Number(b.score) || 0) - (Number(a.score) || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const out = [];
  for (const q of usable) {
    const e = String(q.email).trim().toLowerCase();
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(q);
    if (out.length >= room) break;
  }
  return out;
}

/** Should Autosend switch itself off? Looks at the last 7 days. */
export function shouldPause({ sent7 = 0, bounced7 = 0 } = {}) {
  if (sent7 >= BOUNCE_PAUSE_MIN_SENT && bounced7 / sent7 >= BOUNCE_PAUSE_RATE) {
    return { pause: true, reason: `${bounced7} of the last ${sent7} emails bounced (addresses that do not exist). Autosend paused to protect your Gmail reputation: check the lead list, then switch it back on.` };
  }
  return { pause: false, reason: '' };
}

/** A Gmail error -> what to do about it. Auth problems end the run AND pause (nothing will work until reconnecting); the rest just count as a failure. */
export function classifyGmailError(err) {
  const msg = String(err?.response?.data?.error || err?.message || '');
  const code = Number(err?.code || err?.response?.status || 0);
  if (/invalid_grant/i.test(msg) || code === 401) return { kind: 'auth', reason: 'Gmail access expired or was revoked. Reconnect Gmail in Account to continue.' };
  if (code === 403 && /insufficient|scope|permission/i.test(msg)) return { kind: 'auth', reason: 'Gmail was connected without permission to send. Reconnect it with "automatic sending" in Account.' };
  if (code === 429 || /rate.?limit|quota|user-rate/i.test(msg)) return { kind: 'limit', reason: 'Gmail asked us to slow down. Stopping for today.' };
  return { kind: 'other', reason: 'A send failed.' };
}

/** Milliseconds to wait between two sends in one run: 6-15 seconds, deterministic from the index (no Math.random, so it is testable). */
export function pauseBetweenSendsMs(i) {
  return 6000 + ((Number(i) * 2654435761) >>> 0) % 9001;
}

/** One line for the Account page. */
export function autosendStatusLine(s, { canSend = false, connected = false, now = Date.now() } = {}) {
  if (!s.autoSend) return 'Off. Drafts are prepared and wait for you to press Send.';
  if (s.autoSendPaused) return `Paused. ${s.autoSendPauseReason || 'You paused it.'}`;
  if (!connected) return 'On, but Gmail is not connected yet, so nothing can be sent.';
  if (!canSend) return 'On, but Gmail was connected for reading only. Reconnect it with automatic sending.';
  const w = inSendWindow(now, s);
  const where = `${String(s.sendHourStart).padStart(2, '0')}:00-${String(s.sendHourEnd).padStart(2, '0')}:00${s.weekdaysOnly ? ', weekdays' : ''}`;
  return `On: up to ${s.autoSendPerDay} a day, inside ${where}.${w.ok ? '' : ' Outside the window right now, so it waits.'}`;
}

const DAY = 86400000;
const toMs = (v) => { if (v == null) return 0; if (typeof v === 'number') return v; if (typeof v.toMillis === 'function') return v.toMillis(); const t = Date.parse(v); return Number.isFinite(t) ? t : 0; };
// Runs that end for a reason the owner has to fix (everything else, like "weekend" or "nothing ready", is normal).
const FIX_STOPS = new Set(['no_gmail', 'no_send_access', 'gmail_unreachable', 'auth', 'failures', 'bounces']);

/**
 * "Does the owner need to know?" - the automatic spine must never stop silently.
 * `s` is the raw autopilot settings doc, `last` its lastAutoSend record ({at, sent, failed, stopped}). Returns null or { id, priority, tone, title, detail, href, cta }
 * in the shape lib/next-actions.js uses.
 */
export function autopilotAlert(s, last, now = Date.now()) {
  if (!s || !s.autoSend) return null;
  if (s.autoSendPaused) {
    const byOwner = !s.autoSendPauseReason || /^you paused it/i.test(s.autoSendPauseReason);
    return {
      id: 'autosend_paused', priority: byOwner ? 3 : 1, tone: byOwner ? 'info' : 'hot',
      title: byOwner ? 'Autosend is paused: nothing is being sent' : 'Autosend stopped itself: nothing is being sent',
      detail: `${byOwner ? 'You paused it.' : s.autoSendPauseReason} ${byOwner ? 'Resume it in Account when you are ready.' : 'Fix that, then resume it in Account.'}`,
      href: '/account', cta: byOwner ? 'Resume' : 'Fix and resume',
    };
  }
  const at = toMs(last?.at);
  if (last && FIX_STOPS.has(last.stopped) && at && now - at < 3 * DAY) {
    return {
      id: 'autosend_blocked', priority: 2, tone: 'warn',
      title: 'Autosend could not send last time',
      detail: `${AUTOSEND_BLOCK_TEXT[last.stopped] || 'A send failed.'} Open Account to fix it; the drafts keep waiting for you meanwhile.`,
      href: '/account', cta: 'Open Account',
    };
  }
  return null;
}
const AUTOSEND_BLOCK_TEXT = {
  no_gmail: 'Gmail is not connected.', no_send_access: 'Gmail is connected for reading only.', gmail_unreachable: 'Gmail could not be reached.',
  auth: 'Gmail access expired.', failures: 'Several sends failed in a row.', bounces: 'Too many emails bounced.',
};

/** One line for the Account page: what the automatic jobs did last. */
export function lastRunLine(autoSendRun, opsRun) {
  const bits = [];
  if (autoSendRun && autoSendRun.at) bits.push(`${autoSendRun.sent || 0} email${autoSendRun.sent === 1 ? '' : 's'} sent${autoSendRun.failed ? `, ${autoSendRun.failed} failed` : ''}`);
  if (opsRun && opsRun.at) {
    const o = [];
    if (opsRun.invoices) o.push(`${opsRun.invoices} invoice${opsRun.invoices === 1 ? '' : 's'}`);
    if (opsRun.reminders) o.push(`${opsRun.reminders} reminder${opsRun.reminders === 1 ? '' : 's'}`);
    if (opsRun.report) o.push('weekly report');
    if (opsRun.brief) o.push('morning brief');
    if (opsRun.learned) o.push(`now favouring "${opsRun.learned}"`);
    if (opsRun.posts) o.push(`${opsRun.posts} post${opsRun.posts === 1 ? '' : 's'} drafted`);
    bits.push(o.length ? o.join(', ') : 'billing and content checked, nothing needed');
  }
  return bits.join(' · ');
}
