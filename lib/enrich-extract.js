// lib/enrich-extract.js - people and company size read from a business's own public website text, plus sitemap helpers.
// Ported from the Python enrichment script (enrich.py) and checked against its test expectations (test_worker.py).
// Pure: no network. Names come only from the public text of the business's own site.
export const MAX_TEXT_CHARS = 300000;
export const MAX_SITEMAP_CHARS = 400000;

const decodeEntities = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Visible text of an HTML page: scripts, styles and tags removed, entities decoded, whitespace collapsed. */
export function plainTextFromHtml(html) {
  return decodeEntities(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

// ---- people -----------------------------------------------------------------
// Words that should match in any case are written as [xX] classes: JavaScript cannot scope the i flag the way Python does.
const ci = (s) => s.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
const NAME_TOKEN = String.raw`(?:[A-Z][a-zA-Z'\u2019\-]+|[A-Z]\.)`;
const NAME = `${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){1,3}`;
const TITLE = '(?:' + [
  ci('chief executive officer'), ci('chief executive'), ci('chief operating officer'), ci('chief financial officer'),
  ci('chief technology officer'), ci('managing director'), ci('managing partner'), `${ci('co')}-?${ci('founder')}`, ci('founder'),
  ci('owner'), ci('president'), ci('principal'), ci('partner'), ci('ceo'), ci('cfo'), ci('cto'), ci('coo'), ci('vice president'),
  `${ci('head of')}[a-zA-Z]+`, `${ci('director')}(?: ${ci('of')} [a-zA-Z]+)?`,
].join('|') + ')';
const SEP = String.raw`[,|:()\-\u2013\u2014\u2022\u00b7/]`;
const DM_A = new RegExp(`(?<name>${NAME})\\s*${SEP}*\\s*(?<title>${TITLE})\\b`, 'g');
const DM_B = new RegExp(`(?<title>${TITLE})\\s*[:\\-\\u2013\\u2014|,]\\s*(?<name>${NAME})`, 'g');
const DM_C = new RegExp(`(?<kw>${ci('founded')}|${ci('owned')}|${ci('started')}|${ci('established')})\\s+${ci('by')}\\s+(?<name>${NAME})`, 'g');

const TITLE_WORDS = new Set(['founder', 'co-founder', 'cofounder', 'ceo', 'cfo', 'cto', 'coo', 'owner', 'director', 'president',
  'principal', 'partner', 'managing', 'chief', 'executive', 'officer', 'head', 'vice']);
const STOP_NAME_TOKENS = new Set(['our', 'the', 'meet', 'about', 'contact', 'us', 'team', 'read', 'more', 'privacy', 'policy', 'terms',
  'services', 'service', 'home', 'company', 'limited', 'ltd', 'inc', 'llc', 'group', 'solutions', 'get', 'in', 'touch', 'for', 'and',
  'with', 'your', 'we', 'are', 'a', 'an', 'of', 'to', 'from', 'by', 'at', 'on', 'is', 'it', 'this', 'that', 'hello', 'hi', 'welcome',
  'manager', 'email', 'phone', 'call', 'address', 'copyright', 'all', 'rights', 'reserved', 'best', 'top', 'why', 'how', 'what', 'new',
  'latest', 'news', 'blog', 'managing', 'chief', 'executive', 'officer', 'director', 'owner', 'founder', 'partner', 'president',
  'principal', 'head', 'vice']);
const TITLE_RANK = [['owner', 0], ['founder', 0], ['ceo', 1], ['chief executive', 1], ['managing director', 1], ['president', 2],
  ['principal', 2], ['managing partner', 2], ['partner', 3], ['director', 4], ['cfo', 5], ['cto', 5], ['coo', 5], ['chief', 5],
  ['vice president', 5], ['head of', 6]];

export function titleRank(title) {
  const t = String(title || '').toLowerCase();
  for (const [key, rank] of TITLE_RANK) if (t.includes(key)) return rank;
  return 9;
}

const trimDots = (t) => t.toLowerCase().replace(/^\.+|\.+$/g, '');
const trimPunct = (t) => t.toLowerCase().replace(/^[.,]+|[.,]+$/g, '');

/** A plausible person's name (2 to 4 words), or '' when the words are page furniture. */
export function cleanPersonName(name) {
  const toks = String(name || '').split(/\s+/).filter(Boolean);
  while (toks.length && TITLE_WORDS.has(trimDots(toks[toks.length - 1]))) toks.pop();
  while (toks.length && STOP_NAME_TOKENS.has(trimPunct(toks[0]))) toks.shift();
  if (toks.length < 2 || toks.length > 4 || toks.some((t) => STOP_NAME_TOKENS.has(trimPunct(t)))) return '';
  return toks.join(' ');
}

/** [{name, title}] for named leaders in the text, most senior first. "Owner" alone in marketing copy does not count. */
export function findDecisionMakers(text, limit = 3) {
  const t = String(text || '').slice(0, MAX_TEXT_CHARS);
  const found = new Map();
  for (const rx of [DM_A, DM_B]) {
    for (const m of t.matchAll(rx)) {
      const name = cleanPersonName(m.groups.name);
      if (name && !found.has(name)) found.set(name, m.groups.title.split(/\s+/).join(' '));
    }
  }
  for (const m of t.matchAll(DM_C)) {
    const name = cleanPersonName(m.groups.name);
    if (name && !found.has(name)) found.set(name, m.groups.kw.toLowerCase() === 'owned' ? 'Owner' : 'Founder');
  }
  return [...found.entries()]
    .map(([name, title]) => ({ name, title }))
    .sort((a, b) => titleRank(a.title) - titleRank(b.title))
    .slice(0, limit);
}

// ---- company size -----------------------------------------------------------
const THOUSANDS = /(?<=\d),(?=\d{3})/g;
const EMP_RANGE = /(?<![\d.])(\d{1,5})\s*(?:-|to|\u2013|\u2014)\s*(\d{1,5})\+?\s*(?:employees|team members|staff members|staff)\b/;
const EMP_OVER = /\b(?:over|more than|approximately|about|around)\s+(\d{1,5})\+?\s*(?:employees|team members|staff members|staff)\b/;
const EMP_SINGLE = /(?<![\d.])(\d{1,6})\+?\s*(?:employees|team members|staff members)\b/;
const TEAM_OF = /\bteam of (\d{1,5})\b/;
const SMALL_WORDS = /\b(?:startup|start-up|boutique|small team|family[- ]owned|family[- ]run|solo (?:founder|practitioner|entrepreneur))\b/;
const LARGE_WORDS = /\b(?:multinational|fortune 500|offices worldwide|offices in \d+ countries)\b/;

const sizeFromCount = (n) => (n < 50 ? 'small' : n < 250 ? 'medium' : 'large');

/** {size, strength}: strength 2 = an explicit headcount, 1 = a weak wording hint, 0 = nothing said. Takes lower-case text. */
export function estimateCompanySize(textLower) {
  const text = String(textLower || '').slice(0, MAX_TEXT_CHARS).replace(THOUSANDS, '');
  let m = EMP_RANGE.exec(text);
  if (m) return { size: sizeFromCount((Number(m[1]) + Number(m[2])) / 2), strength: 2 };
  m = EMP_OVER.exec(text);
  if (m) return { size: sizeFromCount(Number(m[1]) * 1.25), strength: 2 };
  for (const rx of [EMP_SINGLE, TEAM_OF]) {
    m = rx.exec(text);
    if (m) return { size: sizeFromCount(Number(m[1])), strength: 2 };
  }
  if (LARGE_WORDS.test(text)) return { size: 'large', strength: 1 };
  if (SMALL_WORDS.test(text)) return { size: 'small', strength: 1 };
  return { size: 'unknown', strength: 0 };
}

// ---- sitemaps ---------------------------------------------------------------
/** Every <loc> address in a sitemap (or sitemap index). */
export function sitemapLocs(xml) {
  const out = [];
  for (const m of String(xml || '').slice(0, MAX_SITEMAP_CHARS).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) out.push(decodeEntities(m[1]));
  return out;
}

const SEED_WORDS = new Set(['contact', 'contacts', 'about', 'team', 'staff', 'people', 'leadership', 'meet', 'management', 'founders']);
const SKIP_WORDS = new Set(['blog', 'news', 'shop', 'product', 'products', 'cart', 'tag', 'tags', 'category', 'categories', 'feed', 'author', 'wp']);

/** Is this path a page worth reading for contacts or people (contact, about, team...)? Whole words only, never blog or shop pages. */
export function isSiteSeedPath(pathname) {
  const tokens = String(pathname || '').toLowerCase().split(/[\/\-_.]+/).filter(Boolean);
  if (!tokens.length || tokens.some((t) => SKIP_WORDS.has(t))) return false;
  return tokens.some((t) => SEED_WORDS.has(t));
}
