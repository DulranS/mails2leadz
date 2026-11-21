// WhatsApp deep links (lib/share.ts toWhatsAppNumber): a local-format number must become an international one,
// an already-international number must be left alone, and nothing ambiguous may be guessed at.
// Run: npx tsx scripts/verify-whatsapp-number.ts
import { buildShareTargets, toWhatsAppNumber } from "../lib/share";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const eq = (raw: string, want: string, cc?: string) => {
  const got = cc ? toWhatsAppNumber(raw, cc) : toWhatsAppNumber(raw);
  ok(got === want, `toWhatsAppNumber(${JSON.stringify(raw)}) = ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
};

// Local format: the leading 0 becomes the country code (default 94)
eq("0741143323", "94741143323");
eq("077 123 4567", "94771234567");
eq("077-123-4567", "94771234567");
eq("(077) 1234567", "94771234567");
// Already international: untouched
eq("+94 77 123 4567", "94771234567");
eq("94771234567", "94771234567");
eq("0094771234567", "94771234567");
eq("+44 7700 900123", "447700900123");
// Stray trunk 0 right after the country code
eq("+94 0771234567", "94771234567");
eq("940771234567", "94771234567");
// Not guessed: no leading 0, no +, not already carrying the country code
eq("771234567", "771234567");
// Empty / junk
eq("", "");
eq("   ", "");
eq("call me", "");
// A different default country is honoured
eq("07700 900123", "447700900123", "44");
eq("+94 77 123 4567", "94771234567", "44");

// Wired into the share link: a customer saved as a local number gets a working wa.me link, an email gets none
const t = buildShareTargets("Invoice INV-1", "Invoice INV-1", "077 123 4567");
ok(t.whatsappUrl.startsWith("https://wa.me/94771234567?text="), `share link was ${t.whatsappUrl}`);
const e = buildShareTargets("x", "x", "someone@example.com");
ok(e.whatsappUrl.startsWith("https://wa.me/?text="), `email contact should open WhatsApp with no number, got ${e.whatsappUrl}`);
const blank = buildShareTargets("x", "x", undefined);
ok(blank.whatsappUrl.startsWith("https://wa.me/?text="), `no contact should open WhatsApp with no number, got ${blank.whatsappUrl}`);

if (fails) { console.error(`${fails} of ${checks} checks failed`); process.exit(1); }
console.log(`verify-whatsapp-number: ${checks} checks passed`);
