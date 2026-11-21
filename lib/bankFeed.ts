// Automatic bank feed (Plaid), pure part (pass v319): reading the server settings, the Plaid base address, and turning Plaid's
// transactions into the same bank statement lines the reconciliation page already holds (lib/types.ts BankStatementLine).
//
// Read-only: nothing here moves money. Lines land as "unmatched", so a person still decides every match on the Reconcile page.
// Duplicates: a line is skipped when its Plaid transaction id was already imported (feedTxnId), or when it matches a line already on
// the statement by the existing rule (lib/bankImport.ts: date, description and amount to the cent).
// Keys: PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV are read from the environment only. Nothing here returns or logs a value.
import { splitNewStatementLines, type StatementLineKeyable } from "./bankImport";

export type PlaidEnv = "sandbox" | "production";

export interface PlaidSettings {
  configured: boolean;
  env: PlaidEnv | null;
  clientId: string; // never shown to the page; used only in request headers
  secret: string; // never shown to the page; used only in request headers
  countryCodes: string[];
  missing: string[]; // the NAMES of the environment variables that are not set or not valid, for the "not configured" message
}

const PLAID_HOSTS: Record<PlaidEnv, string> = {
  sandbox: "https://sandbox.plaid.com",
  production: "https://production.plaid.com",
};

/** Reads the Plaid settings from an environment map. Missing or invalid settings give configured: false and name them. */
export function plaidSettings(env: Record<string, string | undefined>): PlaidSettings {
  const clientId = (env.PLAID_CLIENT_ID ?? "").trim();
  const secret = (env.PLAID_SECRET ?? "").trim();
  const rawEnv = (env.PLAID_ENV ?? "sandbox").trim().toLowerCase();
  const countryCodes = (env.PLAID_COUNTRY_CODES ?? "GB")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  const missing: string[] = [];
  if (!clientId) missing.push("PLAID_CLIENT_ID");
  if (!secret) missing.push("PLAID_SECRET");
  const envValid = rawEnv === "sandbox" || rawEnv === "production";
  if (!envValid) missing.push("PLAID_ENV");
  if (countryCodes.length === 0) missing.push("PLAID_COUNTRY_CODES");
  const configured = missing.length === 0;
  return {
    configured,
    env: configured && envValid ? (rawEnv as PlaidEnv) : null,
    clientId,
    secret,
    countryCodes,
    missing,
  };
}

/** The Plaid base address for a configured environment, or null when the settings are not complete. */
export function plaidBaseUrl(settings: PlaidSettings): string | null {
  return settings.configured && settings.env ? PLAID_HOSTS[settings.env] : null;
}

/** The shape of one Plaid transaction the mapping reads (only these fields). */
export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  amount: number; // Plaid's sign: positive = money left the account
  iso_currency_code: string | null;
  date: string; // YYYY-MM-DD
  name?: string | null;
  merchant_name?: string | null;
  pending: boolean;
}

export interface FeedStatementLine extends StatementLineKeyable {
  id: string; // the Firestore document id: deterministic, so writing the same transaction twice cannot create two lines
  feedTxnId: string; // the Plaid transaction id, kept on the line so a re-sync never imports it again
  description: string;
  amount: number; // Balancr's sign: positive = money in, negative = money out
  status: "unmatched";
}

export interface FeedMapping {
  fresh: FeedStatementLine[];
  duplicates: number;
  skipped: { pending: number; otherCurrency: number; invalid: number };
}

/** A document id for a Plaid transaction: its id with anything outside letters, digits, "-" and "_" replaced. */
export function feedLineId(transactionId: string): string {
  return `feed-${transactionId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/** Money to cents, with no negative zero. */
function toCents(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Maps Plaid transactions to statement lines in the base currency.
 * - pending transactions are skipped: Plaid replaces them with a new id once they post, so importing them would double the line;
 * - a transaction in another currency is skipped: its amount is not in the business's money, and the app does not convert;
 * - a transaction already imported (same Plaid id) or already on the statement (the existing rule) is counted as a duplicate.
 */
export function mapFeedTransactions(
  transactions: PlaidTransaction[],
  opts: { baseCurrency: string; importedTransactionIds: Set<string>; existingLines: StatementLineKeyable[] }
): FeedMapping {
  const skipped = { pending: 0, otherCurrency: 0, invalid: 0 };
  const base = opts.baseCurrency.trim().toUpperCase();
  const candidates: FeedStatementLine[] = [];
  const seenThisBatch = new Set<string>();
  let duplicates = 0;

  for (const t of transactions) {
    if (t.pending) {
      skipped.pending++;
      continue;
    }
    const currency = (t.iso_currency_code ?? "").toUpperCase();
    if (currency !== base) {
      skipped.otherCurrency++;
      continue;
    }
    if (!t.transaction_id || !ISO_DATE.test(t.date) || !Number.isFinite(t.amount)) {
      skipped.invalid++;
      continue;
    }
    // Plaid can send the same transaction on two pages of one sync; only the first copy counts.
    if (opts.importedTransactionIds.has(t.transaction_id) || seenThisBatch.has(t.transaction_id)) {
      duplicates++;
      continue;
    }
    seenThisBatch.add(t.transaction_id);
    const description = (t.merchant_name ?? "").trim() || (t.name ?? "").trim() || "Bank transaction";
    candidates.push({
      id: feedLineId(t.transaction_id),
      feedTxnId: t.transaction_id,
      date: t.date,
      description,
      amount: toCents(-t.amount),
      status: "unmatched",
    });
  }

  const { fresh, duplicates: ruleDuplicates } = splitNewStatementLines(candidates, opts.existingLines);
  return { fresh, duplicates: duplicates + ruleDuplicates.length, skipped };
}

/** The earliest date in a list of transactions, as YYYY-MM-DD, or null when there is none. The route reads existing lines from here on. */
export function earliestDate(transactions: PlaidTransaction[]): string | null {
  let min: string | null = null;
  for (const t of transactions) if (ISO_DATE.test(t.date) && (min === null || t.date < min)) min = t.date;
  return min;
}

/** Plain words for a Plaid error code, for the page. Anything not listed gets the generic message. */
export function plaidErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case "ITEM_LOGIN_REQUIRED":
      return "The bank needs you to sign in again. Reconnect the bank.";
    case "PRODUCT_NOT_READY":
      return "The bank is still preparing this account's transactions. Try again in a few minutes.";
    case "INVALID_CREDENTIALS":
    case "INVALID_API_KEYS":
      return "The bank feed keys on this server were rejected. The operator needs to check PLAID_CLIENT_ID and PLAID_SECRET.";
    case "RATE_LIMIT_EXCEEDED":
      return "The bank feed is busy right now. Try again shortly.";
    default:
      return fallback;
  }
}
