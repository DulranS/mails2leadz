// Empirical check for the Share button's link-building logic
// (lib/share.ts) — the wa.me/mailto routing based on a free-text contact
// field, and the no-contact fallback. Pure string checks, nothing async.
//
// Run: npx tsx scripts/verify-share-links.ts

import { buildShareText, buildShareTargets } from "../lib/share";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

// --- buildShareText ---
const text1 = buildShareText({
  title: "Invoice INV-000123",
  business: "Kamal Hardware",
  customer: "Nimal Perera",
  amountLine: "Total: LKR 12,345.00 (balance due: LKR 5,000.00)",
  extraLines: ["Due: 2026-10-01"],
});
assert(text1.includes("Invoice INV-000123 — Kamal Hardware"), "share text includes title + business");
assert(text1.includes("For: Nimal Perera"), "share text includes customer line");
assert(text1.includes("balance due"), "share text includes amount line");
assert(text1.includes("Due: 2026-10-01"), "share text includes extra line");

const text2 = buildShareText({ title: "Quote EST-1", amountLine: "Total: LKR 500.00" });
assert(!text2.includes("For:"), "no customer line when customer is omitted");
assert(text2.split("\n").length === 2, "blank/undefined fields don't leave stray empty lines");

// --- buildShareTargets: phone contact routes to WhatsApp with number, empty mailto ---
const phoneTargets = buildShareTargets("hello", "Invoice X", "0771234567");
// wa.me needs the international number: the local leading 0 becomes the country code (see scripts/verify-whatsapp-number.ts)
assert(phoneTargets.whatsappUrl.startsWith("https://wa.me/94771234567?text="), `phone contact addresses wa.me correctly (${phoneTargets.whatsappUrl})`);
assert(phoneTargets.mailtoUrl.startsWith("mailto:?subject="), "phone contact leaves mailto 'to' blank");

// --- email contact routes to mailto with address, blank whatsapp number ---
const emailTargets = buildShareTargets("hello", "Invoice X", "nimal@example.com");
assert(emailTargets.mailtoUrl.startsWith("mailto:nimal%40example.com?subject="), `email contact addresses mailto correctly (${emailTargets.mailtoUrl})`);
assert(emailTargets.whatsappUrl.startsWith("https://wa.me/?text="), "email contact leaves wa.me number blank");

// --- no contact at all: both links still valid, just unaddressed ---
const noContactTargets = buildShareTargets("hello", "Invoice X", undefined);
assert(noContactTargets.whatsappUrl === `https://wa.me/?text=${encodeURIComponent("hello")}`, "no contact -> wa.me still opens with just the text");
assert(noContactTargets.mailtoUrl.startsWith("mailto:?subject="), "no contact -> mailto still opens with just subject/body");

// --- messy phone contact (spaces/dashes) still gets digit-stripped correctly ---
const messyPhone = buildShareTargets("hi", "T", "+94 77-123 4567");
assert(messyPhone.whatsappUrl.startsWith("https://wa.me/94771234567?"), `messy phone format gets cleaned to digits only (${messyPhone.whatsappUrl})`);

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
