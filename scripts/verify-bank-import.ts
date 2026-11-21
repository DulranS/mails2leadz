// Re-importing a bank statement must not double its lines. Hand-worked cases for lib/bankImport.ts.
//
// Run: npx tsx scripts/verify-bank-import.ts

import { splitNewStatementLines, statementLineKey } from "../lib/bankImport";

let failed = 0;
let passed = 0;
function check(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error("FAIL:", msg);
  }
}

type L = { date: string; description: string; amount: number };
const line = (date: string, description: string, amount: number): L => ({ date, description, amount });

// 1. Key ignores case and extra spaces, and matches to the cent
check(
  statementLineKey(line("2026-10-01", "  POS   Kamal  Hardware ", -4500)) === statementLineKey(line("2026-10-01", "pos kamal hardware", -4500)),
  "key ignores case and repeated spaces"
);
check(
  statementLineKey(line("2026-10-01", "x", 12.1)) === statementLineKey(line("2026-10-01", "x", 12.1000001)),
  "key matches amounts to the cent"
);
check(
  statementLineKey(line("2026-10-01", "x", 12.1)) !== statementLineKey(line("2026-10-01", "x", 12.11)),
  "key separates different cents"
);

// 2. First import into an empty list keeps everything, including two identical same-day payments
{
  const incoming = [line("2026-10-02", "DD RENT", -1200), line("2026-10-02", "DD RENT", -1200), line("2026-10-03", "POS X", 300)];
  const r = splitNewStatementLines(incoming, []);
  check(r.fresh.length === 3 && r.duplicates.length === 0, "first import keeps two identical same-day lines");
}

// 3. Re-importing the same file adds nothing
{
  const file = [line("2026-10-02", "DD RENT", -1200), line("2026-10-03", "POS X", 300)];
  const r = splitNewStatementLines(file, file);
  check(r.fresh.length === 0 && r.duplicates.length === 2, "re-importing the same file adds nothing");
}

// 4. Counts: list holds two identical lines, file holds three, so only one new copy is added
{
  const existing = [line("2026-10-02", "DD RENT", -1200), line("2026-10-02", "DD RENT", -1200)];
  const incoming = [line("2026-10-02", "DD RENT", -1200), line("2026-10-02", "DD RENT", -1200), line("2026-10-02", "DD RENT", -1200)];
  const r = splitNewStatementLines(incoming, existing);
  check(r.fresh.length === 1 && r.duplicates.length === 2, "two already on the list, three in the file: one new copy added");
}

// 5. A line already reviewed (matched or ignored) still counts as on the list. The caller passes all lines, any status.
{
  const existing = [line("2026-10-04", "BANK CHARGE", -150)];
  const r = splitNewStatementLines([line("2026-10-04", "BANK CHARGE", -150)], existing);
  check(r.fresh.length === 0, "a reviewed line is not put back in front of the person");
}

// 6. A different amount, date or description is a new line
{
  const existing = [line("2026-10-05", "POS A", -100)];
  const incoming = [line("2026-10-05", "POS A", -101), line("2026-10-06", "POS A", -100), line("2026-10-05", "POS B", -100)];
  const r = splitNewStatementLines(incoming, existing);
  check(r.fresh.length === 3 && r.duplicates.length === 0, "different amount, date or description is not a duplicate");
}

// 7. Order of fresh lines follows the file
{
  const incoming = [line("2026-10-07", "A", 1), line("2026-10-07", "B", 2), line("2026-10-07", "C", 3)];
  const r = splitNewStatementLines(incoming, [line("2026-10-07", "B", 2)]);
  check(
    r.fresh.map((x) => x.description).join(",") === "A,C" && r.duplicates.map((x) => x.description).join(",") === "B",
    "fresh and duplicate lines keep file order"
  );
}

// 8. The incoming row objects are returned as-is (extra fields are not dropped)
{
  const row = { date: "2026-10-08", description: "EXTRA", amount: 5, rowNote: "kept" };
  const r = splitNewStatementLines([row], []);
  check(r.fresh[0] === row, "fresh rows are the same objects passed in");
}

console.log(`${passed}/${passed + failed} checks passed`);
if (failed > 0) process.exitCode = 1;
