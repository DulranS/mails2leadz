// Home page wording (app/page.tsx): the description and the feature card describe the operations side that is built, and the claims the app still
// cannot back (no bank feed, no tax filing, no payroll service) are still stated plainly. Run: npx tsx scripts/verify-home-wording.ts
import fs from "node:fs";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

ok(page.includes("Accounting and day-to-day operations for shops and small businesses"), "the description says the app covers operations as well as accounting");
ok(page.includes("Run the operations, not just the books"), "a feature card describes the operations side");
ok(/deadlines that come back/.test(page) && /driver and area/.test(page) && /depend on one supplier/.test(page) && /before anyone starts/.test(page), "the card's claims are the ones built: deadlines, deliveries by driver and area, supplier dependence, and hiring checks");
ok(page.includes("There's no automatic bank feed") && page.includes("It doesn't file returns or talk to the tax office"), "the statements the app cannot back are still stated plainly");
ok(!/bank feed (is )?(connected|available|included)|we file|automatic tax filing|payroll (is )?(run|processed) for you/i.test(page), "no claim of a bank feed, tax filing or payroll service appears");
ok(!/simple accounting for shops/.test(page), "the old description is gone");
ok(page.includes("Deliveries, invoices and the year") && /in parts/.test(page) && /per order/.test(page) && /contractor or talent/.test(page) && /trial balance/.test(page) && /close the year/.test(page), "the home page describes part deliveries, per-delivery invoicing, contractor shares, the trial balance and the year-end close");
ok(page.includes("Keep the customers who pay") && page.includes("Campaigns and sales outreach") && page.includes("AutoLeads"), "the home page covers customer profit, routine messages and where marketing lives");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
