// app/api/partners/statement/route.js - a partner's own statement, opened from the signed link the operator sends (pass 348).
// PUBLIC on purpose (no sign-in): the signed token is the proof. Without PARTNER_LINK_SECRET, or with a token that does not check out,
// it shows "not valid". It shows dates, kinds and amounts only, never the companies the partner brought.
import { getDb } from '../../../../lib/server/route-helpers.js';
import { collection, getDocs, query, where } from '../../../../lib/server-firestore.js';
import { getPartner, LEDGER, partnerTermsFromEnv } from '../../../../lib/server/software-partners.js';
import { checkStatementToken, statementFor, partnerBalances, statementHtml } from '../../../../lib/software-partners.js';

const page = (status, body) => new Response(body, {
  status,
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  },
});
const notValid = () => page(404, '<!doctype html><meta charset="utf-8"><title>Statement</title><p style="font-family:system-ui;padding:16px">This statement link is not valid.</p>');

export async function GET(request) {
  const code = checkStatementToken(new URL(request.url).searchParams.get('token') || '', process.env.PARTNER_LINK_SECRET || '');
  if (!code) return notValid();
  try {
    const db = getDb();
    const partner = await getPartner(db, code);
    if (!partner) return notValid();
    const snap = await getDocs(query(collection(db, LEDGER), where('code', '==', code)));
    const entries = snap.docs.map((d) => d.data());
    const { minPayoutMinor } = partnerTermsFromEnv();
    const balances = partnerBalances(entries, { minPayoutMinor });
    const currencies = [...new Set(entries.map((e) => e.currency))].sort();
    const sections = currencies.map((currency) => {
      const b = balances.find((x) => x.currency === currency) || { payable: 0, eligible: false };
      return { currency, lines: statementFor(entries, code, currency), payable: b.payable, eligible: b.eligible, minPayoutMinor };
    });
    return page(200, statementHtml({ partner: { code, name: partner.name }, sections, generatedAt: new Date().toISOString().slice(0, 10) }));
  } catch {
    return page(503, '<!doctype html><meta charset="utf-8"><title>Statement</title><p style="font-family:system-ui;padding:16px">The statement is not available right now. Please try again later.</p>');
  }
}
