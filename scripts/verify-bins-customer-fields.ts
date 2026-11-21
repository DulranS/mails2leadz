// Shelf or bin locations (lib/bins.ts) and extra customer details (lib/customerFields.ts): cleaning, the shelf order of the
// stock count with hand-worked cases, the four-name limit, and the wiring. Run: npx tsx scripts/verify-bins-customer-fields.ts
import fs from "node:fs";
import { cleanBin, compareByBin } from "../lib/bins";
import { cleanCustomFields, parseCustomerFieldLabels, MAX_CUSTOMER_FIELDS } from "../lib/customerFields";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

ok(cleanBin("  A-03  ") === "A-03" && cleanBin("Fridge   2") === "Fridge 2", "a bin is trimmed and its spaces collapsed");
ok(cleanBin("") === undefined && cleanBin("   ") === undefined && cleanBin(undefined) === undefined, "a blank bin means none (undefined, so it clears)");
ok(cleanBin("x".repeat(40))!.length === 20, "a bin is cut to 20 characters");

const items = [
  { name: "Zebra cake" },
  { name: "Milk", binLocation: "A-10" },
  { name: "Bread", binLocation: "A-2" },
  { name: "Apples", binLocation: "B-1" },
  { name: "Aardvark bar" },
  { name: "Butter", binLocation: "a-2" },
];
const sorted = [...items].sort(compareByBin).map((i) => i.name);
ok(sorted[0] === "Bread" && sorted[1] === "Butter", "A-2 comes before A-10 (numbers in order), and a-2 sorts with A-2 ignoring case");
ok(sorted.indexOf("Milk") < sorted.indexOf("Apples"), "A-10 comes before B-1");
ok(sorted.slice(-2).join(",") === "Aardvark bar,Zebra cake", "items with no bin come last, in name order");

const labels = parseCustomerFieldLabels("Vehicle number,  Birthday ,");
ok(!labels.error && labels.labels.join("|") === "Vehicle number|Birthday", "labels are trimmed and blanks dropped");
ok(!!parseCustomerFieldLabels("A, B, C, D, E").error, `at most ${MAX_CUSTOMER_FIELDS} extra details`);
ok(!!parseCustomerFieldLabels("Birthday, birthday").error, "the same name twice is refused, ignoring case");
ok(!!parseCustomerFieldLabels("x".repeat(31)).error, "a name longer than 30 characters is refused");
ok(parseCustomerFieldLabels("").labels.length === 0 && !parseCustomerFieldLabels("").error, "an empty list is no details");

const values = cleanCustomFields(["Vehicle number", "Birthday"], { "Vehicle number": "  CAB 1234 ", Birthday: "", Old: "gone" });
ok(values !== undefined && values["Vehicle number"] === "CAB 1234" && !("Birthday" in values) && !("Old" in values), "only named details with a value are kept");
ok(cleanCustomFields(["Birthday"], { Birthday: "  " }) === undefined, "no values at all stores nothing");

const count = fs.readFileSync("components/StockCountSheet.tsx", "utf8");
ok(/\.sort\(compareByBin\)/.test(count) && /Shelf \$\{p\.binLocation\}/.test(count), "the stock count lists items in shelf order and shows the shelf");
const products = fs.readFileSync("app/products/page.tsx", "utf8");
ok(/binLocation: cleanBin\(binText\)/.test(products), "the product form saves the shelf");
const patch = fs.readFileSync("lib/firestorePatch.ts", "utf8");
ok(/PRODUCT_CLEARABLE_FIELDS = \[[^\]]*"binLocation"/.test(patch), "clearing a shelf removes it from the product");
const customers = fs.readFileSync("app/customers/page.tsx", "utf8");
ok(/customFields: cleanCustomFields\(customerLabels, customValues\)/.test(customers), "the customer form saves the extra details");
ok(/customer\.customFields \?\? \{\}/.test(customers), "the customer card shows the extra details");
const settings = fs.readFileSync("app/settings/page.tsx", "utf8");
ok(/customerFieldLabels: fields\.labels/.test(settings), "settings save the extra detail names");
const types = fs.readFileSync("lib/types.ts", "utf8");
ok(/binLocation\?: string;/.test(types) && /customFields\?: Record<string, string>;/.test(types) && /customerFieldLabels\?: string\[\];/.test(types), "the types carry the new fields");

console.log(`verify-bins-customer-fields: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
