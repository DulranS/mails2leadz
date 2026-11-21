// Empirical check for the printable-statement builder (lib/statementPrint.ts)
// — the pure string half that decides what goes on paper. (The DOM half,
// cloning and stripping the on-screen statement, needs a browser; it was
// verified by rendering the real Statements page in headless Chromium.)
//
// Run: npx tsx scripts/verify-statement-print.ts

import { buildStatementPrintHtml, STATEMENT_PRINT_DISCLAIMER, STATEMENT_PRINT_CSS } from "../lib/statementPrint";
import { DEFAULT_SETTINGS } from "../lib/types";
import type { Settings } from "../lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  businessName: "Kamal Hardware & Tools",
  businessAddress: "42 Galle Road, Colombo 03",
  businessPhone: "+94 11 234 5678",
};
const base = { bodyHtml: '<div class="bg-panel">Total assets</div>', docType: "Balance sheet", periodLabel: "As of 2026-09-20", settings, appCss: ".flex{display:flex}", printedOn: "2026-09-20" };

const html = buildStatementPrintHtml(base);
assert(html.includes("Kamal Hardware &amp; Tools"), "letterhead shows the (escaped) business name");
assert(html.includes("42 Galle Road, Colombo 03") && html.includes("+94 11 234 5678"), "letterhead shows address and phone");
assert(html.includes("Balance sheet") && html.includes("As of 2026-09-20"), "document type and period are shown");
assert(html.includes("Currency: LKR") && html.includes("Printed 2026-09-20"), "currency and print date are shown");
// (The constant contains an apostrophe, which is correctly HTML-escaped in the output,
// so compare against fragments rather than the raw string.)
assert(STATEMENT_PRINT_DISCLAIMER.startsWith("Unaudited") && html.includes("Unaudited management statement prepared from the business"), "disclaimer says unaudited");
assert(/not been filed with or submitted to any tax authority/.test(html), "disclaimer says not filed with any tax authority");
assert(/<tfoot>[\s\S]*stmt-disclaimer[\s\S]*<\/tfoot>/.test(html), "disclaimer lives in a <tfoot> so it repeats on every printed page");
assert(html.includes('<main class="stmt-print"><div class="bg-panel">Total assets</div></main>'), "statement body is passed through unchanged");
assert(html.includes("<title>Balance sheet - As of 2026-09-20 - Kamal Hardware &amp; Tools</title>"), "<title> (the Save-as-PDF file name) says what, when and whose");
assert(html.indexOf(".flex{display:flex}") < html.indexOf(".stmt-print, .stmt-print *"), "paper overrides come AFTER the app CSS so they win");

// Hostile / awkward input
const evil = buildStatementPrintHtml({ ...base, settings: { ...settings, businessName: '<img src=x onerror=alert(1)>"Ltd"', currency: "<b>" }, docType: "<script>x</script>", periodLabel: "<i>" });
assert(!/<img src=x/.test(evil) && !evil.includes("<script>x</script>") && !evil.includes("<b>") && !evil.includes("<i>"), "business name, doc type, currency and period are all HTML-escaped");
const cssBreak = buildStatementPrintHtml({ ...base, appCss: 'a{content:"</style><script>alert(1)</script>"}' });
assert(!cssBreak.includes("</style><script>"), "a literal </style> inside app CSS cannot end the style block");

// No business name yet: a plain heading, never "undefined"
const anon = buildStatementPrintHtml({ ...base, settings: { ...settings, businessName: undefined, businessAddress: undefined, businessPhone: undefined } });
assert(anon.includes("<h1>Balance sheet</h1>") && !anon.includes("undefined") && !anon.includes("null"), "no business name: clean plain heading, no 'undefined'");
assert(anon.includes("<title>Balance sheet - As of 2026-09-20</title>"), "no business name: title has no dangling separator");

// The paper CSS must always strip controls and force a light page
for (const needle of ["background: #fff !important", ".stmt-print button", ".stmt-print form", "[data-print-hide]", "@page"]) {
  assert(STATEMENT_PRINT_CSS.includes(needle), `paper CSS includes ${JSON.stringify(needle)}`);
}

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
