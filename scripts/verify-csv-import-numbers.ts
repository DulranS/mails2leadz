// Empirical check for CSV number reading (lib/csv.ts parseAmount), the way spreadsheets and banks write them.
// Old behaviour (strip everything that is not a digit, minus or dot) was silently wrong for "Rs. 1,200" (-> 0.12),
// for "(500.00)" (-> +500, so a bank withdrawal became a deposit) and for "1E+06" (-> 106).
//
// Run: npx tsx scripts/verify-csv-import-numbers.ts
import { parseAmount, importSalesRows } from "../lib/csv";
import { finalizeSalesRows } from "../lib/posImport";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };
const eq = (input: string, want: number | null) => {
  const got = parseAmount(input);
  check(`${JSON.stringify(input)} -> ${want}`, got === want || (got !== null && want !== null && Math.abs(got - want) < 1e-9), `got ${got}`);
};

// Plain and grouped
eq("1250.5", 1250.5); eq(" 1250.50 ", 1250.5); eq("1,250.50", 1250.5); eq("1,250,000", 1250000);
eq("1,25,000", 125000);            // lakh-style grouping still reads
eq("1 250.50", 1250.5);            // space grouping
eq("1\u00a0250.50", 1250.5);       // non-breaking space
eq(".5", 0.5); eq("0.5", 0.5); eq("0", 0); eq("-5", -5); eq("+5", 5); eq("-0.25", -0.25);
// Currency decoration: the Sri Lankan forms are the ones that were silently wrong
eq("Rs. 1,200", 1200); eq("Rs.1,200", 1200); eq("Rs 1,200.00", 1200); eq("RS. 1,200", 1200);
eq("LKR 1,200", 1200); eq("1,200 LKR", 1200); eq("$1,250.50", 1250.5); eq("USD 99", 99); eq("\u20a8 1,200", 1200);
eq("1,200/-", 1200); eq("Rs. 1,200/=", 1200); eq("12%", 12); eq("12.5 %", 12.5);
// Signs: accounting negatives must stay negative (a bank withdrawal must not become a deposit)
eq("(500.00)", -500); eq("(1,250.50)", -1250.5); eq("500-", -500); eq("-Rs. 1,200", -1200); eq("Rs. -1,200", -1200); eq("($1,200)", -1200); eq("-(5)", null);
// Scientific notation from Excel
eq("1E+06", 1000000); eq("1.5E3", 1500); eq("2e-2", 0.02);
// Not numbers -> null (reported as a row error, never guessed)
for (const bad of ["", " ", "abc", "-", ".", "Rs.", "12-15", "1.250,50", "12,50", "1,25", "1.2.3", "--5", "5 5 5x1", "1,2,,", "1,2", ",5", "5,", "NaN", "Infinity", "(", "()", "1/2"]) {
  check(`rejects ${JSON.stringify(bad)}`, parseAmount(bad) === null, String(parseAmount(bad)));
}
check("undefined -> null", parseAmount(undefined) === null);
check("null -> null", parseAmount(null) === null);

// End to end through the importers
const products = [{ id: "p1", name: "Cement", sku: "C1" }] as any;
const sales = importSalesRows([{ product: "Cement", qty: "2", unitPrice: "Rs. 1,200", date: "2026-10-05" }], products);
check("sale unitPrice 'Rs. 1,200' is 1200", sales.errors.length === 0 && sales.rows[0].unitPrice === 1200, JSON.stringify(sales));
const badSale = importSalesRows([{ product: "Cement", qty: "2", unitPrice: "12-15", date: "2026-10-05" }], products);
check("sale unitPrice '12-15' is a row error", badSale.errors.length === 1, JSON.stringify(badSale));

// POS "price column is the line total" mode divides by qty; it used to read "Rs. 1,200" as 0.12
const pos = finalizeSalesRows([{ product: "Cement", qty: "2", unitPrice: "Rs. 1,200", date: "2026-10-05 14:32:00" }], { qtyMapped: true, priceIsTotal: true });
check("POS total 'Rs. 1,200' / qty 2 = 600", pos[0].unitPrice === "600", JSON.stringify(pos));
check("POS date time part stripped", pos[0].date === "2026-10-05", JSON.stringify(pos));
const pos2 = finalizeSalesRows([{ product: "Cement", qty: "3", unitPrice: "1,500.00", date: "2026-10-05" }], { qtyMapped: true, priceIsTotal: true });
check("POS total '1,500.00' / qty 3 = 500", pos2[0].unitPrice === "500", JSON.stringify(pos2));

// Bank statement amounts go through the same parser (importBankStatementLines reads a File, which needs a browser,
// so the sign rules are proven on parseAmount above): a withdrawal written (500.00) / 500- stays negative.
check("bank withdrawal '(500.00)' is negative", parseAmount("(500.00)") === -500);
check("bank withdrawal '500-' is negative", parseAmount("500-") === -500);

console.log(`csv-import-numbers: ${pass} checks passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
