// app/api/exports/accounting/route.js - CSV for the accountant: Xero invoice import, or a ledger for any bookkeeping tool.
// Signed-in owner only. Read-only: it changes nothing.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { xeroInvoicesCsv, ledgerCsv } from '../../../../lib/accounting-export.js';
import { loadAccountRecords } from '../../../../lib/server/statement.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FORMATS = ['xero', 'ledger'];

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const sp = new URL(request.url).searchParams;
  const format = sp.get('format') || '';
  const from = sp.get('from') || '';
  const to = sp.get('to') || '';
  if (!FORMATS.includes(format)) return NextResponse.json({ error: 'Choose a format: xero or ledger.' }, { status: 400, headers: NO_STORE });
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return NextResponse.json({ error: 'Dates must be YYYY-MM-DD.' }, { status: 400, headers: NO_STORE });
  if (from && to && from > to) return NextResponse.json({ error: 'The start date is after the end date.' }, { status: 400, headers: NO_STORE });
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  try {
    const records = await loadAccountRecords(db, who.uid);
    const csv = format === 'xero'
      ? xeroInvoicesCsv(records.invoices, { from, to, accountCode: (sp.get('accountCode') || '200').slice(0, 20), taxType: (sp.get('taxType') || '').slice(0, 40) })
      : ledgerCsv(records.invoices, records.credits, { from, to });
    const name = `autoleads-${format}-${from || 'start'}-to-${to || 'today'}.csv`;
    return new Response('\uFEFF' + csv, { headers: { ...NO_STORE, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` } });
  } catch (e) {
    console.error('[exports/accounting] failed:', String(e?.message || '').slice(0, 120));
    return NextResponse.json({ error: 'Could not build the export. Try again in a minute.' }, { status: 500, headers: NO_STORE });
  }
}
