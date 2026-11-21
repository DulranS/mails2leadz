// Tailor the menu (lib/navPrefs.ts, components/MenuTailoring.tsx, components/AppShell.tsx): hand-worked cases, plus a check
// that the page list here can never drift from the real menu.
// Run: npx tsx scripts/verify-nav-prefs.ts
import fs from "node:fs";
import { activePreset, applyHiddenPages, cleanHiddenPages, HIDABLE_PAGES, isHidable, MENU_PRESETS, NEVER_HIDDEN } from "../lib/navPrefs";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

// ---- the list matches the real menu ---------------------------------------------------------------------------------------
const shell = read("components/AppShell.tsx");
const nav = [...shell.matchAll(/\{ href: "([^"]+)", label: "([^"]+)", icon: \w+, roles: \[[^\]]*\], group: "([^"]+)" \}/g)].map((m) => ({ href: m[1], label: m[2], group: m[3] }));
ok(nav.length >= 40, `read ${nav.length} menu items from AppShell`);
ok(new Set(HIDABLE_PAGES.map((p) => p.href)).size === HIDABLE_PAGES.length && new Set(NEVER_HIDDEN).size === NEVER_HIDDEN.length, "no page is listed twice");
ok(HIDABLE_PAGES.every((p) => !NEVER_HIDDEN.includes(p.href)), "a page is either hidable or never hidden, not both");
for (const n of nav) {
  const h = HIDABLE_PAGES.find((p) => p.href === n.href);
  ok(NEVER_HIDDEN.includes(n.href) !== !!h, `${n.href}: is in exactly one of the two lists`);
  if (h) ok(h.label === n.label && h.group === n.group, `${n.href}: label and group match the menu (${h.label}/${h.group} vs ${n.label}/${n.group})`);
}
ok(HIDABLE_PAGES.every((p) => nav.some((n) => n.href === p.href)) && NEVER_HIDDEN.every((h) => nav.some((n) => n.href === h)), "every listed page really is in the menu");
const mobile = [...(shell.match(/MOBILE_PRIMARY_HREFS[^=]*=\s*\{([\s\S]*?)\};/)?.[1] ?? "").matchAll(/"(\/[a-z-]+)"/g)].map((m) => m[1]);
ok(mobile.length >= 8 && mobile.every((h) => NEVER_HIDDEN.includes(h)), "every page on any role's phone bottom bar can never be hidden");
ok(["/dashboard", "/settings", "/team", "/assistant", "/notifications"].every((h) => NEVER_HIDDEN.includes(h)), "Home, Settings, Team access, the Assistant and Notifications can never be hidden");
ok(isHidable("/leads") && !isHidable("/settings") && !isHidable("/nope") && !isHidable(""), "isHidable");

// ---- presets --------------------------------------------------------------------------------------------------------------
ok(new Set(MENU_PRESETS.map((p) => p.id)).size === MENU_PRESETS.length, "preset ids are unique");
ok(MENU_PRESETS.every((p) => p.hides.every((h) => isHidable(h)) && new Set(p.hides).size === p.hides.length), "every preset hides only real, hidable pages, once each");
ok(MENU_PRESETS.find((p) => p.id === "everything")!.hides.length === 0, "'everything' hides nothing");
const basics = MENU_PRESETS.find((p) => p.id === "basics")!;
ok(["/leads", "/customers", "/invoices", "/expenses", "/collections", "/products"].every((h) => !basics.hides.includes(h)) && basics.hides.includes("/projects") && basics.hides.includes("/loans"), "'basics' keeps the everyday pages and tucks the rest away");
ok(MENU_PRESETS.find((p) => p.id === "service")!.hides.includes("/purchase-orders") && !MENU_PRESETS.find((p) => p.id === "service")!.hides.includes("/invoices"), "a service business loses stock pages, not invoices");
ok(!MENU_PRESETS.find((p) => p.id === "product")!.hides.includes("/purchase-orders") && !MENU_PRESETS.find((p) => p.id === "product")!.hides.includes("/suppliers"), "a shop keeps its stock pages");
ok(MENU_PRESETS.every((p) => p.label.length > 0 && p.description.length > 20), "every preset says what it is");

// ---- cleaning what is saved -----------------------------------------------------------------------------------------------
ok(JSON.stringify(cleanHiddenPages(undefined)) === "[]" && cleanHiddenPages(null).length === 0 && cleanHiddenPages("/leads").length === 0 && cleanHiddenPages({ 0: "/leads" }).length === 0 && cleanHiddenPages(42).length === 0, "anything that is not a list gives an empty list");
ok(JSON.stringify(cleanHiddenPages(["/journal", "/leads", "/leads", "/dashboard", "/settings", "/nope", 5, null, "/projects"])) === JSON.stringify(["/leads", "/projects", "/journal"]), "unknown pages, never-hidden pages, non-text and repeats are dropped; the rest come back in menu order");
ok(cleanHiddenPages(HIDABLE_PAGES.map((p) => p.href)).length === HIDABLE_PAGES.length, "every hidable page can be hidden");

// ---- applying it ----------------------------------------------------------------------------------------------------------
const items = [...nav.map((n) => ({ href: n.href, label: n.label }))];
ok(applyHiddenPages(items, undefined, "/dashboard") === items && applyHiddenPages(items, [], "/dashboard") === items, "nothing hidden: the same menu comes back untouched");
const hid = applyHiddenPages(items, ["/projects", "/journal"], "/dashboard");
ok(hid.length === items.length - 2 && !hid.some((i) => i.href === "/projects" || i.href === "/journal"), "hidden pages leave the menu");
ok(items.length === nav.length && items.some((i) => i.href === "/projects"), "the original list is not changed");
ok(applyHiddenPages(items, ["/projects"], "/projects").some((i) => i.href === "/projects") && applyHiddenPages(items, ["/projects"], "/projects/abc").some((i) => i.href === "/projects"), "the page you are on stays in the menu while you are on it (and its sub-pages)");
ok(!applyHiddenPages(items, ["/products"], "/products-old").some((i) => i.href === "/products"), "a page whose address merely starts the same is not mistaken for the current page");
ok(applyHiddenPages(items, ["/dashboard", "/settings", "/team", "/nope"], "/leads").length === items.length, "asking to hide a never-hidden or unknown page changes nothing");
ok(applyHiddenPages(items, "junk", "/leads") === items && applyHiddenPages(items, [1, 2], "/leads") === items, "a corrupt saved value shows the whole menu rather than breaking it");
ok(applyHiddenPages([], ["/leads"], "/x").length === 0, "an empty menu stays empty");

// ---- which preset is saved ------------------------------------------------------------------------------------------------
ok(activePreset(undefined) === "everything" && activePreset([]) === "everything" && activePreset("junk") === "everything", "nothing saved is 'everything'");
ok(activePreset(MENU_PRESETS.find((p) => p.id === "product")!.hides) === "product", "a preset's own list is recognised");
ok(activePreset([...MENU_PRESETS.find((p) => p.id === "service")!.hides].reverse()) === "service", "order does not matter");
ok(activePreset(["/projects"]) === "custom" && activePreset([...MENU_PRESETS.find((p) => p.id === "both")!.hides, "/projects"]) === "custom", "anything else is custom");
ok(activePreset([...MENU_PRESETS.find((p) => p.id === "both")!.hides, "/dashboard"]) === "both", "junk entries that would be cleaned away do not hide a match");

// ---- wiring ---------------------------------------------------------------------------------------------------------------
ok(/hiddenPages\?: string\[\]/.test(read("lib/types.ts")), "Settings has hiddenPages");
ok(shell.indexOf("const roleNav = NAV.filter") !== -1 && shell.indexOf("const roleNav = NAV.filter") < shell.indexOf("applyHiddenPages(roleNav, settings.hiddenPages, pathname)") && shell.includes("const visibleNav = orderNav(visibleForKind(applyHiddenPages(roleNav") || shell.includes("const visibleNav = orderNav(applyHiddenPages(roleNav") || shell.includes("const visibleNav = applyHiddenPages(roleNav"), "AppShell: role decides what you may open first, then the owner's choice trims the menu");
ok(/items=\{roleNav\}/.test(shell) && !/items=\{visibleNav\}/.test(shell), "AppShell: Jump to still searches every page the role may open, hidden or not");
const mt = read("components/MenuTailoring.tsx");
ok(/updateSettings\(\{ hiddenPages: cleanHiddenPages\(hidden\) \}\)/.test(mt) && (mt.match(/updateSettings\(/g) ?? []).length === 1, "the Menu tab saves one cleaned list and nothing else");
const sp = read("app/settings/page.tsx");
ok(/key: "menu", label: "Menu"/.test(sp) && /<MenuTailoring \/>/.test(sp) && /tab !== "account" && tab !== "menu"/.test(sp), "Settings has a Menu tab (the owner-only page), and the general form does not wrap it");
ok(/match \/meta\/settings \{[^}]*allow write: if isOwner\(businessId\) && !isPublicDemo\(businessId\);/.test(read("firestore.rules")), "only the owner can change settings, so only the owner can change the menu");
ok(/Tailor your menu/.test(read("lib/aiPrompts.ts")), "the AI assistant knows the feature");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
