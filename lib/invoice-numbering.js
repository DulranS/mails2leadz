// lib/invoice-numbering.js - sequential invoice numbers (pure). Format: <prefix><zero-padded number>, e.g. INV-0042.
export const DEFAULT_PREFIX = 'INV-';
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const normalizePrefix = (p) => String(p ?? DEFAULT_PREFIX).replace(/[\r\n]/g, '').trim().slice(0, 12) || DEFAULT_PREFIX;
export const formatInvoiceNumber = (prefix, n) => `${normalizePrefix(prefix)}${String(n).padStart(4, '0')}`;

/** The highest number already used with this prefix, so a new number never repeats one (typed by hand or made before). */
export function maxExistingNumber(numbers = [], prefix = DEFAULT_PREFIX) {
  const re = new RegExp(`^${escapeRe(normalizePrefix(prefix))}(\\d{1,9})$`);
  let max = 0;
  for (const x of numbers) {
    const m = re.exec(String(x ?? '').trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/** The next number to hand out: never below the counter, and never below the highest number already used. */
export const nextNumberValue = ({ counterNext = 0, maxExisting = 0 } = {}) => Math.max(Number(counterNext) || 0, (Number(maxExisting) || 0) + 1, 1);
