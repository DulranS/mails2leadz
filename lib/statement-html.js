// lib/statement-html.js - the statement page a customer opens from the link. Pure: returns HTML text.
// Every value is escaped; the page has no scripts and loads nothing from other sites.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n, cur = '') => `${cur ? esc(cur) + ' ' : ''}${(Number(n) || 0).toFixed(2)}`;
const AGING_LABEL = { current: 'Not yet due', days1to30: '1 to 30 days overdue', days31to60: '31 to 60 days overdue', days61to90: '61 to 90 days overdue', over90: 'Over 90 days overdue' };

export function renderStatementHtml({ business = '', statement, payLinks = {}, currency = '', expiresAt = null, generatedAt = new Date(), truncated = false } = {}) {
  const s = statement;
  const rows = s.lines.map((l) => `<tr><td>${esc(l.date)}</td><td>${esc(l.type)}</td><td>${esc(l.ref)}</td><td>${esc(l.description)}</td><td class="n">${l.debit ? money(l.debit, currency) : ''}</td><td class="n">${l.credit ? money(l.credit, currency) : ''}</td><td class="n">${money(l.balance, currency)}</td></tr>`).join('');
  const open = s.openInvoices.filter((i) => i.balance > 0).map((i) => {
    const link = payLinks[i.id];
    return `<tr><td>${esc(i.number)}</td><td>${esc(i.dueAt ? String(i.dueAt).slice(0, 10) : '')}</td><td class="n">${money(i.balance, currency)}</td><td>${link ? `<a href="${esc(link)}">Pay this invoice</a>` : 'Ask us how to pay'}</td></tr>`;
  }).join('');
  const aging = Object.keys(AGING_LABEL).map((k) => `<tr><td>${esc(AGING_LABEL[k])}</td><td class="n">${money(s.aging[k], currency)}</td></tr>`).join('');
  const outstanding = s.totals.outstanding;
  const balanceText = outstanding > 0 ? `Amount due: ${money(outstanding, currency)}` : outstanding < 0 ? `Credit balance in your favour: ${money(-outstanding, currency)}` : 'Nothing is owed.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Statement of account${business ? ' from ' + esc(business) : ''}</title>
<style>body{font-family:system-ui,sans-serif;color:#111827;background:#f9fafb;margin:0;padding:24px}main{max-width:820px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px}h1{font-size:20px;margin:0}h2{font-size:15px;margin:24px 0 8px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:8px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top}th{color:#6b7280;font-weight:600}.n{text-align:right;white-space:nowrap}.due{font-size:18px;font-weight:700;margin:16px 0}.muted{color:#6b7280;font-size:12px}a{color:#4338ca}</style></head>
<body><main>
<h1>Statement of account</h1>
<p>${business ? `<strong>${esc(business)}</strong><br>` : ''}For: ${esc(s.customerName || s.customerEmail)}${s.customerName ? ` &lt;${esc(s.customerEmail)}&gt;` : ''}</p>
<p class="due">${esc(balanceText)}</p>
<h2>Summary</h2>
<table><tr><th>Billed</th><th class="n">Paid</th><th class="n">Credited</th><th class="n">Outstanding</th></tr><tr><td>${money(s.totals.billed, currency)}</td><td class="n">${money(s.totals.paid, currency)}</td><td class="n">${money(s.totals.credited, currency)}</td><td class="n">${money(s.totals.outstanding, currency)}</td></tr></table>
${open ? `<h2>Open invoices</h2><table><tr><th>Invoice</th><th>Due</th><th class="n">Balance</th><th>Pay</th></tr>${open}</table>` : ''}
<h2>How long amounts have been due</h2>
<table>${aging}</table>
<h2>Activity</h2>
${truncated ? '<p class="muted">This account has more records than can be shown here, so this statement may be incomplete. Ask us for a full statement.</p>' : ''}
${s.lines.length ? `<table><tr><th>Date</th><th>Type</th><th>Ref</th><th>Details</th><th class="n">Charged</th><th class="n">Paid or credited</th><th class="n">Balance</th></tr>${rows}</table>` : '<p>No activity yet.</p>'}
<p class="muted">Generated ${esc(generatedAt.toISOString().slice(0, 10))}.${expiresAt ? ` This link expires on ${esc(new Date(expiresAt).toISOString().slice(0, 10))}.` : ''} Voided invoices are not shown. If anything here looks wrong, reply to the email this link came with.</p>
</main></body></html>`;
}
