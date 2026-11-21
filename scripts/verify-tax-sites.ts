// Guard: sales and purchase tax must come from lib/tax.ts (the item's own rate, else the shop rate). If a file computes
// tax straight from Settings.salesTaxRatePct, that line charges the shop rate even on a tax-free item, so the figures
// would disagree between screens. Only the files listed here may read the rate directly, each for a reason.
// Run: npx tsx scripts/verify-tax-sites.ts
import fs from "node:fs";
import path from "node:path";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const ALLOWED: Record<string, string> = {
  "lib/tax.ts": "the helper itself",
  "lib/policyLog.ts": "names the setting in the audit log (old and new value); it computes no charge",
  "lib/types.ts": "the Settings field definition",
  "lib/delivery.ts": "delivery charges have no item, so they use the shop rate",
  "app/expenses/page.tsx": "an expense has no item, so reclaimable tax on it uses the shop rate",
  "app/settings/page.tsx": "where the shop rate is edited",
  "app/products/page.tsx": "shows the shop rate as the placeholder in the item's own tax rate box (display only)",
  "contexts/AiAssistantContext.tsx": "fallback shop rate handed to the credit check, which looks up each item's own rate first",
  "lib/aiAutoConfirmShared.ts": "fallback when the caller cannot look up an item's rate",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const roots = ["lib", "app", "components", "contexts"];
const hits = new Map<string, number[]>();
for (const r of roots) {
  for (const f of walk(r)) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    lines.forEach((l, i) => {
      if (l.includes("salesTaxRatePct") && !l.trim().startsWith("//")) {
        const k = f.split(path.sep).join("/");
        hits.set(k, [...(hits.get(k) ?? []), i + 1]);
      }
    });
  }
}
for (const [file, lines] of hits) {
  ok(file in ALLOWED, `${file} reads salesTaxRatePct directly (lines ${lines.join(", ")}). Use taxFor / taxRatePctFor from lib/tax.ts so an item's own rate is honoured.`);
}
for (const file of Object.keys(ALLOWED)) ok(fs.existsSync(file), `allow-list entry ${file} no longer exists: remove it`);

// The multi-item invoice must not split one total across lines any more: lines can now have different rates.
const forms = fs.readFileSync("components/QuickForms.tsx", "utf8");
ok(!forms.includes("allocateLineTax("), "QuickForms must tax each line at its own rate, not split one total with allocateLineTax");
const ctx = fs.readFileSync("contexts/DataContext.tsx", "utf8");
ok(!/taxAllocated|estimateTaxAllocated/.test(ctx), "DataContext must not split one tax total across lines");
ok((ctx.match(/taxFor\(/g) ?? []).length >= 4, "DataContext uses taxFor for recurring invoices, estimates, order receipts and offers");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
