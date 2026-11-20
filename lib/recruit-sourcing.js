// lib/recruit-sourcing.js - the candidate sourcing step for recruitment mode (pass 331). Pure: nothing is sent or stored here.
// It takes the owner's OWN candidate list (a CRM or ATS export, a job-board export, referrals) and a role brief, and keeps
// the rows worth an approach: contactable, not excluded, not opted out, and scored against the brief's skills, best first.
// The kept rows then go through the same list import and lawful-basis gate as any other list (find-leads import-list).
// It does not search the open web for people: no public candidate-search source is wired in.

const MAX_WORDS = 30;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const words = (v) => [...new Set(String(v ?? '').split(/[,;\n]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, MAX_WORDS);

export function normaliseBrief(b = {}) {
  const minScore = Number(b.minScore);
  return {
    role: String(b.role ?? '').trim().slice(0, 120),
    mustHave: words(b.mustHave),
    niceToHave: words(b.niceToHave),
    location: String(b.location ?? '').trim().slice(0, 120),
    excludeCompanies: words(b.excludeCompanies),
    minScore: Number.isFinite(minScore) ? Math.max(0, Math.min(100, minScore)) : 0,
  };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, k) => new RegExp(`(^|[^a-z0-9])${escapeRe(k)}($|[^a-z0-9])`).test(text);

/** Score 0-100 against the brief. Must-have skills weigh 70% and nice-to-have 30% when both are given. */
export function scoreCandidate(text, brief) {
  const t = String(text ?? '').toLowerCase();
  const must = brief.mustHave.filter((k) => hasWord(t, k));
  const nice = brief.niceToHave.filter((k) => hasWord(t, k));
  const mustPart = brief.mustHave.length ? must.length / brief.mustHave.length : 0;
  const nicePart = brief.niceToHave.length ? nice.length / brief.niceToHave.length : 0;
  let score;
  if (brief.mustHave.length && brief.niceToHave.length) score = 0.7 * mustPart + 0.3 * nicePart;
  else if (brief.mustHave.length) score = mustPart;
  else score = nicePart;
  return {
    score: Math.round(score * 100),
    matched: [...must, ...nice],
    missing: brief.mustHave.filter((k) => !must.includes(k)),
  };
}

const norm = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const pick = (row, keys) => {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

/** Turns the owner's rows into import rows (the same column names a scraped list uses), best fit first. */
// ICO (finding candidates): privacy information must be given "as soon as possible, and by no later than one month" of
// obtaining the data. Returns the same day one calendar month on (end-of-month clamped), as YYYY-MM-DD.
export function addOneMonthIso(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const first = new Date(Date.UTC(y, m, 1)); // index m is the month after the sourced one
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1; // 1-based target month
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export function prepareCandidates(rows, brief, { source = '', lawfulBasis = '', max = 500, now = '' } = {}) {
  const stats = { rows: 0, kept: 0, noName: 0, noContact: 0, optedOut: 0, excludedCompany: 0, belowMinScore: 0, tooMany: 0 };
  const rejected = [];
  const sourcedOn = /^\d{4}-\d{2}-\d{2}$/.test(now) ? now : new Date().toISOString().slice(0, 10);
  const noticeBy = addOneMonthIso(sourcedOn);
  if (!String(source).trim()) return { error: 'Say where this list came from (the source).', rows: [], stats, rejected };
  if (!String(lawfulBasis).trim()) return { error: 'Say why you may contact these people (the lawful basis).', rows: [], stats, rejected };

  const kept = [];
  for (const raw of Array.isArray(rows) ? rows : []) {
    stats.rows++;
    const r = {};
    for (const [k, v] of Object.entries(raw ?? {})) r[norm(k)] = v;
    const name = pick(r, ['name', 'fullname', 'candidate', 'candidatename']);
    const title = pick(r, ['title', 'jobtitle', 'role', 'position', 'headline']);
    const company = pick(r, ['company', 'employer', 'currentcompany', 'organisation', 'organization']);
    const location = pick(r, ['location', 'city', 'town', 'address']);
    const skills = pick(r, ['skills', 'keywords', 'tags', 'experience', 'summary', 'notes']);
    const profile = pick(r, ['linkedin', 'profileurl', 'url', 'website', 'portfolio']);
    const emailRaw = pick(r, ['email', 'emailaddress']).toLowerCase();
    const email = EMAIL.test(emailRaw) ? emailRaw : '';
    const phone = pick(r, ['phone', 'mobile', 'whatsapp', 'phonenumber']).replace(/[^0-9+]/g, '');
    const consent = pick(r, ['consent', 'optedin']).toLowerCase();

    if (!name) { stats.noName++; rejected.push({ row: stats.rows + 1, reason: 'no name' }); continue; }
    if (!email && phone.replace(/\D/g, '').length < 7 && !profile) { stats.noContact++; rejected.push({ row: stats.rows + 1, reason: 'no way to contact' }); continue; }
    if (['no', 'false', 'n', 'opted out', 'opt-out'].includes(consent)) { stats.optedOut++; rejected.push({ row: stats.rows + 1, reason: 'opted out' }); continue; }
    if (company && brief.excludeCompanies.some((c) => company.toLowerCase().includes(c))) { stats.excludedCompany++; rejected.push({ row: stats.rows + 1, reason: 'excluded company' }); continue; }

    const { score, matched, missing } = scoreCandidate([title, skills, company].join(' | '), brief);
    if (score < brief.minScore) { stats.belowMinScore++; rejected.push({ row: stats.rows + 1, reason: 'below minimum score' }); continue; }
    const note = [`${score}% fit`, matched.length ? `has ${matched.slice(0, 4).join(', ')}` : '', missing.length ? `missing ${missing.slice(0, 3).join(', ')}` : '']
      .filter(Boolean).join(' · ');
    kept.push({
      score,
      name,
      category: [title || brief.role || 'Candidate', company].filter(Boolean).join(' · ').slice(0, 60) + ' · ' + note,
      address: location,
      email,
      phone: phone.replace(/\D/g, '').length >= 7 ? phone : '',
      website: /^https?:\/\//i.test(profile) ? profile : '',
    });
  }
  kept.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const out = kept.slice(0, max);
  stats.tooMany = kept.length - out.length;
  stats.kept = out.length;
  return { rows: out.map(({ score, ...row }) => row), stats, rejected, error: '', noticeBy };
}
