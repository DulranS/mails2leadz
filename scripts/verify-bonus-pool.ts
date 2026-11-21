// Results bonus pool (lib/bonusPool.ts): the pool from profit, and how it is split by weight without losing a cent.
import { allocateBonus, bonusPool } from "../lib/bonusPool";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

ok(bonusPool(10000, { sharePct: 10, minProfit: 2000 }) === 800, "the pool is the share of profit above the minimum");
ok(bonusPool(1500, { sharePct: 10, minProfit: 2000 }) === 0, "profit below the minimum makes no pool");
ok(bonusPool(10000, { sharePct: 0, minProfit: 0 }) === 0 && bonusPool(10000, { sharePct: 150, minProfit: 0 }) === 0, "a share of zero, or above 100, makes no pool");
ok(bonusPool(Number.NaN, { sharePct: 10, minProfit: 0 }) === 0, "a profit that is not a number makes no pool");

const people = [
  { uid: "a", name: "Ann", weight: 3 },
  { uid: "b", name: "Ben", weight: 1 },
  { uid: "c", name: "Cy", weight: 0 },
];
const split = allocateBonus(100, people);
ok(split.length === 2 && split[0].amount === 75 && split[1].amount === 25, "the pool is split by weight, and a zero weight gets nothing");

const three = allocateBonus(10, [
  { uid: "a", name: "A", weight: 1 },
  { uid: "b", name: "B", weight: 1 },
  { uid: "c", name: "C", weight: 1 },
]);
ok(Math.round(three.reduce((s, r) => s + r.amount, 0) * 100) === 1000, "the shares add up exactly to the pool");
ok(three.find((r) => r.name === "A")!.amount === 3.34 && three.find((r) => r.name === "B")!.amount === 3.33, "leftover cents go to the first name in order");

ok(allocateBonus(0, people).length === 0 && allocateBonus(100, [{ uid: "z", name: "Z", weight: 0 }]).length === 0, "no pool, or nobody with a weight, gives no shares");

console.log(`verify-bonus-pool: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
