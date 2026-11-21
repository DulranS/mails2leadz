// Empirical check that the CSV importers only accept dates that exist, and read ambiguous ones (05/10/2026)
// the way the FILE does (lib/csv.ts isoDate + detectDateOrder), via importSalesRows. A file with nothing to go
// on is read day-first (Sri Lanka, UK); it used to be month-first, which turned a Colombo 05/10/2026 into 10 May.
//
// Run: npx tsx scripts/verify-csv-import-dates.ts
import { importSalesRows, detectDateOrder } from "../lib/csv";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const products = [{ id: "p1", name: "Cement", sku: "C1" }] as any;
const sale = (date: string) => ({ product: "Cement", qty: "1", unitPrice: "10", date });
const run = (...dates: string[]) => importSalesRows(dates.map(sale), products);
const dates = (r: ReturnType<typeof run>) => r.rows.map((x) => x.date);

// 1. A single file: ISO and unambiguous values are never in doubt
for (const [input, want] of [
  ["2026-10-05", "2026-10-05"],
  ["2026/10/5", "2026-10-05"],
  ["25/10/2026", "2026-10-25"],  // can only be day first
  ["10/25/2026", "2026-10-25"],  // can only be month first
  ["25-10-2026", "2026-10-25"],
  ["2028-02-29", "2028-02-29"],  // leap day
  ["31/12/2026", "2026-12-31"],
  ["12/31/2026", "2026-12-31"],
] as const) {
  const r = run(input);
  check(`accepts ${input}`, r.errors.length === 0 && r.rows[0].date === want, JSON.stringify(r));
}

// 2. Ambiguous with nothing else to go on -> day first
check("lone 05/10/2026 is 5 October", dates(run("05/10/2026"))[0] === "2026-10-05");
check("lone 10/5/2026 is 10 May", dates(run("10/5/2026"))[0] === "2026-05-10");
check("lone 5-10-2026 is 5 October", dates(run("5-10-2026"))[0] === "2026-10-05");
check("detect: nothing to go on -> dmy", detectDateOrder([sale("05/10/2026")]) === "dmy");
check("detect: ISO only -> dmy", detectDateOrder([sale("2026-10-05")]) === "dmy");
check("detect: empty file -> dmy", detectDateOrder([]) === "dmy");

// 3. The file decides: a day-first-only date makes the whole file day-first ...
let r = run("25/10/2026", "05/10/2026", "01/02/2026");
check("day-first file keeps ambiguous day-first", JSON.stringify(dates(r)) === JSON.stringify(["2026-10-25", "2026-10-05", "2026-02-01"]), JSON.stringify(dates(r)));
// ... and a month-first-only date makes the whole file month-first
r = run("10/25/2026", "05/10/2026", "01/02/2026");
check("month-first file reads ambiguous month-first", JSON.stringify(dates(r)) === JSON.stringify(["2026-10-25", "2026-05-10", "2026-01-02"]), JSON.stringify(dates(r)));
check("detect: month-first file -> mdy", detectDateOrder([sale("10/25/2026"), sale("05/10/2026")]) === "mdy");
// A file with both kinds of proof is contradictory: day-first wins for the ambiguous rows, proven rows stay right
r = run("25/10/2026", "10/25/2026", "05/10/2026");
check("contradictory file: proven rows right, ambiguous day-first", JSON.stringify(dates(r)) === JSON.stringify(["2026-10-25", "2026-10-25", "2026-10-05"]), JSON.stringify(dates(r)));
// Only date-named columns vote (a phone number or note must not change the order)
check("non-date columns do not vote", detectDateOrder([{ notes: "10/25/2026", date: "05/10/2026" } as any]) === "dmy");

// 4. Not real dates are rejected, never saved
for (const input of ["2026-02-31", "2026-13-45", "2026-00-10", "2026-10-00", "2026/02/30", "2/30/2026", "30/2/2026x", "2/29/2026", "13/13/2026", "31/31/2026", "1/1/1800", "", "tomorrow"]) {
  const x = run(input);
  check(`rejects ${JSON.stringify(input)}`, x.errors.length === 1 && x.rows[0].date === "", JSON.stringify(x));
}
check("29 Feb in a non-leap year rejected (day-first)", run("29/02/2026").errors.length === 1);
check("29 Feb in a leap year accepted (day-first)", run("29/02/2028").rows[0].date === "2028-02-29");

console.log(`csv-import-dates: ${pass} checks passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
