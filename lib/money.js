// lib/money.js - rounding to whole cents, used where money is added up (pure).
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
