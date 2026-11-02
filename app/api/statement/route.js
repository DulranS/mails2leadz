// app/api/statement/route.js - PUBLIC (listed in proxy.js). The customer opens their statement from a signed, expiring link.
// It shows only that one customer's invoices and credit notes, and never anything else in the account.
import { getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { doc, getDoc } from '../../../lib/server-firestore.js';
import { verifyStatementToken } from '../../../lib/statement-token.js';
import { buildStatement } from '../../../lib/statement.js';
import { renderStatementHtml } from '../../../lib/statement-html.js';
import { loadAccountRecords } from '../../../lib/server/statement.js';
import { signPayToken } from '../../../lib/server/payments.js';

const html = (body, status = 200) => new Response(body, { status, headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'" } });
const notice = (text, status) => html(`<!doctype html><meta charset="utf-8"><title>Statement</title><p style="font-family:system-ui;padding:24px">${text}</p>`, status);

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('t') || '';
  const who = verifyStatementToken(token);
  if (!who) return notice('This statement link is not valid or has expired. Reply to the email and ask for a new one.', 400);
  try {
    const db = getDb();
    const [records, biz] = await Promise.all([loadAccountRecords(db, who.uid), getDoc(doc(db, 'users', who.uid, 'settings', 'business'))]);
    const profile = biz.exists() ? (biz.data().profile || {}) : {};
    const statement = buildStatement({
      invoices: records.invoices,
      credits: records.credits,
      customerEmail: who.email,
      customerName: records.invoices.find((i) => String(i.email || '').toLowerCase() === who.email)?.businessName || '',
    });
    // Pay links only when the public address is https (the pay page must be reachable by the customer).
    const base = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
    const payLinks = {};
    if (/^https:\/\//i.test(base)) {
      for (const inv of statement.openInvoices) {
        const t = signPayToken(who.uid, inv.id);
        if (t) payLinks[inv.id] = `${base}/api/pay?t=${t}`;
      }
    }
    return html(renderStatementHtml({ business: String(profile.businessName || ''), statement, payLinks, expiresAt: who.expiresAt, truncated: records.truncated }));
  } catch (e) {
    console.error('[statement] failed:', String(e?.message || '').slice(0, 120));
    return notice('The statement is not available right now. Please try again in a few minutes.', 500);
  }
}
