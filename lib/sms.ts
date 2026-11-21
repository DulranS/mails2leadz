// Text-message (SMS) reminders for overdue invoices, through Notify.lk, a Sri Lankan SMS gateway. Direct HTTPS call, no SDK,
// the same choice as lib/email.ts. Off unless the server has the three NOTIFY_LK_* values and the business has switched SMS on.
// A reminder to pay, not marketing: one text per overdue invoice per interval, to a mobile number the customer gave the business.
// Pure helpers (phone clean-up, message text) are separate from the one function that sends, so they can be checked offline.

import { revealedValues } from "./secretBox";
export const SMS_MAX_CHARS = 320; // Notify.lk's documented limit per message
export const SMS_RUN_LIMIT = 100; // texts per daily run: each one costs money, so a runaway job cannot drain the balance

// True when outgoing SMS is switched on at the server: a Notify.lk user, key and an approved sender name.
// The provider settings to send with: the business's own (saved under Integrations, entered as a key), or the server's if it has them.
export interface SmsConfig { userId: string; apiKey: string; senderId: string }
export function smsConfigFrom(saved: { enabled?: boolean; values?: Record<string, unknown> } | undefined): SmsConfig | null {
  const v = saved?.values ? revealedValues(saved.values) : undefined;
  if (saved?.enabled && v?.userId && v?.apiKey && v?.senderId) return { userId: v.userId, apiKey: v.apiKey, senderId: v.senderId };
  return null;
}
export function serverSmsConfig(): SmsConfig | null {
  const userId = process.env.NOTIFY_LK_USER_ID, apiKey = process.env.NOTIFY_LK_API_KEY, senderId = process.env.NOTIFY_LK_SENDER_ID;
  return userId && apiKey && senderId ? { userId, apiKey, senderId } : null;
}
export function isSmsConfigured(config?: SmsConfig | null): boolean {
  return !!(config ?? serverSmsConfig());
}

// A Sri Lankan mobile number in the form 94XXXXXXXXX (what Notify.lk expects), or null. The contact on a sale is free text
// (a phone number, an email, or both), so each word is tried. Accepts 0771234567, 077 123 4567, +94 77 123 4567, 94771234567,
// 771234567. Landlines (011..., 081...) cannot receive an SMS and return null. Mobile numbers start 70, 71, 72, 74, 75, 76, 77, 78.
export function sriLankaMobile(contact: string | undefined | null): string | null {
  if (!contact) return null;
  const withoutEmails = contact.replace(/\S+@\S+/g, " ");
  // Candidate numbers: runs of digits that may be split by spaces or dashes, with an optional leading + or 00.
  const candidates = withoutEmails.match(/\+?\d[\d\s-]{6,}\d/g) ?? [];
  for (const c of candidates) {
    const digits = c.replace(/\D/g, "");
    const exact = /^(?:0094|94|0)?(7[0-8]\d{7})$/.exec(digits);
    if (exact) return `94${exact[1]}`;
    // Two numbers written with one space between them run together; take the mobile number at the front.
    if (digits.length > 11 && digits.length <= 24) {
      const front = /^(?:0094(7[0-8]\d{7})|94(7[0-8]\d{7})|0(7[0-8]\d{7}))/.exec(digits);
      if (front) return `94${front[1] ?? front[2] ?? front[3]}`;
    }
  }
  return null;
}

// Plain ASCII only: a non-GSM character halves what fits in a message and costs more. Anything else becomes a space or "?".
export function plainSmsText(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function money(currency: string, n: number): string {
  return `${plainSmsText(currency)} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// The reminder text, always within SMS_MAX_CHARS. The essentials (who, which invoice, how much) are never cut; the invoice link and
// the payment instructions are added only while they fit.
export function smsReminderText(p: {
  businessName: string;
  ref: string;
  currency: string;
  balance: number;
  dueDate: string | null;
  link?: string | null;
  paymentInstructions?: string | null;
}): string {
  const business = plainSmsText(p.businessName).slice(0, 40) || "Your supplier";
  const core = `${business}: invoice ${plainSmsText(p.ref)} has ${money(p.currency, p.balance)} unpaid${p.dueDate ? ` since ${p.dueDate}` : ""}.`;
  const tail = " Ignore this if you have paid.";
  let text = core + tail;
  const pay = plainSmsText(p.paymentInstructions ?? "");
  if (p.link && (text + ` View: ${p.link}`).length <= SMS_MAX_CHARS) text += ` View: ${p.link}`;
  if (pay && (text + ` Pay: ${pay}`).length <= SMS_MAX_CHARS) text += ` Pay: ${pay}`;
  if (text.length > SMS_MAX_CHARS) text = core.slice(0, SMS_MAX_CHARS);
  return text;
}

export interface SendSmsInput { to: string; message: string }

// Returns true when Notify.lk accepted the text, false when SMS is not configured (a deliberate no-op), and throws when the
// gateway refuses or cannot be reached. Never logs the key.
export async function sendSms({ to, message }: SendSmsInput, config?: SmsConfig | null): Promise<boolean> {
  const c = config ?? serverSmsConfig();
  if (!c) return false;
  const { userId, apiKey, senderId } = c;
  if (!/^94[7]\d{8}$/.test(to)) throw new Error("SMS needs a Sri Lankan mobile number in the form 94XXXXXXXXX.");
  const text = plainSmsText(message).slice(0, SMS_MAX_CHARS);
  if (!text) throw new Error("The text message is empty.");
  const body = new URLSearchParams({ user_id: userId, api_key: apiKey, sender_id: senderId, to, message: text });
  const res = await fetch("https://app.notify.lk/api/v1/send", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await res.text().catch(() => "");
  let status: string | undefined;
  try { status = (JSON.parse(raw) as { status?: string }).status; } catch { /* not JSON */ }
  if (res.ok && (status === undefined || status === "success")) return true;
  // The response can echo request details, so only the HTTP status and Notify.lk's own status word are kept.
  throw new Error(`Notify.lk error (${res.status}${status ? `, ${status}` : ""})`);
}
