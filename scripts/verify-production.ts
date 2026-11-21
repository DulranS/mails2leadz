// Production arithmetic (lib/production.ts): scrap, cost per good unit, buildable quantity, shortfalls and what to make now,
// with hand-worked cases; plus the wiring that makes a run use and cost the scrap. Run: npx tsx scripts/verify-production.ts
import fs from "node:fs";
import {
  buildableQty, componentQty, normalizeScrap, productionShortfalls, productionSuggestions, unitCostOfRun, type ProductionCandidate,
} from "../lib/production";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}
const onHandFrom = (m: Record<string, number>) => (id: string) => m[id] ?? 0;

// 1. Scrap input: whole units, zero or more; anything else is none
ok(normalizeScrap("3") === 3, "a typed 3 is three");
ok(normalizeScrap("2.7") === 2, "a fraction of a unit is dropped (2.7 is 2)");
ok(normalizeScrap(-1) === 0 && normalizeScrap("abc") === 0 && normalizeScrap(undefined) === 0, "negative, blank and unreadable are none");

// 2. Components used: good units plus scrap, each at its per-unit amount
ok(componentQty(2, 10, 0) === 20, "10 good at 2 each uses 20");
ok(componentQty(2, 10, 1) === 22, "with 1 scrapped it uses 22 (scrap draws components too)");

// 3. Cost per good unit: scrap's components and labour spread over the good units only
ok(unitCostOfRun(22 * 10, 5, 10) === 27, "22 units at 10 = 220, plus 5 labour a good unit: 270 over 10 good = 27 each");
ok(unitCostOfRun(20 * 10, 0, 10) === 20, "no scrap, no labour: 200 over 10 = 20 each");
ok(unitCostOfRun(100, 0, 0) === 0, "no good units means no unit cost, not a division by zero");

// 4. Buildable quantity: the component that runs out first limits it
{
  const bom = [{ componentProductId: "A", qtyPerUnit: 2 }, { componentProductId: "B", qtyPerUnit: 3 }];
  const r = buildableQty(bom, onHandFrom({ A: 9, B: 10 }));
  ok(r.qty === 3 && r.limitingProductId === "B", `A allows 4, B allows 3: 3 made, B limits (got ${r.qty}, ${r.limitingProductId})`);
  const tie = buildableQty(bom, onHandFrom({ A: 6, B: 9 }));
  ok(tie.qty === 3 && tie.limitingProductId === "A", "on a tie the first component is named");
  ok(buildableQty([], onHandFrom({})).qty === 0, "no bill of materials makes nothing");
  ok(buildableQty(bom, onHandFrom({ A: -5, B: 10 })).qty === 0, "negative stock counts as none");
}

// 5. Shortfalls for a run
{
  const bom = [{ componentProductId: "A", qtyPerUnit: 2 }, { componentProductId: "B", qtyPerUnit: 3 }];
  const withScrap = productionShortfalls(bom, 10, 1, onHandFrom({ A: 20, B: 25 }));
  ok(withScrap.length === 2 && withScrap[0].productId === "A" && withScrap[0].short === 2 && withScrap[1].short === 8, "with 1 scrap: A short 2 (22 needed, 20 held) and B short 8 (33 needed, 25 held)");
  const noScrap = productionShortfalls(bom, 10, 0, onHandFrom({ A: 20, B: 25 }));
  ok(noScrap.length === 1 && noScrap[0].productId === "B" && noScrap[0].short === 5, "without scrap only B is short, by 5");
}

// 6. What to make now: below minimum, capped by what components allow, most urgent first, blocked items separated
{
  const products: ProductionCandidate[] = [
    { id: "P1", name: "Pancake mix", active: true, components: [{ componentProductId: "A", qtyPerUnit: 2 }], minStockLevel: 10 },
    { id: "P2", name: "Sauce", active: true, components: [{ componentProductId: "B", qtyPerUnit: 3 }], minStockLevel: 6 },
    { id: "P3", name: "Jar", active: true, components: [{ componentProductId: "A", qtyPerUnit: 1 }], minStockLevel: 5 },
    { id: "P4", name: "Old", active: false, components: [{ componentProductId: "A", qtyPerUnit: 1 }], minStockLevel: 5 },
    { id: "P5", name: "Raw flour", active: true, minStockLevel: 5 },
    { id: "P6", name: "Bread", active: true, components: [{ componentProductId: "A", qtyPerUnit: 1 }], minStockLevel: 20 },
    { id: "P7", name: "No minimum", active: true, components: [{ componentProductId: "A", qtyPerUnit: 1 }] },
    { id: "P8", name: "Cap", active: true, components: [{ componentProductId: "A", qtyPerUnit: 4 }], minStockLevel: 30 },
  ];
  const { ready, blocked } = productionSuggestions(products, onHandFrom({ P1: 4, P3: 5, P6: 10, P8: 0, A: 20, B: 0, P2: 0 }));
  const readyIds = ready.map((r) => r.productId).join(",");
  ok(readyIds === "P8,P1,P6", `ready: capped Cap first (0 of 30), then Pancake (4 of 10), then Bread (10 of 20) (got ${readyIds})`);
  const cap = ready.find((r) => r.productId === "P8")!;
  ok(cap.suggestQty === 5, `Cap is capped by what 20 of A allow (5), not its gap of 30 (got ${cap.suggestQty})`);
  const pancake = ready.find((r) => r.productId === "P1")!;
  ok(pancake.suggestQty === 6, `Pancake's gap of 6 is within what it allows (got ${pancake.suggestQty})`);
  ok(blocked.length === 1 && blocked[0].productId === "P2" && blocked[0].blocked === true && blocked[0].suggestQty === 6, "Sauce cannot be made (B is 0) and is listed as blocked with its gap");
  const all = [...ready, ...blocked].map((r) => r.productId);
  ok(!all.includes("P3") && !all.includes("P4") && !all.includes("P5") && !all.includes("P7"), "items at minimum, inactive, without a bill of materials or without a minimum are not suggested");
}

// 7. Wiring: the run writes scrap into what it consumes and what it costs, and the form and the card use the same rules
const dc = fs.readFileSync("contexts/DataContext.tsx", "utf8");
ok(/recordProduction: \(\s*finishedProductId: string,\s*opts: \{[\s\S]*?scrapQty\?: number;/.test(dc), "recordProduction accepts a scrap quantity");
ok(/const qtyConsumed = componentQty\(c\.qtyPerUnit, qty, scrap\);/.test(dc), "a run consumes components for its good units plus scrap");
ok(/const unitCost = unitCostOfRun\(componentCostTotal, opts\.laborOrOverheadPerUnit \?\? 0, qty\);/.test(dc), "the good unit cost spreads scrap and labour over the good units");
const pf = fs.readFileSync("components/ProduceForm.tsx", "utf8");
ok(/scrapQty/.test(pf) && /scrapQty: normalizeScrap\(scrapQty\)|scrapQty: scrap/.test(pf), "the produce form records scrap");
ok(/buildableQty\(/.test(pf), "the produce form shows what can be made now");
const card = fs.readFileSync("components/ProductionSuggestionsCard.tsx", "utf8");
ok(/productionSuggestions\(/.test(card) && /recordProduction\(/.test(card) && /window\.confirm\(/.test(card), "the card lists suggestions and makes them after one confirmation");
ok(/can\(role, "manage:products"\)/.test(card), "only people who can manage products see the make button");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exitCode = 1;
