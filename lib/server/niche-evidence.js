// lib/server/niche-evidence.js - reads the owner's own sent emails + deals and returns plain evidence lines
// ("plumbers: 24 emailed, 5 replied (21%), 1 won") for the AI target finder. Never throws: no evidence just means no lines.
import { collection, getDocs, query, where, limit } from '../server-firestore.js';
import { computeNicheStats, nicheEvidenceLines } from '../niche.js';

const tms = (v) => { if (!v) return 0; if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime(); const t = new Date(v).getTime(); return Number.isFinite(t) ? t : 0; };

export async function nicheEvidenceFor(db, uid) {
  try {
    const rd = async (coll, n) => (await getDocs(query(collection(db, coll), where('userId', '==', uid), limit(n)))).docs.map((d) => d.data());
    const [sent, deals] = await Promise.all([rd('sent_emails', 3000), rd('deals', 2000).catch(() => [])]);
    const emails = sent.map((x) => ({ to: String(x.to || '').toLowerCase(), category: x.category || '', replied: !!x.replied, t: tms(x.sentAt) || tms(x.createdAt) }));
    const dealsByEmail = new Map(deals.filter((d) => d?.email).map((d) => [String(d.email).toLowerCase(), d]));
    return nicheEvidenceLines(computeNicheStats({ emails, dealsByEmail }));
  } catch {
    return [];
  }
}
