// Foreign-currency entries: converted once, at entry, at the rate the owner types, and a zero/blank rate can't slip
// through the form. Run: npx tsx scripts/verify-fx.ts
import { readFileSync } from "node:fs";
import { convertToBase } from "../lib/fx";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

ok(convertToBase(100, 320.5) === 32050, "100 USD at 320.5 = 32,050 in the business currency");
ok(Math.abs(convertToBase(12.5, 0.0035) - 0.04375) < 1e-12, "small rates convert exactly");
ok(convertToBase(100, 1) === 100, "rate 1 (same currency) is a no-op");
// The library deliberately treats a missing rate as 1, so the FORM must make a missing/zero rate impossible.
ok(convertToBase(100, 0) === 100, "(documented) the helper itself maps rate 0 to 1");
const forms = readFileSync(new URL("../components/QuickForms.tsx", import.meta.url), "utf8");
const rateInput = forms.slice(forms.indexOf("Rate (1 {currency} = ? {baseCurrency})"));
const block = rateInput.slice(0, rateInput.indexOf("</Field>"));
ok(/required/.test(block), "the rate box is required");
ok(/min="0\.0001"/.test(block) && !/min="0"/.test(block), "the rate box rejects 0 (minimum is above zero)");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
