// Deleting a product (lib/productDelete.ts and the data layer): a product with no history can be deleted; one with sales or purchases is refused with a message
// that says to archive it; the count in the message is right; the data layer and the confirmation text follow the rule. Run: npx tsx scripts/verify-product-delete.ts
import fs from "node:fs";
import { productDeleteBlock } from "../lib/productDelete";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

ok(productDeleteBlock("P1", [{ productId: "P2" }], [{ productId: "P3" }]) === null, "a product with no sales or purchases can be deleted");
const msg = productDeleteBlock("P1", [{ productId: "P1" }, { productId: "P1" }, { productId: "P2" }], [{ productId: "P1" }]);
ok(msg !== null && msg.includes("2 sales") && msg.includes("1 purchase"), "a product with 2 sales and 1 purchase is refused, and the message counts them");
ok(msg !== null && msg.includes("Archive it instead"), "the refusal tells the owner to archive the product, keeping its history");
ok(productDeleteBlock("P9", [{ productId: "P1" }], [{ productId: "P1" }]) === null, "history of other products does not block this one");
ok(productDeleteBlock("P1", [{ productId: "P1" }], []) !== null, "a single sale alone is enough to refuse the delete");

const ctx = read("contexts/DataContext.tsx");
ok(ctx.includes("productDeleteBlock(docId, salesRaw, purchasesRaw)") && ctx.includes("if (block) throw new Error(block)"), "the data layer refuses the delete before writing anything");
const page = read("app/products/page.tsx");
ok(!page.includes("you won't be able to log new ones") && page.includes("archive"), "the confirmation no longer promises a delete that will be refused");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
