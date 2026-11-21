// ---------------------------------------------------------------------------
// "Send this to the customer" — one tap after Print (Save as PDF).
//
// This app deliberately doesn't generate a PDF/attachment in-browser (see
// lib/print.ts's header — window.print() is the PDF path, via the OS's own
// "Save as PDF") and doesn't integrate with any messaging API (a WhatsApp
// Business API key, Twilio, SendGrid, etc) — that's exactly the kind of
// external-service integration this project stays out of. What this DOES
// do is use capabilities every phone/browser already ships for free:
//
// - navigator.share — the OS "Share sheet" (mobile Safari/Chrome, most
//   desktop Chrome/Edge). This is how an owner already sends a just-saved
//   PDF over WhatsApp/Email/SMS/AirDrop; this just also hands over a short
//   text summary alongside it so the message isn't a bare attachment.
// - A wa.me deep link — opens a WhatsApp chat with a prefilled message,
//   addressed to the customer's own number when one was recorded against
//   the sale/estimate (Sale.customerContact / Estimate.customerContact),
//   or left blank (wa.me still opens fine with an empty number — WhatsApp
//   then asks who to send it to) when it wasn't.
// - A mailto: link — same idea, for a contact that looks like an email.
//
// Every one of these opens an app already installed on the *customer's or
// owner's own device* — nothing routes through a server this app operates,
// so there's no new place a customer's phone number or message could leak
// from, and nothing to keep an API key alive or renewed for.
// ---------------------------------------------------------------------------

export interface ShareableDocInput {
  /** e.g. "Invoice INV-000123" or "Quote EST-A1B2C3" */
  title: string;
  business?: string;
  customer?: string;
  /** already-formatted, e.g. "Total: LKR 12,345.00" */
  amountLine: string;
  /** e.g. a due date or "Valid until 30 Sep" */
  extraLines?: string[];
}

export function buildShareText(input: ShareableDocInput): string {
  const lines = [
    input.business ? `${input.title} — ${input.business}` : input.title,
    input.customer ? `For: ${input.customer}` : null,
    input.amountLine,
    ...(input.extraLines ?? []),
  ].filter((l): l is string => !!l && l.trim().length > 0);
  return lines.join("\n");
}

// Loose heuristic, not a validator — good enough to route a free-text
// contact field (phone OR email OR nothing; see Sale.customerContact's own
// comment in lib/types.ts) toward the right one of the two links below.
function looksLikeEmail(contact: string): boolean {
  return contact.includes("@");
}

// wa.me only works with a number in international format, digits only and with
// no leading zero (94771234567). Shops here write numbers the local way
// ("077 123 4567"), and wa.me/0771234567 just shows WhatsApp's "invalid number"
// page. So the one unambiguous case is fixed up: a single leading 0 is the
// national trunk prefix and becomes the country code (NEXT_PUBLIC_DEFAULT_COUNTRY_CODE,
// default 94 for Sri Lanka). "+" and "00" mean the number is already international and
// are never touched; a stray 0 right after the country code ("+94 077...") is dropped.
// Anything else is passed through as typed, not guessed at: a wrong guess would open a
// chat with the wrong person (see lib/print.ts for the same caution).
function defaultCountryCode(): string {
  return (process.env.NEXT_PUBLIC_DEFAULT_COUNTRY_CODE ?? "").replace(/\D/g, "") || "94";
}

export function toWhatsAppNumber(raw: string, countryCode: string = defaultCountryCode()): string {
  const trimmed = (raw ?? "").trim();
  let d = trimmed.replace(/\D/g, "");
  if (!d) return "";
  const international = trimmed.startsWith("+");
  if (!international && d.startsWith("00")) d = d.slice(2);
  else if (!international && d.startsWith("0")) d = countryCode + d.slice(1);
  if (d.startsWith(countryCode + "0")) d = countryCode + d.slice(countryCode.length + 1);
  return d;
}

export interface ShareTargets {
  /** True where navigator.share is available. */
  canUseNativeShare: boolean;
  /** Opens the OS share sheet. Resolves whether or not the user actually picks an app — a cancel isn't an error. */
  shareNative: () => Promise<void>;
  whatsappUrl: string;
  mailtoUrl: string;
}

export function buildShareTargets(text: string, title: string, contact?: string): ShareTargets {
  const trimmed = contact?.trim();
  const isEmail = !!trimmed && looksLikeEmail(trimmed);
  const phoneDigits = trimmed && !isEmail ? toWhatsAppNumber(trimmed) : "";

  return {
    canUseNativeShare: typeof navigator !== "undefined" && typeof navigator.share === "function",
    shareNative: async () => {
      try {
        await navigator.share({ title, text });
      } catch {
        // Cancelled the sheet, or the browser rejected the call outside a
        // user gesture — either way there's nothing useful to surface.
      }
    },
    whatsappUrl: `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`,
    mailtoUrl: `mailto:${isEmail ? encodeURIComponent(trimmed!) : ""}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`,
  };
}
