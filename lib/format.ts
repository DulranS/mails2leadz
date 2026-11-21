import { localIsoDate } from "./localDate";
const SYMBOLS: Record<string, string> = {
  LKR: "Rs",
  USD: "$",
  AED: "AED",
  EUR: "€",
  GBP: "£",
  INR: "₹",
};

export function formatMoney(amount: number, currency: string): string {
  const symbol = SYMBOLS[currency] ?? currency;
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${negative ? "-" : ""}${symbol} ${formatted}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function formatMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
}

export function todayIso(): string {
  return localIsoDate();
}

// Whole days from today to an ISO date — positive means it's still ahead,
// negative means it's already passed, 0 means today. Used for trial
// countdowns and renewal-due nudges (see AccountBanner/Settings), where
// "3 days left" vs. "overdue by 3 days" needs the sign, not just a date.
export function daysUntilIso(iso: string): number {
  const today = new Date(`${todayIso()}T00:00:00Z`);
  const target = new Date(`${iso}T00:00:00Z`);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
