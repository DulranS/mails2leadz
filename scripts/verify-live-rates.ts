// Live reference rates (lib/liveRates.ts, app/api/fx/rates/route.ts, components/FxExposureCard.tsx, and the units added to
// lib/fxExposure.ts). Hand-worked cases with a fixed response, so no network is needed.
// Run: npx tsx scripts/verify-live-rates.ts
import fs from "node:fs";
import { computeFxExposure } from "../lib/fxExposure";
import { crossRate, isStale, parseRates, referenceView, RATES_STALE_MS, suggestRate } from "../lib/liveRates";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// A response shaped like the source's: 1 USD = these units.
const CODES: Record<string, number> = {
  USD: 1, LKR: 300, EUR: 0.9, GBP: 0.78, INR: 83, AUD: 1.5, CAD: 1.36, JPY: 150, CNY: 7.2, SGD: 1.34, AED: 3.67,
  CHF: 0.88, SEK: 10.5, NOK: 10.6, DKK: 6.9, NZD: 1.66, HKD: 7.8, KRW: 1330, THB: 35, MYR: 4.7,
};
const good = () => ({ result: "success", base_code: "USD", time_last_update_unix: 1_800_000_000, rates: { ...CODES } });

// ---- parsing ---------------------------------------------------------------------------------------------------------------
const p = parseRates(good());
ok(p !== null && p.base === "USD" && p.rates.LKR === 300 && p.updatedAt === 1_800_000_000_000, "a complete response is accepted, time converted to ms");
ok(parseRates({ ...good(), result: "error" }) === null, "an error response is refused");
ok(parseRates({ ...good(), base_code: "EUR" }) === null, "a response quoted against another base is refused");
ok(parseRates({ ...good(), rates: { ...CODES, USD: 2 } }) === null, "a response whose USD is not 1 is refused");
ok(parseRates({ ...good(), time_last_update_unix: undefined }) === null, "no update time is refused");
ok(parseRates({ ...good(), time_last_update_unix: 0 }) === null, "a zero update time is refused");
ok(parseRates({ ...good(), rates: { USD: 1, LKR: 300 } }) === null, "a tiny list (fewer than 20 currencies) is refused as partial");
ok(parseRates(null) === null && parseRates("x") === null && parseRates([]) === null, "non-objects are refused");
const dirty = parseRates({ ...good(), rates: { ...CODES, lkr: 999, "TOO-LONG": 5, ZZZ: "12", QQQ: -3, BAD: 0, NAN: Number.NaN } });
ok(dirty !== null && dirty.rates.LKR === 300 && !("lkr" in dirty.rates) && !("TOO-LONG" in dirty.rates) && !("ZZZ" in dirty.rates) && !("QQQ" in dirty.rates) && !("BAD" in dirty.rates) && !("NAN" in dirty.rates), "bad currency codes, non-numbers, zero and negative rates are dropped, the good ones kept");

// ---- cross rates -----------------------------------------------------------------------------------------------------------
const snap = p!;
ok(near(crossRate(snap, "USD", "LKR")!, 300), "USD to LKR is the quoted rate");
ok(near(crossRate(snap, "EUR", "LKR")!, 300 / 0.9), "EUR to LKR goes through USD");
ok(near(crossRate(snap, "LKR", "USD")!, 1 / 300), "LKR to USD is the inverse");
ok(crossRate(snap, "LKR", "LKR") === 1, "same currency is exactly 1");
ok(near(crossRate(snap, " eur ", "lkr")!, 300 / 0.9), "codes are read case- and space-insensitively");
ok(crossRate(snap, "XYZ", "LKR") === null && crossRate(snap, "EUR", "NOPE") === null, "a currency not in the list gives no rate (never a guess)");
ok(crossRate(snap, "EU", "LKR") === null && crossRate(snap, "", "LKR") === null, "a malformed code gives no rate");

// ---- staleness -------------------------------------------------------------------------------------------------------------
ok(!isStale(snap, snap.updatedAt + RATES_STALE_MS), "exactly two days old is not yet stale");
ok(isStale(snap, snap.updatedAt + RATES_STALE_MS + 1), "one millisecond past two days is stale");
ok(!isStale(snap, snap.updatedAt), "fresh rates are not stale");

// ---- reference view --------------------------------------------------------------------------------------------------------
// 100 EUR owed booked at 295, 40 EUR owed-by-you booked at 290. Books: 29,500 - 11,600 = 17,900. Today at 300: 30,000 - 12,000 = 18,000.
const v = referenceView({ receivableUnits: 100, payableUnits: 40, bookedNet: 17_900, rate: 300 });
ok(near(v.receivableNow, 30_000) && near(v.payableNow, 12_000) && near(v.netNow, 18_000), "reference view values each side at today's rate");
ok(near(v.differenceFromBooks, 100), "difference is today's net minus the booked net");
const down = referenceView({ receivableUnits: 100, payableUnits: 0, bookedNet: 30_000, rate: 280 });
ok(near(down.differenceFromBooks, -2_000), "a weaker foreign currency shows a negative difference");
ok(near(referenceView({ receivableUnits: 0, payableUnits: 0, bookedNet: 0, rate: 300 }).differenceFromBooks, 0), "nothing unpaid: no difference");

// ---- units behind the booked figures (lib/fxExposure.ts) -------------------------------------------------------------------
const exposure = computeFxExposure({
  receivables: [{ items: [{ saleId: "s1", amountOutstanding: 2950 }, { saleId: "s2", amountOutstanding: 900 }] }] as any,
  payables: [{ purchaseId: "p1", amountOutstanding: 1160 }] as any,
  sales: [
    { id: "s1", date: "2026-10-01", currency: "EUR", exchangeRate: 295 },
    { id: "s2", date: "2026-10-02", currency: "EUR", exchangeRate: 300 },
  ] as any,
  purchases: [{ id: "p1", date: "2026-10-03", currency: "EUR", exchangeRate: 290 }] as any,
  baseCurrency: "LKR",
  totalReceivable: 3850,
  totalPayable: 1160,
});
const eur = exposure.rows.find((r) => r.currency === "EUR")!;
ok(eur !== undefined && near(eur.receivableUnits, 2950 / 295 + 900 / 300), "receivable units = each item divided by its own booked rate");
ok(eur !== undefined && near(eur.payableUnits, 1160 / 290), "payable units = the bill divided by its booked rate");
ok(eur !== undefined && near(eur.receivable, 3850) && near(eur.payable, 1160), "booked figures are unchanged by the units work");

// ---- wiring ----------------------------------------------------------------------------------------------------------------
const route = read("app/api/fx/rates/route.ts");
ok(/export async function GET\(/.test(route), "the rates route exports GET");
ok(!/export (async )?function (POST|PUT|PATCH|DELETE)|export const (?!runtime|maxDuration)\w+ =/.test(route), "the rates route exports only handlers and config");
ok(/await requireSignedIn\(req\)/.test(route) && /AiAuthError/.test(route), "the rates route requires a signed-in member of a business");
ok(/export async function requireSignedIn/.test(read("lib/firebaseAdmin.ts")) && /verifyIdToken\(idToken\)/.test(read("lib/firebaseAdmin.ts")), "requireSignedIn verifies the token and the membership");
ok(/CACHE_MS = 6 \* 60 \* 60 \* 1000/.test(route) && /cache = \{ snap, fetchedAt: Date\.now\(\) \}/.test(route), "rates are cached for six hours, shared by every business");
ok(/return cache\?\.snap \?\? null/.test(route), "if the source is down, the last good copy is served, never a guess");
ok(!/updateSettings|getAdminDb|\.set\(|\.update\(|\.add\(|\.delete\(/.test(route), "the rates route writes nothing");
const card = read("components/FxExposureCard.tsx");
ok(/RATES_ATTRIBUTION/.test(card) && /RATES_ATTRIBUTION_URL/.test(card), "the attribution the source requires is shown");
ok(/never replaces the rate you booked/.test(card), "the card says the reference never replaces the booked rate");
ok(/Nothing here changes your books\./.test(card), "the card says plainly that it changes nothing in the books");
ok(/const hasForeign = exposure\.rows\.length > 0;/.test(card), "the card is computed from real foreign balances, so it hides when there are none");
ok(!/updateSettings|addSale|updateSale|addPurchase|updatePurchase|addPayment|deleteSale|deletePurchase/.test(card), "the card changes nothing in the books");
ok(/Reference rates are unavailable right now/.test(card), "if rates cannot be loaded, the card says so and still works");
ok(/return null;\s*\}?\s*$/m.test(card) || /if \(!hasForeign\) return null;/.test(card), "the card still hides when nothing foreign is unpaid");
ok(/Reference rates are more than two days old/.test(card), "stale rates are said to be stale");
ok(/fetch\("\/api\/fx\/rates"/.test(card) && /authorization: `Bearer \$\{idToken\}`/.test(card), "the card sends the signed-in token to the rates route");
const hooksBeforeReturn = card.indexOf("useEffect(") < card.indexOf("if (!hasForeign) return null;");
ok(hooksBeforeReturn, "all hooks run before the card's early return");

// ---- suggested rate for a form (auto-fill) -----------------------------------------------------------------------------------
ok(suggestRate(snap, "USD", "LKR") === 300, "a suggestion is the rate itself when it is a whole number");
ok(suggestRate(snap, "EUR", "LKR") === Math.round((300 / 0.9) * 10_000) / 10_000, "a suggestion is rounded to 4 decimals (the form's precision)");
ok(suggestRate(snap, "LKR", "LKR") === null, "no suggestion for the business currency itself");
ok(suggestRate(snap, "XYZ", "LKR") === null, "no suggestion for a currency the source does not list");
ok(suggestRate(snap, "JPY", "LKR") !== null && suggestRate(snap, "JPY", "LKR")! > 0, "a small-value currency still gets a positive suggestion");

// Fill rules (components/QuickForms.tsx, app/purchases/page.tsx, hooks/useReferenceRate.ts), read from source.
const hook = read("hooks/useReferenceRate.ts");
ok(/rate === "" \|\| Number\(rate\) === 1/.test(hook), "the fill replaces only an empty or default '1' rate, never a rate already typed or saved");
ok(/\[currency, base, refStr\]/.test(hook), "the fill runs when the currency or the reference changes, not on every keystroke");
ok(/if \(currency === base \|\| refStr === null\) return;/.test(hook), "no fill for the business currency or when no reference is loaded");
ok(/if \(!needs \|\| !user\) return;/.test(hook), "no request until a signed-in user exists and a foreign currency is picked");
ok(/if \(!snap \|\| !needs\) return null;/.test(hook), "without rates the hook returns null, so forms behave as before");
ok(/const body = \(await res\.json/.test(hook) && /if \(!res\.ok\) return cached\?\.snap \?\? null;/.test(hook), "a failed request keeps the last good rates, never invents one");
const qf = read("components/QuickForms.tsx");
ok((qf.match(/useFillReferenceRate\(\{/g) ?? []).length === 2, "both sale and purchase-style forms in QuickForms fill the rate");
ok((qf.match(/reference=\{referenceRate\}/g) ?? []).length === 2, "both rate boxes get the reference and show the hint");
ok(/import \{ useFillReferenceRate, useReferenceRate \} from "@\/hooks\/useReferenceRate";/.test(qf), "QuickForms imports the hooks");
const pg = read("app/purchases/page.tsx");
ok(/useFillReferenceRate\(\{ currency: txCurrency, base: baseCurrency/.test(pg) && /<ReferenceRateHint/.test(pg), "the purchases page fills its rate and shows the hint");
const hint = read("components/ReferenceRateHint.tsx");
ok(/Check it against what you actually paid or received/.test(hint), "a filled rate tells the person to check it against what was actually paid or received");
ok(/if \(currency === base \|\| reference === null\) return null;/.test(hint), "the hint shows nothing without a reference or for the business currency");
ok(!/updateSettings|addSale|addPurchase|updateSale|updatePurchase/.test(hint + hook), "the hook and hint change no records");

// The production build lints rendered text: a bare apostrophe in JSX text fails it (react/no-unescaped-entities).
for (const f of ["components/FxExposureCard.tsx", "components/ReferenceRateHint.tsx"]) {
  const lines = read(f).split("\n").filter((l) => /^\s*[A-Za-z(][^=;{}"]*$|>[^<{}]*</.test(l) && !/^\s*\/\//.test(l));
  ok(lines.every((l) => !/[A-Za-z]'[a-z]/.test(l.replace(/&apos;/g, ""))), `${f}: no bare apostrophe in rendered text (the build would fail)`);
}
console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
