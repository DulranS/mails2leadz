// lib/custom-field-import.js - maps the columns of an imported CSV onto the owner's custom fields and checks every cell (pass 405). Pure.
// A column maps to a field only when its header equals the field's label, ignoring case and spaces. Columns with no mapping are ignored.
// Each cell is checked with sanitizeValue (lib/custom-fields.js). A cell that does not fit is rejected with a reason; nothing is guessed.
import { sanitizeDefinitions, sanitizeValue } from './custom-fields.js';

export const CUSTOM_IMPORT_MAX_ROWS = 2000;
const squash = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');
const isEmpty = (v) => v === undefined || v === null || String(v).trim() === '';

/** The header that matches each field's label exactly (ignoring case and spaces). Returns { fieldKey: header }. */
export function suggestMapping(headers = [], defs = []) {
  const byLabel = new Map();
  for (const h of Array.isArray(headers) ? headers : []) {
    const k = squash(h);
    if (k && !byLabel.has(k)) byLabel.set(k, h);
  }
  const mapping = {};
  const used = new Set();
  for (const d of sanitizeDefinitions(defs)) {
    const header = byLabel.get(squash(d.label));
    if (header !== undefined && !used.has(header)) {
      mapping[d.key] = header;
      used.add(header);
    }
  }
  return mapping;
}

/** The plain reason a non-empty cell was rejected. */
export function rejectReason(type, options = null) {
  if (type === 'number') return 'Not a number.';
  if (type === 'currency') return 'Not an amount. Use digits, such as 1200 or 1200.50.';
  if (type === 'date') return 'Not a real date. Use YYYY-MM-DD.';
  if (type === 'yesno') return 'Not yes or no.';
  if (type === 'select') return `Not one of the options: ${(options || []).join(', ')}.`;
  return 'Could not be read as text.';
}

/**
 * The preview of a custom-field import. Only the mapped columns are read, and only the defined fields are checked.
 * @param {object[]} rows rows keyed by the file's headers
 * @param {{mapping?: Record<string,string>, defs?: object[]}} opts mapping from suggestMapping (the owner may change it)
 * @returns {{ rows: {index:number, values:object, rejected:{key:string,label:string,raw:string,reason:string}[]}[],
 *   fields: {key:string,label:string,type:string,column:string}[], unmappedColumns: string[],
 *   stats: {rows:number, tooMany:boolean, valuesKept:number, rejectedCells:number, rowsWithRejects:number} }}
 *   Empty cells are neither kept nor rejected. index is the row's position in the file, from 0.
 */
export function previewCustomImport(rows = [], { mapping = {}, defs = [] } = {}) {
  const fields = sanitizeDefinitions(defs).filter((f) => typeof mapping?.[f.key] === 'string' && mapping[f.key] !== '');
  const all = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r === 'object');
  const list = all.slice(0, CUSTOM_IMPORT_MAX_ROWS);
  const mapped = new Set(fields.map((f) => mapping[f.key]));
  const headers = [...new Set(list.slice(0, 50).flatMap((r) => Object.keys(r)))];
  const out = [];
  let valuesKept = 0;
  let rejectedCells = 0;
  let rowsWithRejects = 0;

  list.forEach((row, index) => {
    const values = {};
    const rejected = [];
    for (const f of fields) {
      const raw = row[mapping[f.key]];
      if (isEmpty(raw)) continue;
      const v = sanitizeValue(f.type, raw, f.options || null);
      if (v === null) rejected.push({ key: f.key, label: f.label, raw: String(raw).slice(0, 80), reason: rejectReason(f.type, f.options) });
      else { values[f.key] = v; valuesKept++; }
    }
    if (rejected.length) { rowsWithRejects++; rejectedCells += rejected.length; }
    out.push({ index, values, rejected });
  });

  return {
    rows: out,
    fields: fields.map((f) => ({ key: f.key, label: f.label, type: f.type, column: mapping[f.key] })),
    unmappedColumns: headers.filter((h) => !mapped.has(h)),
    stats: { rows: list.length, tooMany: all.length > CUSTOM_IMPORT_MAX_ROWS, valuesKept, rejectedCells, rowsWithRejects },
  };
}
