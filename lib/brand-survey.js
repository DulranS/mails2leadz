// lib/brand-survey.js (v401): brand survey counts. The owner types in the counts from a survey run outside the app (a short poll, a survey tool).
// Three measures, each as a share of the people who answered:
//   aware      - had heard of the business (the question "have you heard of us?")
//   recalled   - named the business without being prompted ("which firms do you know in this area?"). Unprompted recall can never be more than awareness.
//   favourable - rated the business positively, on the question the owner asked. Can never be more than awareness.
// Only counts are kept. No individual answer is stored. Pure: nothing is guessed.

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s) => YMD.test(s) && new Date(Date.parse(`${s}T00:00:00Z`)).toISOString().slice(0, 10) === s;
const r1 = (n) => Math.round(n * 10) / 10;

/** A whole number, 0 or more. Blank is "not asked" (null). Anything else is an error, returned as { bad: true }. */
function count(v) {
  if (v === '' || v === null || v === undefined) return { value: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) return { bad: true };
  return { value: n };
}

/** @returns {{ entry: object } | { error: string }} */
export function sanitizeBrandSurvey(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'Nothing to save.' };
  const date = String(raw.date || '');
  if (!validDate(date)) return { error: 'Pick the date the survey closed.' };
  const sample = count(raw.sample);
  if (sample.bad || sample.value === null || sample.value < 1) return { error: 'Enter how many people answered (at least one).' };
  const aware = count(raw.aware);
  if (aware.bad || aware.value === null) return { error: 'Enter how many had heard of you (0 or more).' };
  if (aware.value > sample.value) return { error: 'More people said they had heard of you than answered. Check the counts.' };
  const recalled = count(raw.recalled);
  if (recalled.bad) return { error: 'Unprompted recall must be a whole number, 0 or more.' };
  if (recalled.value !== null && recalled.value > aware.value) return { error: 'Unprompted recall cannot be more than awareness.' };
  const favourable = count(raw.favourable);
  if (favourable.bad) return { error: 'Favourable must be a whole number, 0 or more.' };
  if (favourable.value !== null && favourable.value > aware.value) return { error: 'Favourable cannot be more than awareness.' };
  return {
    entry: {
      date,
      sample: sample.value,
      aware: aware.value,
      recalled: recalled.value,
      favourable: favourable.value,
    },
  };
}

const pct = (part, whole) => (whole > 0 ? r1((part / whole) * 100) : null);

/** The latest survey, its three shares, and the change in awareness against the survey before it. */
export function brandSummary(surveys) {
  const list = Array.isArray(surveys) ? surveys.filter((s) => s && validDate(s.date)) : [];
  if (list.length === 0) return { surveys: 0, latest: null, awarePointsChange: null };
  const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const shares = (s) => ({
    date: s.date,
    sample: s.sample,
    awarePct: pct(s.aware, s.sample),
    recallPct: s.recalled === null || s.recalled === undefined ? null : pct(s.recalled, s.sample),
    favourablePct: s.favourable === null || s.favourable === undefined ? null : pct(s.favourable, s.sample),
  });
  const latest = shares(sorted[0]);
  const before = sorted[1] ? shares(sorted[1]) : null;
  const awarePointsChange = before && latest.awarePct !== null && before.awarePct !== null ? r1(latest.awarePct - before.awarePct) : null;
  return { surveys: list.length, latest, previous: before, awarePointsChange };
}
