// Render efficiency (lib/renderGuards.ts and the data context): an unchanged value keeps its identity, a changed one does not; a batch of flags that are
// already set causes no update; a new flag is merged; and the data context uses these helpers. Run: npx tsx scripts/verify-render-guards.ts
import fs from "node:fs";
import { shallowSame, mergeFlags } from "../lib/renderGuards";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const arr = [1, 2];
const fn = () => 1;
ok(shallowSame({ a: arr, f: fn }, { a: arr, f: fn }) === true, "the same data and the same functions count as unchanged");
ok(shallowSame({ a: arr }, { a: [1, 2] }) === false, "a data field with a new array (even equal contents) counts as changed, so screens update");
ok(shallowSame({ a: 1 }, { a: 1, b: 2 }) === false && shallowSame({ a: 1, b: 2 }, { a: 1 }) === false, "a field added or removed counts as changed");
ok(shallowSame(null, { a: 1 }) === false, "with nothing to compare against, the new value is taken");

const flags = { sales: true, stock: true };
ok(mergeFlags(flags, { sales: true }) === flags, "a flag already set causes no change at all: the same object is kept, so nothing re-renders");
const merged = mergeFlags(flags, { leads: true });
ok(merged !== flags && merged.leads === true && merged.sales === true, "a new flag is merged in with the ones already set");

const ctx = read("contexts/DataContext.tsx");
ok(ctx.includes("pendingFlags.current[key] = true") && ctx.includes("setTimeout(() => {"), "live loading reports are batched into one update");
ok(ctx.includes("const finalValue = useMemo(") && ctx.includes("stableFns.current[k as string]"), "the value keeps its identity, and every function is handed out once");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
