// The single-lead route for the AutoLeads sync (app/api/v1/businesses/[businessId]/leads/item/[leadId]/route.ts): it checks the key, accepts only a real lead
// stage, reports a missing lead as missing, and creates nothing except through its own PATCH on an existing lead. Run: npx tsx scripts/verify-lead-item-route.ts
import fs from "node:fs";
import { LEAD_STAGES } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const route = fs.readFileSync(new URL("../app/api/v1/businesses/[businessId]/leads/item/[leadId]/route.ts", import.meta.url), "utf8");

ok(route.includes("authoriseLeadApi(req, businessIdFrom(req))") && route.split("authoriseLeadApi(").length - 1 === 2, "both the read and the stage change check the lead API key first");
ok(route.includes("LEAD_STAGES.some((s) => s.value === stage)"), "a stage must be one of Balancr's lead stages");
ok(route.includes("No lead with that id.") && route.includes("404"), "a lead that does not exist is reported as missing");
ok(!/\.add\(/.test(route), "the route never creates a lead");
ok(LEAD_STAGES.map((s) => s.value).join() === "new,contacted,qualified,follow_up,proposal_sent,won,lost", "the stage list is the one AutoLeads maps to");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
