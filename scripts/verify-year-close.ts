// Year-end close (lib/yearClose.ts and the Operations tab): the close needs November closed, a balanced balance sheet and trial balance, a confirmed journal and
// the owner's confirmation; it locks through 31 December; a year already closed is reported; a later lock is never moved back; the tab is for the owner only.
// Worked numbers. Run: npx tsx scripts/verify-year-close.ts
import fs from "node:fs";
import { buildYearEndChecklist, yearEndLockUpdate, yearEndIso } from "../lib/yearClose";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const ready = { year: 2026, booksClosedThrough: "2026-11-30", balanceSheetBalances: true, trialBalanceBalanced: true, journalReconciledConfirmed: true, ownerConfirmed: true };
const r = buildYearEndChecklist(ready);
ok(r.readyToClose && r.lockThrough === "2026-12-31", "with November closed, both statements balancing, the journal confirmed and the owner's confirmation, the year closes through 31 December");
ok(buildYearEndChecklist({ ...ready, booksClosedThrough: "2026-10-31" }).readyToClose === false, "the close is not ready while November is still open");
ok(buildYearEndChecklist({ ...ready, balanceSheetBalances: false }).readyToClose === false, "an unbalanced balance sheet stops the close");
ok(buildYearEndChecklist({ ...ready, trialBalanceBalanced: false }).readyToClose === false, "an unbalanced trial balance stops the close");
ok(buildYearEndChecklist({ ...ready, ownerConfirmed: false }).readyToClose === false, "without the owner's confirmation, the year does not close");
ok(buildYearEndChecklist({ ...ready, journalReconciledConfirmed: false }).readyToClose === false, "an unconfirmed journal reconciliation stops the close");
const done = buildYearEndChecklist({ ...ready, booksClosedThrough: "2026-12-31" });
ok(done.alreadyClosed === true && done.readyToClose === false, "a year already closed is reported as closed, not closed again");
ok(yearEndLockUpdate({ year: 2026, booksClosedThrough: "2027-01-31" }) !== null, "a lock already later than the year end is never moved back");
ok(yearEndLockUpdate({ year: 2026, booksClosedThrough: "2026-11-30" }) === null, "moving the lock forward from November to the year end is allowed");
ok(yearEndIso(2027) === "2027-12-31", "the year end is 31 December of the year chosen");

ok(tabsForRole("owner").includes("yearend") && !tabsForRole("manager").includes("yearend") && !tabsForRole("staff").includes("yearend"), "the year-end close is for the owner alone");
const screen = read("components/ops/YearEndPanel.tsx");
ok(screen.includes("buildYearEndChecklist(") && screen.includes("updateSettings({ booksClosedThrough"), "the close sets the same lock as the monthly close");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
