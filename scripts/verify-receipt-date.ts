// Empirical check for the receipt-scan date parser (lib/receiptDate.ts).
//
// Run: npx tsx scripts/verify-receipt-date.ts
// Re-runs itself under Asia/Colombo (UTC+5:30) when no TZ is set: the old `new Date(text).toISOString()` code
// filled the day BEFORE the receipt there, so a UTC-only run would pass vacuously.
import { spawnSync } from "node:child_process";
if (!process.env.TZ) {
  const r = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, TZ: "Asia/Colombo" } });
  process.exit(r.status ?? 1);
}
import { parseReceiptDate } from "../lib/receiptDate";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (input: string | null | undefined, want: string | null) => {
  const got = parseReceiptDate(input);
  check(`${JSON.stringify(input)} -> ${want}`, got === want, `got ${got}`);
};

// Year first
eq("2026-10-05", "2026-10-05");
eq("2026/10/05", "2026-10-05");
eq("2026-1-5", "2026-01-05");
// Day first, written out (the old code gave the day before in Colombo)
eq("5 Oct 2026", "2026-10-05");
eq("05 October 2026", "2026-10-05");
eq("1 JAN 2027", "2027-01-01");
// Numeric: ambiguous reads day first (Sri Lanka/UK), obvious ones are forced
eq("05/10/2026", "2026-10-05");
eq("5-10-2026", "2026-10-05");
eq("25/10/2026", "2026-10-25");
eq("10/25/2026", "2026-10-25");
eq("31/12/2026", "2026-12-31");
// Not real dates -> null (form left alone)
eq("31/02/2026", null);
eq("29/02/2026", null); // 2026 is not a leap year
eq("29/02/2028", "2028-02-29");
eq("13/13/2026", null);
eq("2026-13-01", null);
eq("1/1/0001", null);
eq("5 Foo 2026", null);
eq("", null);
eq(undefined, null);
eq(null, null);
eq("not a date", null);

// Exhaustive: every real calendar day 2024-2030 survives a day-first and a year-first round trip, and in
// no zone does the result shift by a day (it never touches Date's local-time maths).
let n = 0;
for (let y = 2024; y <= 2030; y++) {
  for (let m = 1; m <= 12; m++) {
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= dim; d++) {
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const a = parseReceiptDate(iso);
      const b = parseReceiptDate(`${d}/${m}/${y}`);
      const c = parseReceiptDate(`${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`);
      const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const e = parseReceiptDate(`${d} ${names[m - 1]} ${y}`);
      // day-first numeric is only guaranteed to match when d>12 or d==m (otherwise d/m and m/d differ only when both<=12, and day-first is the rule)
      check(`iso ${iso}`, a === iso, String(a));
      check(`d/m/y ${iso}`, b === iso, String(b));
      check(`dd-mm-yyyy ${iso}`, c === iso, String(c));
      check(`d Mon y ${iso}`, e === iso, String(e));
      n++;
    }
  }
}

console.log(`receipt-date: ${pass} checks passed, ${fail} failed (${n} calendar days round-tripped, TZ=${process.env.TZ})`);
process.exit(fail ? 1 : 0);
