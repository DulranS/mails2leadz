// Screen order (lib/navOrder.ts, the shell, the finder): every screen in the navigation is listed exactly once in its group's order, no listed screen is
// missing from the navigation, groups come in their order, the sidebar uses this order, and the finder ranks ties by it. Run: npx tsx scripts/verify-nav-order.ts
import fs from "node:fs";
import { NAV_ORDER, GROUP_ORDER, orderNav } from "../lib/navOrder";
import { searchScreens } from "../lib/screenSearch";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const shell = read("components/AppShell.tsx");
const navBlock = shell.slice(shell.indexOf("const NAV: NavItem[] = ["), shell.indexOf("\n];", shell.indexOf("const NAV: NavItem[] = [")));
const navItems = [...navBlock.matchAll(/href: "([^"]+)", label: "([^"]+)"[^}]*group: "([^"]+)"/g)].map((m) => ({ href: m[1], label: m[2], group: m[3] }));

ok(navItems.length >= 60, "the navigation has its screens (read from the shell)");
const listed = Object.values(NAV_ORDER).flat();
ok(new Set(listed).size === listed.length, "no screen is listed twice in the order");
ok(navItems.every((n) => listed.includes(n.href)), "every navigation screen has a place in the order");
ok(listed.every((h) => navItems.some((n) => n.href === h)), "every screen in the order exists in the navigation (no misspelt names)");
ok(GROUP_ORDER.join() === "Overview,Buy & sell,Money,Team,Admin", "the groups come in the order: Overview, Buy & sell, Money, Team, Admin");

const sorted = orderNav(navItems.slice().reverse());
const groups = sorted.map((s) => s.group);
ok(groups.every((g, i) => i === 0 || GROUP_ORDER.indexOf(groups[i - 1] as never) <= GROUP_ORDER.indexOf(g as never)), "the sorted navigation keeps the groups together, in order");
const money = sorted.filter((s) => s.group === "Money").map((s) => s.href);
ok(money.indexOf("/invoices") < money.indexOf("/cheques") && money.indexOf("/invoices") === 0, "in Money, invoices come first, not after the cheques and mileage");
const team = sorted.filter((s) => s.group === "Team").map((s) => s.href);
ok(team.indexOf("/team") === team.length - 1, "in Team, team access comes last, after the rota and the delegation screens");
const unknown = orderNav([{ href: "/new-screen", label: "Zed", group: "Money" }, { href: "/invoices", label: "Invoices", group: "Money" }]);
ok(unknown[0].href === "/invoices" && unknown[1].href === "/new-screen", "a screen not in the order goes last in its group, so a new one is never lost");

const finder = searchScreens(sorted.slice(0, 80), "");
ok(finder.map((x) => x.href).join() === sorted.slice(0, 8).map((x) => x.href).join(), "with nothing typed, the finder shows the screens in the sidebar's order");
ok(read("components/AppShell.tsx").includes("orderNav(visibleForKind(applyHiddenPages("), "the sidebar and the finder are built from this order");
ok(read("lib/screenSearch.ts").includes("a.index - b.index") && !read("lib/screenSearch.ts").includes("localeCompare"), "the finder keeps the sidebar order between equal matches, not alphabetical");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
