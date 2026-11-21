// Contract register (lib/contracts.ts) and the navigation reorganisation (lib/navOrder.ts, the shell): contract validation, renewal windows with notice,
// the summary, the niche screens hidden for the types that do not use them, Opportunities beside Leads, and the clearer labels. Run:
// npx tsx scripts/verify-contracts-nav.ts
import fs from "node:fs";
import { validateContract, contractStatus, contractSummary, type Contract } from "../lib/contracts";
import { visibleForKind, NAV_NOT_FOR_KIND, NAV_ORDER } from "../lib/navOrder";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const today = "2026-11-12";
const base: Contract = { id: "c", title: "Shop lease", counterparty: "Landlord Ltd", kind: "premises", startDate: "2024-01-01" };

ok(validateContract({ title: "Shop lease", counterparty: "Landlord Ltd", kind: "premises", startDate: "2024-01-01" }) === null, "a named contract with a real start is accepted");
ok(validateContract({ title: "Lease", counterparty: "L", kind: "premises", startDate: "2024-01-01" }) !== null, "a contract with a name too short, or no other party, is refused");
ok(validateContract({ title: "Shop lease", counterparty: "Landlord Ltd", kind: "premises", startDate: "2024-01-01", endDate: "2023-12-31" }) !== null, "an end before the start is refused");
ok(validateContract({ title: "Shop lease", counterparty: "Landlord Ltd", kind: "lease", startDate: "2024-01-01" }) !== null, "a kind the register does not know is refused");

ok(contractStatus(base, today) === "open_ended", "a contract with no end is open-ended, and no renewal is due");
ok(contractStatus({ ...base, endDate: "2027-06-01" }, today) === "active", "a contract ending far off is active");
ok(contractStatus({ ...base, endDate: "2027-01-01" }, today) === "renew_soon", "a contract ending in under 60 days is due for renewal");
ok(contractStatus({ ...base, endDate: "2027-01-01", noticeDays: 90 }, today) === "renew_soon", "with 90 days' notice needed, the decision is due when the notice window opens, even if the end is further off");
ok(contractStatus({ ...base, endDate: "2026-06-01" }, today) === "ended", "a contract past its end is ended");

const s = contractSummary([base, { ...base, id: "d", endDate: "2027-01-01", value: 1000 }, { ...base, id: "e", endDate: "2026-06-01", value: 500 }, { ...base, id: "f", endDate: "2027-06-01", value: 250 }], today);
ok(s.renewSoon === 1 && s.ended === 1 && s.yearlyValue === 1750, "the summary counts those due for renewal and those ended, and adds the yearly value");
ok(s.rows[0].status === "renew_soon", "a contract due for renewal is listed first");

const keys = (items: { href: string }[]) => items.map((i) => i.href);
const all = Object.values(NAV_ORDER).flat().map((href) => ({ href }));
ok(!keys(visibleForKind(all, "services", false)).includes("/kitchen") && !keys(visibleForKind(all, "consultancy", false)).includes("/tabs"), "a services or consultancy business does not see the kitchen or tabs");
ok(keys(visibleForKind(all, "food", false)).includes("/kitchen") && keys(visibleForKind(all, "venue", false)).includes("/tabs"), "a food or venue business keeps the kitchen and tabs");
ok(keys(visibleForKind(all, "services", true)).includes("/kitchen"), "'show every screen' brings the niche screens back for any type");
ok(keys(visibleForKind(all, undefined, false)).length === all.length, "with no type chosen, every screen shows");
ok(keys(visibleForKind(all, "retail", false)).includes("/cash-flow") && keys(visibleForKind(all, "services", false)).includes("/invoices"), "shared screens such as cash flow and invoices show for every type");
ok(NAV_ORDER.Overview.includes("/opportunities") && !NAV_ORDER["Buy & sell"].includes("/opportunities") && !NAV_ORDER.Admin.includes("/opportunities"), "Opportunity scoring is a planning screen in Overview, not a sales pipeline");

const shell = read("components/AppShell.tsx");
ok(shell.includes("label: \"Jobs (short work orders)\"") && shell.includes("label: \"Projects (longer client work)\"") && shell.includes("label: \"Loans & credit (borrowed)\"") && shell.includes("label: \"Credit given (lent out)\""), "Jobs, Projects and the two loan screens have names that say what they are");
ok(shell.includes("visibleForKind(") && shell.includes("settings.businessKind"), "the sidebar and the finder hide the niche screens for the type");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
