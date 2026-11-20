// lib/customers-csv.js - the customer list as a CSV, with the owner's own custom fields as extra columns (pass 340). Pure.
// Customers with a deal take their values from the deal; customers without one take them from the saved values by email.
import { csvLine } from './accounting-export.js';
import { sanitizeDefinitions } from './custom-fields.js';

export const CUSTOMER_BASE_COLUMNS = ['Name', 'Email', 'Company', 'Stage', 'Value', 'Currency'];

const lower = (s) => String(s || '').trim().toLowerCase();

/** One custom value as text for the sheet: yes or no for yes/no fields, blank when not set. */
export function customValueText(type, value) {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'yesno') return value === true || value === 'yes' ? 'Yes' : 'No';
  return String(value);
}

/** The CSV text: a header row, then one row per customer. Customers with values but no deal are included too. */
export function customersCsv({ deals = [], extraFields = {}, defs = [] } = {}) {
  const fields = sanitizeDefinitions(defs);
  const header = [...CUSTOMER_BASE_COLUMNS, ...fields.map((f) => f.label)];
  const lines = [csvLine(header)];
  const seen = new Set();
  for (const d of Array.isArray(deals) ? deals : []) {
    const email = lower(d?.email);
    if (email) seen.add(email);
    const values = (d?.customFields && typeof d.customFields === 'object') ? d.customFields : (extraFields[email] || {});
    lines.push(csvLine([
      d?.name || d?.contactName || '',
      email,
      d?.company || '',
      d?.stage || '',
      d?.value ?? '',
      d?.currency || '',
      ...fields.map((f) => customValueText(f.type, values[f.key])),
    ]));
  }
  for (const [email, values] of Object.entries(extraFields || {})) {
    if (seen.has(lower(email))) continue;
    lines.push(csvLine(['', lower(email), '', '', '', '', ...fields.map((f) => customValueText(f.type, values?.[f.key]))]));
  }
  return lines.join('\r\n') + '\r\n';
}

/** Saves text as a file in the browser. A no-op outside the browser. */
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
