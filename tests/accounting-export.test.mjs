// Accounting export: CSV safety (no formula injection), Xero's import columns, the ledger's signs, and the date range.
import assert from 'node:assert/strict';
import { csvCell, xeroInvoicesCsv, ledgerCsv, dmyDay } from '../lib/accounting-export.js';

// A small CSV reader for checking rows the way a spreadsheet would read them (quoted commas, doubled quotes).
function parseRow(line) {
  const out = []; let cur = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}
const rowsOf = (csv) => csv.split('\r\n').filter((l) => l).map(parseRow);

// Cells: formulas are neutralised, commas and quotes are escaped, and ordinary text is untouched.
assert.equal(csvCell('=HYPERLINK("http://x","go")'), `"'=HYPERLINK(""http://x"",""go"")"`, 'formula neutralised and escaped');
assert.equal(csvCell('+1 555'), `'+1 555`, 'leading plus neutralised');
assert.equal(csvCell('@sum'), `'@sum`, 'leading at-sign neutralised');
assert.equal(csvCell('Acme, Ltd'), '"Acme, Ltd"', 'comma quoted');
assert.equal(csvCell('say "hi"'), '"say ""hi"""', 'quotes doubled');
assert.equal(csvCell('Plain'), 'Plain');
assert.equal(csvCell(null), '');
assert.equal(csvCell(-20), '-20', 'a negative number stays a number (credit notes add up)');
assert.equal(csvCell('-20'), '-20', 'a numeric-looking negative string stays a number');
assert.equal(csvCell('-Acme'), "'-Acme", 'text starting with a minus is still neutralised');

const invoices = [
  { id: 'i1', email: 'a@x.com', businessName: 'Acme, Ltd', number: 'INV-1', amount: 100, taxAmount: 10, total: 110, status: 'partial', amountPaid: 50, issuedAt: '2026-01-15T10:00:00Z', dueAt: '2026-01-29T10:00:00Z', note: 'Consulting' },
  { id: 'i2', email: 'b@x.com', businessName: '=evil', number: 'INV-2', amount: 200, taxAmount: 0, total: 200, status: 'paid', amountPaid: 200, issuedAt: '2026-02-01T00:00:00Z', paidAt: '2026-02-10T00:00:00Z' },
  { id: 'i3', email: 'c@x.com', number: 'INV-3', amount: 5, total: 5, status: 'void', issuedAt: '2026-02-02T00:00:00Z' },
];
const credits = [{ customerEmail: 'a@x.com', number: 'CN-1', amount: 20, reason: 'Revision', status: 'open', issuedAt: '2026-02-20T00:00:00Z' }];

// Xero: Xero's column names, day/month/year dates, one line per invoice, void left out, tax type only where there is tax.
const xero = rowsOf(xeroInvoicesCsv(invoices, { accountCode: '200', taxType: 'Tax Exclusive' }));
assert.deepEqual(xero[0], ['*ContactName', 'EmailAddress', '*InvoiceNumber', 'Reference', '*InvoiceDate', '*DueDate', 'Total', 'InventoryItemCode', '*Description', '*Quantity', '*UnitAmount', '*AccountCode', '*TaxType', 'TaxAmount', 'Currency']);
assert.equal(xero.length, 3, 'header plus two invoices (void left out)');
assert.deepEqual(xero[1], ['Acme, Ltd', 'a@x.com', 'INV-1', '', '15/01/2026', '29/01/2026', '110', '', 'Consulting', '1', '100', '200', 'Tax Exclusive', '10', ''], 'taxed invoice row reads back exactly');
assert.equal(xero[2][12], '', 'untaxed invoice has no tax type');
assert.equal(xero[2][0], "'=evil", 'formula name neutralised in the Xero file');

// Date range is inclusive and by issue date.
const feb = rowsOf(xeroInvoicesCsv(invoices, { from: '2026-02-01', to: '2026-02-28' }));
assert.equal(feb.length, 2, 'only February invoices in the range (header + one)');
assert.equal(dmyDay('2026-02-05T00:00:00Z'), '05/02/2026', 'day/month/year with leading zeros');

// Ledger: one row per invoice and per credit note; credit notes are negative; sorted by date; void left out.
const ledger = rowsOf(ledgerCsv(invoices, credits));
assert.deepEqual(ledger[0], ['Date', 'Type', 'Number', 'Customer', 'Email', 'Description', 'Net', 'Tax', 'Total', 'Status', 'Paid', 'Paid date', 'Charged currency', 'Charged total']);
assert.equal(ledger.length, 1 + 2 + 1, 'header, two invoices, one credit note');
const cn = ledger.find((r) => r[1] === 'Credit note');
assert.equal(cn[6], '-20', 'credit note net is negative');
assert.equal(cn[8], '-20', 'credit note total is negative');
const dates = ledger.slice(1).map((r) => r[0]);
assert.deepEqual(dates, [...dates].sort(), 'rows in date order');
const total = ledger.slice(1).reduce((s, r) => s + Number(r[8]), 0);
assert.equal(Math.round(total * 100) / 100, 290, 'totals add up: 110 + 200 - 20 (void excluded)');

console.log('accounting-export tests: all passed');
