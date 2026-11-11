// lib/format.js - one way to show numbers: thousands grouped with commas (500,000 and 5,000,000); up to two decimals only when there are some. Pure.
export function groupNumber(v) {
  if (v === null || v === undefined || v === '') return 'n/a';
  const n = Number(v);
  if (!Number.isFinite(n)) return 'n/a';
  const decimals = Number.isInteger(n) ? 0 : 2;
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(n);
}
