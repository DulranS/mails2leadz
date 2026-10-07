// lib/send-timing.js
// Best time to send, learned ONLY from the user's own sent emails and replies.
// Pure + runs in the browser, so hours are in the user's own timezone.
// No industry averages, no invented "potential improvement". If there isn't
// enough data it says so instead of guessing.

export const MIN_TOTAL_SENT = 30; // below this the pattern is noise
export const MIN_PER_WINDOW = 5; // a window needs this many sends to be ranked

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const toDate = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const hourLabel = (h) => {
  const f = (x) => `${x % 12 === 0 ? 12 : x % 12}${x % 24 < 12 ? 'am' : 'pm'}`;
  return `${f(h)}–${f((h + 3) % 24)}`;
};

/**
 * @param {Array<{sentAt: any, replied?: boolean}>} sent  one row per email sent
 * @returns {{ enough: boolean, sample: number, needed: number, overallRate?: number,
 *             best?: {day: string, window: string, rate: number, sent: number, replies: number},
 *             liftPct?: number }}
 */
export function computeSendTiming(sent = []) {
  const rows = (Array.isArray(sent) ? sent : [])
    .map((e) => ({ at: toDate(e?.sentAt), replied: e?.replied === true }))
    .filter((e) => e.at);
  const sample = rows.length;
  if (sample < MIN_TOTAL_SENT) return { enough: false, sample, needed: MIN_TOTAL_SENT };

  const overallReplies = rows.filter((r) => r.replied).length;
  const overallRate = overallReplies / sample;

  // 3-hour windows by weekday: big enough to have a sample, small enough to act on.
  const buckets = new Map();
  for (const r of rows) {
    const day = r.at.getDay();
    const start = Math.floor(r.at.getHours() / 3) * 3;
    const key = `${day}-${start}`;
    const b = buckets.get(key) || { day, start, sent: 0, replies: 0 };
    b.sent += 1;
    if (r.replied) b.replies += 1;
    buckets.set(key, b);
  }

  const ranked = [...buckets.values()]
    .filter((b) => b.sent >= MIN_PER_WINDOW && b.replies > 0)
    .map((b) => ({ ...b, rate: b.replies / b.sent }))
    .sort((a, b) => b.rate - a.rate || b.sent - a.sent);

  if (!ranked.length) return { enough: true, sample, needed: MIN_TOTAL_SENT, overallRate };

  const top = ranked[0];
  return {
    enough: true,
    sample,
    needed: MIN_TOTAL_SENT,
    overallRate,
    best: {
      day: DAY_NAMES[top.day],
      window: hourLabel(top.start),
      rate: top.rate,
      sent: top.sent,
      replies: top.replies,
    },
    liftPct: overallRate > 0 ? Math.round((top.rate / overallRate - 1) * 100) : null,
  };
}
