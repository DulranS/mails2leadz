// Electronics-trade records (lib/electronicsRecords.ts): price-protection arithmetic, licence expiry windows, the trade-in and
// price-protection validation, and the totals. Hand-worked values. Run: npx tsx scripts/verify-electronics.ts
import fs from "node:fs";
import { licenceStatus, licencesToWatch, priceProtectionClaim, priceProtectionOpen, projectBudgetOpen, tradeInOwed, validateElectronics, type StoredElectronicsRecord } from "../lib/electronicsRecords";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}
const today = "2026-11-02";

ok(priceProtectionClaim(120000, 105000, 8) === 120000, "a 15000 drop on 8 units is a 120000 claim");
ok(priceProtectionClaim(50000, 50000, 10) === 0, "no drop, no claim");
ok(priceProtectionClaim(50000, 60000, 10) === 0, "a price rise is never a claim");
ok(priceProtectionClaim(999.99, 899.99, 3) === 300, "cents are kept exact (100 x 3)");
ok(priceProtectionClaim(10000, 9000, 0) === 0, "no units held, no claim");

ok(licenceStatus(undefined, today) === "none", "a licence with no expiry is 'none'");
ok(licenceStatus("2026-10-30", today) === "expired", "an expiry in the past is expired");
ok(licenceStatus("2026-12-15", today) === "expiring", "43 days away is inside the 60-day window");
ok(licenceStatus("2027-06-01", today) === "ok", "well away is ok");

const records: StoredElectronicsRecord[] = [
  { id: "1", createdAt: 1, kind: "licence", name: "Trade licence", expiryDate: "2027-01-31" },
  { id: "2", createdAt: 2, kind: "licence", name: "Import permit", expiryDate: "2026-11-20" },
  { id: "3", createdAt: 3, kind: "licence", name: "Old permit", expiryDate: "2026-10-01" },
  { id: "4", createdAt: 4, kind: "tradein", device: "iPhone 12", condition: "good", agreedCredit: 40000, date: "2026-11-01", status: "open" },
  { id: "5", createdAt: 5, kind: "tradein", device: "iPad", condition: "fair", agreedCredit: 25000, date: "2026-10-20", status: "credited" },
  { id: "6", createdAt: 6, kind: "pricedrop", product: "55in TV", oldPrice: 150000, newPrice: 139000, unitsOnHand: 4, date: "2026-10-25", status: "open" },
  { id: "7", createdAt: 7, kind: "pricedrop", product: "Earbuds", oldPrice: 12000, newPrice: 10000, unitsOnHand: 5, date: "2026-10-01", status: "claimed" },
];
const watch = licencesToWatch(records, today);
ok(watch.length === 2 && watch[0].r.name === "Old permit" && watch[1].r.name === "Import permit", "the expired and soon-to-expire licences are listed, soonest first");
ok(tradeInOwed(records) === 40000, "only open trade-in credit is owed (the credited one is not)");
ok(priceProtectionOpen(records) === 44000, "open price-protection claims add up (11000 x 4)");

ok(validateElectronics({ kind: "licence", name: " ", }) !== null, "a licence needs a name");
ok(validateElectronics({ kind: "licence", name: "A", issuedDate: "2026-05-01", expiryDate: "2026-04-01" }) !== null, "a licence cannot expire before it was issued");
ok(validateElectronics({ kind: "licence", name: "A", expiryDate: "2027-01-01" }) === null, "a licence with an expiry date is accepted");
ok(validateElectronics({ kind: "tradein", device: "", condition: "good", agreedCredit: 1, date: today, status: "open" }) !== null, "a trade-in needs the device");
ok(validateElectronics({ kind: "tradein", device: "Phone", condition: "good", agreedCredit: -5, date: today, status: "open" }) !== null, "trade-in credit cannot be negative");
ok(validateElectronics({ kind: "tradein", device: "Phone", condition: "broken" as never, agreedCredit: 5, date: today, status: "open" }) !== null, "trade-in condition must be one of the set");
ok(validateElectronics({ kind: "tradein", device: "Phone", condition: "good", agreedCredit: 5000, date: today, status: "open" }) === null, "a complete trade-in is accepted");
ok(validateElectronics({ kind: "pricedrop", product: "TV", oldPrice: 100, newPrice: 120, unitsOnHand: 2, date: today, status: "open" }) !== null, "a price rise is not a price-protection claim");
ok(validateElectronics({ kind: "pricedrop", product: "TV", oldPrice: 100, newPrice: 90, unitsOnHand: 1.5, date: today, status: "open" }) !== null, "units held must be whole");
ok(validateElectronics({ kind: "pricedrop", product: "TV", oldPrice: 100, newPrice: 90, unitsOnHand: 2, date: today, status: "open" }) === null, "a valid price drop is accepted");

const fs1 = fs.readFileSync("contexts/DataContext.tsx", "utf8");
ok(fs1.includes('collection(db, "users", businessId, "businessRecords")'), "the records are listened to");
ok(fs1.includes("addElectronicsRecord: async") && fs1.includes("deleteElectronicsRecord: async"), "records can be added and deleted");
ok(fs.readFileSync("firestore.rules", "utf8").includes("match /businessRecords/{docId}"), "rules cover the records");
ok(fs.readFileSync("lib/backupPayload.ts", "utf8").includes("businessRecords: data.businessRecords"), "the full backup includes the records");
ok(fs.readFileSync("components/AppShell.tsx", "utf8").includes('href: "/electronics"'), "the menu links to Electronics");
const page = fs.readFileSync("app/electronics/page.tsx", "utf8");
ok(page.includes("validateElectronics(") && page.includes("priceProtectionClaim("), "the page validates records and shows price-protection claims");

ok(validateElectronics({ kind: "project", name: "Earbuds v2", status: "idea", budget: 50000 }) === null, "a project with a name and stage is accepted");
ok(validateElectronics({ kind: "project", name: " ", status: "idea" }) !== null, "a project needs a name");
ok(validateElectronics({ kind: "project", name: "X", status: "bogus" as never }) !== null, "a project stage must be one of the set");
ok(validateElectronics({ kind: "project", name: "X", status: "idea", budget: -1 }) !== null, "a project budget cannot be negative");
ok(validateElectronics({ kind: "project", name: "X", status: "idea", targetDate: "next March" }) !== null, "a target date must be a date");
const projects: StoredElectronicsRecord[] = [
  { id: "p1", createdAt: 1, kind: "project", name: "Earbuds v2", status: "prototype", budget: 30000 },
  { id: "p2", createdAt: 2, kind: "project", name: "Soundbar", status: "launched", budget: 90000 },
  { id: "p3", createdAt: 3, kind: "project", name: "Charger", status: "idea", budget: 12000 },
];
ok(projectBudgetOpen(projects) === 42000, "open R&D budget excludes launched projects (30000 + 12000)");
console.log(`verify-electronics: ${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
