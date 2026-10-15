// lib/inbound.js - pure rules for INBOUND enquiries (someone fills in the owner's form / link-in-bio page / website embed).
// No network, no Firebase, no AI. The public endpoint (app/api/inbound) and the hosted page (app/enquire) both use this.
//
// Why inbound gets its own path: an enquiry is the warmest lead there is, and how fast it is answered decides most of the
// outcome. So an enquiry becomes a deal (source "inbound", with the channel it came from) and a reply is drafted at once,
// waiting in the owner's review queue. Nothing is ever sent without the owner pressing Send.

export const MAX_FIELD = { name: 80, email: 120, phone: 30, company: 100, message: 1500, src: 40, campaign: 60 };
export const INBOUND_DRAFTS_PER_DAY = 20; // AI-drafted replies per owner per day: a spam burst can never become an AI bill
export const INBOUND_PER_KEY_PER_HOUR = 60; // stored enquiries per key per hour, whatever happens

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"/]+@[^\s@<>()[\]\\,;:"/]+\.[^\s@<>()[\]\\,;:"/]{2,}$/; // "/" is excluded: the address becomes part of a database id
const URL_RE = /(https?:\/\/|www\.)\S+/gi;

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max);

/** "Instagram Bio", "instagram-bio", "IG!!" -> a short, safe tag: letters, digits, dash. Empty stays empty. */
export function normalizeSrc(v) {
  return String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_FIELD.src);
}

/** A link tagged ref-<customer> was made for one customer to pass on: whoever uses it is a REFERRAL from that customer. */
export const isReferralSrc = (src) => /^ref-[a-z0-9-]{1,36}$/.test(String(src || ''));

const CHANNELS = {
  instagram: 'Instagram', ig: 'Instagram', linkedin: 'LinkedIn', facebook: 'Facebook', fb: 'Facebook', tiktok: 'TikTok',
  x: 'X (Twitter)', twitter: 'X (Twitter)', youtube: 'YouTube', whatsapp: 'WhatsApp', website: 'Website', web: 'Website',
  google: 'Google', qr: 'QR code / print', flyer: 'QR code / print', email: 'Email signature', referral: 'Referral', form: 'Enquiry form',
};

/** Human label for a channel tag; unknown tags are shown as the owner typed them (capitalised). */
export function channelLabel(src) {
  const s = normalizeSrc(src);
  if (!s) return 'Direct / not tagged';
  if (isReferralSrc(s)) return `Referral: ${s.slice(4).replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) || 'a customer'}`;
  const first = s.split('-')[0];
  return CHANNELS[s] || CHANNELS[first] || s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
}

/**
 * Whatever a visitor's browser sent -> a clean enquiry, or a reason it was refused.
 * @returns {{ok:true, enquiry:object} | {ok:false, spam?:boolean, error:string}}
 *  spam = true means "answer 200 and store nothing": a bot must not learn what tripped it.
 */
export function sanitizeEnquiry(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  // Honeypot: a field real people never see (hidden by CSS) and bots fill in.
  if (String(r.company_site ?? r.hp ?? '').trim()) return { ok: false, spam: true, error: 'spam' };
  const email = clean(r.email, MAX_FIELD.email).toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Please enter a valid email address.' };
  const message = clean(r.message, MAX_FIELD.message);
  const links = (message.match(URL_RE) || []).length;
  if (links > 2) return { ok: false, spam: true, error: 'spam' };
  const name = clean(r.name, MAX_FIELD.name);
  const phone = clean(r.phone, MAX_FIELD.phone).replace(/[^\d+()\-.\s]/g, '').replace(/\s+/g, ' ').trim();
  return {
    ok: true,
    enquiry: {
      email,
      name,
      phone,
      company: clean(r.company, MAX_FIELD.company),
      message,
      src: normalizeSrc(r.src),
      campaign: normalizeSrc(r.campaign).slice(0, MAX_FIELD.campaign),
    },
  };
}

/** One enquiry doc per owner / day / email, so a double-click or a re-submit never creates a second draft. */
export const enquiryDocId = (uid, email, now = new Date()) => `${uid}_${now.toISOString().slice(0, 10).replace(/-/g, '')}_${String(email).toLowerCase()}`;

/** Short context line shown above the draft in the review window. */
export function enquiryContext(e) {
  const who = [e.name, e.company].filter(Boolean).join(', ');
  const via = e.src ? ` via ${channelLabel(e.src)}` : '';
  const msg = e.message ? `: "${e.message.slice(0, 280)}${e.message.length > 280 ? '…' : ''}"` : '';
  return `Enquiry${who ? ` from ${who}` : ''}${via}${msg}`.slice(0, 420);
}

/** Hours since a timestamp (ms), floored; null when unknown. */
export function hoursSince(ms, now = Date.now()) {
  return Number.isFinite(ms) && ms > 0 ? Math.max(0, Math.floor((now - ms) / 3600000)) : null;
}

/** The personal enquiry link a customer can pass on. `origin` is the app's address; the tag names the customer so the referral is credited. */
export function buildReferralLink({ origin, key, customerName }) {
  const slug = normalizeSrc(customerName).slice(0, 30).replace(/-+$/g, '');
  const base = String(origin || '').replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/]+$/.test(base) || !key) return '';
  return `${base}/enquire?k=${encodeURIComponent(key)}&src=ref-${slug || 'customer'}`;
}
