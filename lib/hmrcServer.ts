// Server-only helpers for the HMRC routes (v319). The connection lives in one document, users/{businessId}/hmrc/state, which the browser
// cannot read (no rule allows it). Tokens and the National Insurance number are sealed with BALANCR_ENC_KEY (lib/secretBox.ts).
// The sign-in state is kept in hmrcStates/{state} for ten minutes and used once.
import { randomBytes } from "crypto";
import { loadSecretKey, openValue, sealValue } from "./secretBox";
import type { HmrcTokens } from "./hmrcClient";
import { quarterFigures } from "./hmrcMtd";
import type { Firestore } from "firebase-admin/firestore";

export const STATE_TTL_MS = 10 * 60 * 1000;

export interface HmrcStateDoc {
  connected?: boolean;
  accessTokenSealed?: string;
  refreshTokenSealed?: string;
  expiresAt?: number;
  connectedAt?: number;
  connectedByName?: string;
  ninoSealed?: string;
  businessId?: string;
  lastSubmission?: { at: number; taxYear: string; index: number; turnover: number; expenses: number; status: "sent" | "failed"; reason?: string };
}

export function hmrcStateRef(db: Firestore, businessId: string) {
  return db.collection("users").doc(businessId).collection("hmrc").doc("state");
}

export function newOauthState(): string {
  return randomBytes(24).toString("hex");
}

export function sealKey(raw: string | undefined) {
  return loadSecretKey(raw);
}

export function sealTokens(t: HmrcTokens, key: Buffer): Pick<HmrcStateDoc, "accessTokenSealed" | "refreshTokenSealed" | "expiresAt"> {
  return { accessTokenSealed: sealValue(t.accessToken, key), refreshTokenSealed: sealValue(t.refreshToken, key), expiresAt: t.expiresAt };
}

/** The stored tokens, opened, or null when the business is not connected or a token cannot be read. */
export function openTokens(doc: HmrcStateDoc, key: Buffer): HmrcTokens | null {
  if (!doc.connected || !doc.accessTokenSealed || !doc.refreshTokenSealed || !doc.expiresAt) return null;
  const access = openValue(doc.accessTokenSealed, key);
  const refresh = openValue(doc.refreshTokenSealed, key);
  if (!access || !refresh) return null;
  return { accessToken: access, refreshToken: refresh, expiresAt: doc.expiresAt };
}

/** The sales and one-off expenses in one quarter, read from the books (the browser's figures are never trusted for a submission). */
export async function quarterFromBooks(db: Firestore, businessId: string, q: { from: string; to: string }) {
  const base = db.collection("users").doc(businessId);
  const sales = await base.collection("sales").where("date", ">=", q.from).where("date", "<=", q.to).get();
  const expenses = await base.collection("expenses").where("startDate", ">=", q.from).where("startDate", "<=", q.to).get();
  return quarterFigures(
    q,
    sales.docs.map((d) => d.data() as { date: string; qty?: number; unitPrice?: number }),
    expenses.docs.map((d) => d.data() as { startDate: string; amount: number; isRecurring?: boolean })
  );
}
