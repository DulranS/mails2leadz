// Fixed-asset disposals in the journal (lib/journalMapping.ts disposalEntry): a sale above book value gives a gain, a sale below gives a loss, a write-off gives
// a loss equal to the book value, every entry balances, and the asset's cost and accumulated depreciation both leave the books. Worked numbers.
// Run: npx tsx scripts/verify-disposals.ts
import { disposalEntry } from "../lib/journalMapping";
import type { JEntry } from "../lib/journal";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const amt = (e: JEntry, acc: string, side: "debit" | "credit") => e.lines.find((l) => l.account === acc)?.[side] ?? 0;

// Cost 12,000; accumulated depreciation 7,000, so book value 5,000
const sold = disposalEntry("a", "Press", "2026-06-30", 12000, 7000, 6000);
ok(!("error" in sold), "a sale is accepted: every entry balances");
const s = sold as JEntry;
ok(amt(s, "Cash", "debit") === 6000 && amt(s, "Accumulated depreciation", "debit") === 7000 && amt(s, "Fixed assets (cost)", "credit") === 12000, "cash in 6,000; accumulated 7,000 cleared; cost 12,000 removed");
ok(amt(s, "Gain on disposal", "credit") === 1000 && amt(s, "Loss on disposal", "debit") === 0, "sold for 6,000 against a book value of 5,000 is a gain of 1,000");
const cheap = disposalEntry("b", "Press", "2026-06-30", 12000, 7000, 3000) as JEntry;
ok(amt(cheap, "Loss on disposal", "debit") === 2000 && amt(cheap, "Gain on disposal", "credit") === 0, "sold for 3,000 against a book value of 5,000 is a loss of 2,000");
const scrapped = disposalEntry("c", "Press", "2026-06-30", 12000, 7000, 0) as JEntry;
ok(amt(scrapped, "Loss on disposal", "debit") === 5000, "a write-off with nothing received loses the whole book value of 5,000");
ok(disposalEntry("d", "Press", "2026-13-40", 1, 0, 0) !== null && "error" in disposalEntry("d", "Press", "2026-13-40", 1, 0, 0), "a disposal with a date that is not real is refused");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
