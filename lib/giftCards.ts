// Gift cards: a prepaid card someone buys and anyone can hand in later. The money is held as a customer deposit (so it is a
// liability until used, counted in cash flow and the deposit total), kept under the card's own name "Gift card XXXX-XXXX".
// Using a card on an invoice is an ordinary deposit "applied" to that invoice, and it is allowed for any customer, because
// the card is a bearer card: whoever presents the code can use it. Refunding the unused balance in cash is a deposit refund.
//
// Pure: no I/O. Balances come from lib/customerDeposits.ts, the same ledger that checks every save, so a card can never go
// below zero and cannot be used twice. See scripts/verify-gift-cards.ts.
import { computeCustomerDeposits, customerDepositKey } from "./customerDeposits";
import type { CustomerDepositEntry, PaymentMethod } from "./types";

export const GIFT_CARD_PREFIX = "Gift card ";
// No 0, O, 1 or I, so a code read out or written by hand is not misread.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const EPS = 0.005;

export const giftCardName = (code: string) => `${GIFT_CARD_PREFIX}${code}`;

// Accepts the code with or without the dash, in any case, with stray spaces. "" when it cannot be a code.
export function normalizeGiftCardCode(raw: string | undefined | null): string {
  const s = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : "";
}

// A new code that no existing card uses. `rand` is injectable so the test is repeatable.
export function newGiftCardCode(taken: Set<string>, rand: () => number = Math.random): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let raw = "";
    for (let i = 0; i < 8; i++) raw += ALPHABET[Math.floor(rand() * ALPHABET.length) % ALPHABET.length];
    const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    if (!taken.has(code)) return code;
  }
  throw new Error("Could not make a new gift card code. Try again.");
}

export const isGiftCardCustomer = (customer: string | undefined, entries: CustomerDepositEntry[]) => {
  const key = customerDepositKey(customer);
  return !!key && entries.some((e) => e.giftCardCode && customerDepositKey(e.customer) === key);
};

export interface GiftCardRow {
  code: string;
  name: string;
  issuedDate: string;
  soldAmount: number;
  buyer?: string;
  balance: number;
  lastDate: string; // the latest date anything happened on the card
}

// Every card issued on or before asOf, with what is left on it. Largest balance first among cards still in use.
export function listGiftCards(entries: CustomerDepositEntry[], asOf: string): GiftCardRow[] {
  const balances = new Map(computeCustomerDeposits(entries, asOf).byCustomer.map((b) => [b.key, b.balance]));
  const rows: GiftCardRow[] = [];
  for (const e of entries) {
    if (e.kind !== "received" || !e.giftCardCode || e.date > asOf) continue;
    const name = giftCardName(e.giftCardCode);
    const key = customerDepositKey(name);
    const last = entries
      .filter((x) => customerDepositKey(x.customer) === key && x.date <= asOf)
      .reduce((m, x) => (x.date > m ? x.date : m), e.date);
    rows.push({
      code: e.giftCardCode,
      name,
      issuedDate: e.date,
      soldAmount: e.amount,
      buyer: e.notes?.replace(/^Bought by /, "") || undefined,
      balance: Math.max(0, Math.round((balances.get(key) ?? 0) * 100) / 100),
      lastDate: last,
    });
  }
  rows.sort((a, b) => (a.balance > 0 ? 0 : 1) - (b.balance > 0 ? 0 : 1) || b.lastDate.localeCompare(a.lastDate) || a.code.localeCompare(b.code));
  return rows;
}

// The card with this code, with its full history (oldest first), or null when no such card exists.
export function findGiftCard(entries: CustomerDepositEntry[], rawCode: string, asOf: string) {
  const code = normalizeGiftCardCode(rawCode);
  if (!code) return null;
  const row = listGiftCards(entries, asOf).find((r) => r.code === code);
  if (!row) return null;
  const key = customerDepositKey(row.name);
  const history = entries
    .filter((x) => customerDepositKey(x.customer) === key && x.date <= asOf)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
  return { ...row, history };
}

// Money held on unused gift cards on asOf: the liability.
export function giftCardLiability(entries: CustomerDepositEntry[], asOf: string) {
  const rows = listGiftCards(entries, asOf);
  return {
    total: Math.round(rows.reduce((s, r) => s + r.balance, 0) * 100) / 100,
    cardsInUse: rows.filter((r) => r.balance > EPS).length,
  };
}

export type GiftCardMethod = Exclude<PaymentMethod, "credit">;

// null = fine to sell; otherwise the sentence to show the person.
export function validateGiftCardSale(i: { amount: number; date: string; today: string; method: GiftCardMethod }): string | null {
  if (!Number.isFinite(i.amount) || i.amount <= 0) return "Enter the value of the gift card (more than zero).";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) return "Enter a valid date.";
  if (i.date > i.today) return "A gift card can't be sold on a day in the future.";
  if (!["cash", "card", "bank_transfer"].includes(i.method)) return "Choose how they paid.";
  return null;
}

// null = fine to use the card for this amount; otherwise the sentence to show the person.
export function validateGiftCardUse(i: { balance: number; amount: number; outstanding: number }): string | null {
  if (i.balance <= EPS) return "This gift card has nothing left on it.";
  if (!Number.isFinite(i.amount) || i.amount <= 0) return "Enter an amount above zero.";
  if (i.amount > i.balance + EPS) return `The card only has ${i.balance.toFixed(2)} left.`;
  if (i.amount > i.outstanding + EPS) return "That is more than is still owed on the invoice.";
  return null;
}
