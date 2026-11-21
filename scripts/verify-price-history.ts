// Price history (lib/priceHistory.ts): which price changes are recorded, the percentage moved, and the wiring (append-only rule, same
// write as the change, backup, and the price-control card). Run: npx tsx scripts/verify-price-history.ts
import fs from "node:fs";
import { changePercent, priceChangesFor } from "../lib/priceHistory";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(priceChangesFor({ defaultSellPrice: 100 }, { defaultSellPrice: 100 }).length === 0, "an unchanged price records nothing");
const changed = priceChangesFor({ defaultSellPrice: 100, defaultCostPrice: 60 }, { defaultSellPrice: 120, defaultCostPrice: 60 });
ok(changed.length === 1 && changed[0].field === "sell" && changed[0].oldValue === 100 && changed[0].newValue === 120, "only the price that changed is recorded, with old and new values");
ok(priceChangesFor({}, { defaultCostPrice: 45 })[0]?.oldValue === undefined && priceChangesFor({}, { defaultCostPrice: 45 })[0]?.newValue === 45, "a price set for the first time records no old value");
ok(priceChangesFor({ wholesalePrice: 80 }, { wholesalePrice: null })[0]?.newValue === undefined, "a cleared price records the clearing");
ok(priceChangesFor({ defaultSellPrice: 100 }, { }).length === 0, "a price not part of this update is left alone");
ok(priceChangesFor({ defaultSellPrice: 100 }, { defaultCostPrice: 50 }).every((c) => c.field === "cost"), "a price that is part of the update is recorded; the one that is not is not");
ok(changePercent(100, 120) === 20 && changePercent(200, 150) === -25, "the change is a percentage of the old price");
ok(changePercent(0, 5) === null && changePercent(undefined, 5) === null, "no percentage when the old price was zero or missing");

const rules = read("firestore.rules");
ok(/match \/priceHistory\/\{docId\} \{[\s\S]*?allow update, delete: if false;/.test(rules), "rules: the price history can be added to but never edited or removed");
const ctx = read("contexts/DataContext.tsx");
ok(ctx.includes('batch.set(doc(collection(db, "users", bizId, "priceHistory"))') && ctx.includes("priceChangesFor(before"), "each price change is appended in the same batch as the product update");
ok(read("lib/backupPayload.ts").includes("priceHistory: data.priceHistory") && read("scripts/restore-from-backup.mjs").includes('"priceHistory"'), "the price history is in the backup and the restore");
ok(read("app/price-control/page.tsx").includes("<PriceChangesCard />"), "the price-control page shows the recent changes");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
