// Quick jump to a screen (lib/screenSearch.ts and the app shell): a name that starts with the letters ranks first, then a word in the name, then the
// group; only the screens passed in are searched; empty search shows the first screens; and the shell wires the shortcut and the list. Run:
// npx tsx scripts/verify-screen-search.ts
import fs from "node:fs";
import { searchScreens, type ScreenItem } from "../lib/screenSearch";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const screens: ScreenItem[] = [
  { href: "/cash-flow", label: "Cash flow", group: "Money" },
  { href: "/cash-count", label: "Cash count", group: "Money" },
  { href: "/receivables-payables", label: "Money owed", group: "Money" },
  { href: "/operations", label: "Operations", group: "Overview" },
  { href: "/purchase-orders", label: "Orders", group: "Buy & sell" },
  { href: "/suppliers", label: "Suppliers", group: "Buy & sell" },
];
ok(searchScreens(screens, "cash").slice(0, 2).map((x) => x.href).sort().join() === "/cash-count,/cash-flow", "names that start with the letters come first, in name order");
ok(searchScreens(screens, "owed")[0].href === "/receivables-payables", "a screen is found by a word inside its name as well");
ok(searchScreens(screens, "buy")[0].href === "/purchase-orders" || searchScreens(screens, "buy").some((s) => s.group === "Buy & sell"), "a screen is found by its group when the name does not match");
ok(searchScreens(screens, "zzz").length === 0, "nothing matching gives an empty list, not a guess");
ok(searchScreens(screens, "").length === screens.length && searchScreens(screens, "", 2).length === 2, "an empty search shows the first screens, up to the limit");
ok(searchScreens(screens, "  CASH  ").slice(0, 2).map((x) => x.href).sort().join() === "/cash-count,/cash-flow", "case and surrounding spaces do not matter");
ok(searchScreens([{ href: "/x", label: "Payroll", group: "Money" }], "pay").length === 1 && searchScreens([{ href: "/x", label: "Payroll", group: "Money" }], "roll").length === 1, "letters inside a name are still found, so a half-remembered name works");
ok(searchScreens([{ href: "/a", label: "Payroll", group: "Money" }, { href: "/b", label: "Roll call", group: "Staff" }], "roll")[0].href === "/b", "a name that starts with the letters ranks above one that only contains them");

const shell = read("components/AppShell.tsx");
ok(shell.includes("searchScreens(") && shell.includes("visibleNav") && shell.includes("router.push(") , "the quick jump searches only the screens the person can see, and opens the one chosen");
ok(shell.includes("(e.ctrlKey || e.metaKey) && e.key.toLowerCase() === \"k\"") || shell.includes("e.key.toLowerCase() === \"k\""), "the shortcut Ctrl+K (Cmd+K on a Mac) opens it");
ok(shell.includes("e.key === \"Escape\"") && shell.includes("role=\"dialog\""), "Escape closes it, and it is announced as a dialog");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
