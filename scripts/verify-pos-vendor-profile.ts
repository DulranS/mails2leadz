// POS vendor profiles (v319, lib/posVendorProfile.ts): the column suggestion for a common export, the save checks, the lookup and the
// missing-column warning, the row mapping (per item, line total, qty missing, payment and transaction id kept in notes), and that the
// mapped rows pass the existing sales importer. The wizard wiring is checked by reading its source. Pure: no network, no database.
// Run: NODE_PATH=<scratchpad>/shim/node_modules npx tsx scripts/verify-pos-vendor-profile.ts  (papaparse is needed by lib/csv.ts)
import fs from "node:fs";
import path from "node:path";
import { suggestVendorMapping, validateVendorProfile, findVendorProfile, missingProfileColumns, applyVendorProfile, normalisePaymentMethod } from "../lib/posVendorProfile";
import { importSalesRows } from "../lib/csv";
import type { PosVendorProfile, Product } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

const headers = ["Date", "Time", "Item Name", "Qty", "Price", "Payment Type", "Transaction ID", "Customer"];
const sug = suggestVendorMapping(headers);
ok(sug.product === "Item Name" && sug.date === "Date" && sug.qty === "Qty", "the item, date and quantity columns are suggested");
ok(sug.unitPrice === "Price" && sug.paymentMethod === "Payment Type" && sug.transactionId === "Transaction ID", "the price, payment and transaction columns are suggested");

const good = { name: "Till 1 export", mapping: sug, priceIsTotal: false };
ok(validateVendorProfile(good) === null, "a complete profile with a name validates");
ok(validateVendorProfile({ ...good, name: " a " }) !== null, "a one-character name is refused");
ok(validateVendorProfile({ ...good, name: "x".repeat(61) }) !== null, "a name over 60 characters is refused");
ok(validateVendorProfile({ ...good, mapping: { ...sug, unitPrice: null } })?.includes("Unit price") === true, "a profile with no unit price column is refused, and the field is named");
ok(validateVendorProfile({ ...good, mapping: { ...sug, product: "" } })?.includes("Item sold") === true, "a blank item column is refused");
ok(validateVendorProfile({ ...good, mapping: { ...sug, qty: null, paymentMethod: null, transactionId: null } }) === null, "quantity, payment and transaction are optional");

const saved: PosVendorProfile[] = [{ name: "Till 1 Export", mapping: sug, priceIsTotal: false, savedAt: 1 }];
ok(findVendorProfile(saved, "  till 1   export ") !== null, "a profile is found by name, ignoring case and extra spaces");
ok(findVendorProfile(saved, "Till 2") === null && findVendorProfile(undefined, "x") === null, "an unknown name, or no profiles, finds nothing");
ok(missingProfileColumns(saved[0], headers).length === 0, "a file with every mapped column reports nothing missing");
ok(JSON.stringify(missingProfileColumns(saved[0], ["Date", "Item Name", "Price"])) === JSON.stringify(["Qty", "Payment Type", "Transaction ID"]), "the renamed or absent columns are named");

const raw = [
  { Date: "2026-11-03 14:32:00", Time: "14:32", "Item Name": "Flat White", Qty: "2", Price: "450", "Payment Type": "Visa Card", "Transaction ID": "TX-1001", Customer: "" },
  { Date: "2026-11-03", Time: "15:00", "Item Name": "Croissant", Qty: "1", Price: "300", "Payment Type": "Cash", "Transaction ID": "", Customer: "" },
];
const per = applyVendorProfile(raw, saved[0]);
ok(per[0].date === "2026-11-03" && per[0].product === "Flat White", "the date keeps only the day, and the item is renamed to the sales field");
ok(per[0].unitPrice === "450" && per[0].qty === "2", "a per-item price is kept as it is");
ok(per[0].notes === "Payment: card · Transaction: TX-1001" && per[1].notes === "Payment: cash", "payment method is normalised and the transaction id goes into the notes");

const total = applyVendorProfile([{ Date: "2026-11-03", "Item Name": "Flat White", Qty: "2", Price: "900" }], { ...saved[0], mapping: { ...sug, paymentMethod: null, transactionId: null }, priceIsTotal: true });
ok(total[0].unitPrice === "450", "a line total is divided by the quantity to get the per-item price");

const noQty = applyVendorProfile([{ Date: "2026-11-03", "Item Name": "Espresso", Price: "200" }], { ...saved[0], mapping: { ...sug, qty: null, paymentMethod: null, transactionId: null } });
ok(noQty[0].qty === "1" && noQty[0].unitPrice === "200", "with no quantity column every row is one item");

ok(normalisePaymentMethod("Mastercard") === "card" && normalisePaymentMethod("EFT") === "bank_transfer" && normalisePaymentMethod("Voucher") === "Voucher", "payment labels map to cash, card or bank transfer, and anything else keeps its own words");
ok(normalisePaymentMethod("") === "", "a blank payment is blank");

// the mapped rows pass the existing sales importer
const products = [{ id: "p1", name: "Flat White", sku: "FW", category: "Drinks" }, { id: "p2", name: "Croissant", sku: "CR", category: "Bakery" }] as unknown as Product[];
const imp = importSalesRows(applyVendorProfile(raw, saved[0]), products);
ok(imp.errors.length === 0 && imp.rows.length === 2, "the mapped rows import with no errors");
ok(imp.rows[0].qty === 2 && imp.rows[0].unitPrice === 450 && imp.rows[0].notes === "Payment: card · Transaction: TX-1001", "the imported sale has the quantity, price and notes");
const bad = importSalesRows(applyVendorProfile([{ Date: "2026-11-03", "Item Name": "Unknown thing", Qty: "1", Price: "5" }], saved[0]), products);
ok(bad.errors.length === 1 && bad.errors[0].message.includes("Unknown product"), "an item that is not in the product list is still a row error, not hidden");

// the wizard uses the profile when one is chosen, and the import path is unchanged without one
const root = path.resolve(process.cwd());
const wiz = fs.readFileSync(path.join(root, "components/PosImportWizard.tsx"), "utf8");
ok(wiz.includes("findVendorProfile") && wiz.includes("saveLayout") && wiz.includes("posVendorProfiles: [...others, candidate]"), "the wizard reads and saves named layouts");
ok(wiz.includes("if (entity === \"sales\" && layoutName) return applyVendorProfile(sourceRows, layoutAsShown(layoutName));") && wiz.includes("const applied = applyMapping(sourceRows, mapping);"), "the wizard applies the chosen layout, and the unchanged mapping path stays for no layout");
const settingsTypeSrc = fs.readFileSync(path.join(root, "lib/types.ts"), "utf8");
ok(settingsTypeSrc.includes("posVendorProfiles?: PosVendorProfile[]"), "the settings hold the named profiles");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) { console.error(`${fails} failed`); process.exit(1); }
