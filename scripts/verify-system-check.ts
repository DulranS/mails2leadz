// System check (lib/loadStats.ts, the data layer, the screen): deliveries add up per listener, the summary totals and orders the largest first, the
// first-data time is kept, a fresh count starts at zero, the data layer uses the tracked listener everywhere, and the screen is owner only. Worked numbers.
// Run: npx tsx scripts/verify-system-check.ts
import fs from "node:fs";
import { recordDelivery, summary, resetStats, markSessionStart } from "../lib/loadStats";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

resetStats();
markSessionStart(1000);
recordDelivery("users/a/sales", 500, 1200);     // first load: 500 sales arrive 200 ms after the start
recordDelivery("users/a/sales", 2, 1900);       // then two changes
recordDelivery("users/a/expenses", 300, 1500);  // 300 expenses at 500 ms
recordDelivery("users/a/meta/settings", 1, 1100);
const s = summary();
ok(s.listeners === 3 && s.totalDocs === 803 && s.totalDeliveries === 4, "three listeners, 803 documents in four deliveries: the sales listener counts its first load and its two changes");
ok(s.top[0].name === "users/a/sales" && s.top[0].docs === 502 && s.top[1].name === "users/a/expenses", "the largest source is listed first");
ok(s.top[0].firstMs === 200 && s.top[0].lastMs === 900 && s.slowestFirstMs === 500, "the first delivery time is kept per source, and the slowest first data is reported");
resetStats();
ok(summary().listeners === 0 && summary().totalDocs === 0, "a fresh count starts at zero");
ok(summary([], 3).top.length === 0, "with nothing delivered, the summary is empty rather than an error");

const ctx = read("contexts/DataContext.tsx");
ok(!/[^d]onSnapshot\(/.test(ctx) && ctx.includes("trackedSnapshot("), "every live listener in the data layer goes through the tracked wrapper");
ok(read("lib/loadStats.ts").includes("recordDelivery(name, docs)"), "each delivery is counted by the wrapper");
ok(tabsForRole("owner").includes("systemcheck") && !tabsForRole("manager").includes("systemcheck") && !tabsForRole("staff").includes("systemcheck"), "the System check is for the owner alone");
ok(read("components/ops/SystemCheckPanel.tsx").includes("resetStats()") && !/addDoc|updateDoc|setDoc|deleteDoc/.test(read("components/ops/SystemCheckPanel.tsx")), "the screen only reads the figures, and clears only its own count");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
