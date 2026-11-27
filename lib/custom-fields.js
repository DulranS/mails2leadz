// lib/custom-fields.js - the owner's own fields for a customer (pass 338): the field definitions the owner sets up once, and the
// values kept on each customer's deal (one deal per customer, so the values sit with the customer they describe). Pure.
// Types: text, number, date (YYYY-MM-DD), yesno, select (a choice from the owner's own list, v402), currency (a money amount, v402,
// kept to two decimals). Unknown keys are dropped, so a bad or old value never reaches the database.

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'yesno', 'select', 'currency'];
export const MAX_CUSTOM_FIELDS = 10;
export const SELECT_OPTIONS = { min: 2, max: 20, length: 40 }; // v402: a choice field needs 2 to 20 options, each up to 40 characters
const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** A stable key from a label. Labels with no Latin letters or digits fall back to a numbered key, so every field has one. */
export function fieldKey(label, index = 0) {
  let k = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36);
  if (!k) k = `field_${index + 1}`;
  if (!/^[a-z]/.test(k)) k = `f_${k}`;
  return KEY_RE.test(k) ? k : `field_${index + 1}`;
}

/** The cleaned, unique options of a choice field (blank and repeated options are dropped). */
export function cleanOptions(list) {
  const out = [];
  const raw = Array.isArray(list) ? list : String(list ?? '').split(',');
  for (const o of raw) {
    const s = clean(o, SELECT_OPTIONS.length);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= SELECT_OPTIONS.max) break;
  }
  return out;
}

/**
 * The owner's definitions, cleaned: a label and a known type each, at most MAX_CUSTOM_FIELDS, unique keys.
 * A definition with no label or an unknown type is dropped. A choice field with fewer than two options is dropped too.
 */
export function sanitizeDefinitions(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    if (out.length >= MAX_CUSTOM_FIELDS) break;
    const label = clean(raw?.label, 60);
    const type = CUSTOM_FIELD_TYPES.includes(raw?.type) ? raw.type : null;
    if (!label || !type) continue;
    let options = null;
    if (type === 'select') {
      options = cleanOptions(raw.options);
      if (options.length < SELECT_OPTIONS.min) continue;
    }
    const base = fieldKey(label, out.length);
    let key = base;
    for (let n = 2; seen.has(key); n++) key = `${base.slice(0, 36)}_${n}`;
    seen.add(key);
    out.push(options ? { key, label, type, options } : { key, label, type });
  }
  return out;
}

/** One value checked against its type. Returns null when it is empty or does not fit the type. */
export function sanitizeValue(type, v, options = null) {
  if (v === undefined || v === null || v === '') return null;
  if (type === 'number' || type === 'currency') {
    const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  if (type === 'select') {
    const s = clean(v, SELECT_OPTIONS.length);
    return Array.isArray(options) && options.includes(s) ? s : null;
  }
  if (type === 'yesno') {
    if (v === true || v === 'yes' || v === 'Yes') return true;
    if (v === false || v === 'no' || v === 'No') return false;
    return null;
  }
  if (type === 'date') {
    const s = clean(v, 10);
    if (!DAY_RE.test(s)) return null;
    const t = Date.parse(`${s}T00:00:00Z`);
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? s : null;
  }
  // text (and any value with no definition to check against, which is kept as plain text or a number or a yes/no)
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  const s = clean(v, 200);
  return s || null;
}

/**
 * The values to store. With definitions, only the defined keys are kept and each is checked against its type.
 * Without them (the deal write, which does not know the definitions), keys must look like field keys and values are
 * checked by what they are. At most MAX_CUSTOM_FIELDS values are kept. Empty values are left out.
 */
export function sanitizeCustomValues(input, defs = null) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  if (Array.isArray(defs)) {
    for (const d of defs) {
      if (Object.keys(out).length >= MAX_CUSTOM_FIELDS) break;
      const v = sanitizeValue(d.type, input[d.key], d.options || null);
      if (v !== null) out[d.key] = v;
    }
    return out;
  }
  for (const [key, raw] of Object.entries(input)) {
    if (Object.keys(out).length >= MAX_CUSTOM_FIELDS) break;
    if (!KEY_RE.test(key)) continue;
    const v = sanitizeValue(null, raw);
    if (v !== null) out[key] = v;
  }
  return out;
}

/** The rows the editor shows: each definition with its current value (null when not set). */
export function customFieldRows(defs, values) {
  const have = values && typeof values === 'object' ? values : {};
  return sanitizeDefinitions(defs).map((d) => ({ ...d, value: have[d.key] ?? null }));
}

// Pass 341: filters on the customer list. Each filter is one field, one operator and one value; a customer must pass every filter.
// yes/no: equals yes or no. number and currency: at least or at most. date: before or after (strictly, the day itself does not count).
// text: contains (not case-sensitive). select (v402): equals one of the owner's options.
export const FILTER_OPS = {
  yesno: ['equals'],
  number: ['atLeast', 'atMost'],
  currency: ['atLeast', 'atMost'],
  select: ['equals'],
  date: ['before', 'after'],
  text: ['contains'],
};

/**
 * One filter, checked against the field definition it names. Returns the cleaned filter, or null when it cannot filter anything
 * (no such field, an operator that does not fit the field's type, or an empty or badly formed value). A null filter is ignored.
 */
export function sanitizeFilter(f, defs = []) {
  const def = sanitizeDefinitions(defs).find((d) => d.key === f?.key);
  if (!def) return null;
  const op = String(f?.op || '');
  if (!(FILTER_OPS[def.type] || []).includes(op)) return null;
  let value;
  if (def.type === 'yesno') {
    if (f.value === 'yes' || f.value === true) value = true;
    else if (f.value === 'no' || f.value === false) value = false;
    else return null;
  } else if (def.type === 'select') {
    value = clean(f.value, SELECT_OPTIONS.length);
    if (!def.options.includes(value)) return null;
  } else if (def.type === 'number' || def.type === 'currency') {
    value = Number(String(f.value ?? '').replace(/,/g, ''));
    if (String(f.value ?? '').trim() === '' || !Number.isFinite(value)) return null;
  } else if (def.type === 'date') {
    value = sanitizeValue('date', f.value);
    if (!value) return null;
  } else {
    value = clean(f.value, 200).toLowerCase();
    if (!value) return null;
  }
  return { key: def.key, type: def.type, op, value };
}

/** Does one stored value pass one cleaned filter? A value that is not set never passes a filter. */
export function matchesFilter(filter, stored) {
  const v = stored === undefined ? null : stored;
  if (v === null || v === '') return false;
  if (filter.type === 'yesno') return v === filter.value;
  if (filter.type === 'select') return String(v) === filter.value;
  if (filter.type === 'number' || filter.type === 'currency') {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return false;
    return filter.op === 'atLeast' ? n >= filter.value : n <= filter.value;
  }
  if (filter.type === 'date') {
    const s = String(v);
    return filter.op === 'before' ? s < filter.value : s > filter.value;
  }
  return String(v).toLowerCase().includes(filter.value);
}

/**
 * The customers that pass every filter. `valuesOf(row)` gives the row's custom values (by key). Filters that cannot be read
 * (see sanitizeFilter) are ignored, so a stale filter never empties the list by accident. With no usable filters, every row stays.
 */
export function applyCustomFilters(rows = [], defs = [], filters = [], valuesOf = (r) => r?.customFields || {}) {
  const usable = (Array.isArray(filters) ? filters : []).map((f) => sanitizeFilter(f, defs)).filter(Boolean);
  if (!usable.length) return Array.isArray(rows) ? rows : [];
  return (Array.isArray(rows) ? rows : []).filter((r) => {
    const values = valuesOf(r) || {};
    return usable.every((f) => matchesFilter(f, values[f.key]));
  });
}
