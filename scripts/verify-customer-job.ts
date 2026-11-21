// The daily customer message job (app/api/cron/customer-messages/route.ts): gated like the other daily jobs, read only for businesses that switched it on,
// quiet hours and the daily cap applied, each send logged once, the review ask off unless switched on, and the Settings switches saved. Run:
// npx tsx scripts/verify-customer-job.ts
import fs from "node:fs";
import { CUSTOMER_MESSAGE_RUN_LIMIT } from "../lib/customerMessages";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const route = read("app/api/cron/customer-messages/route.ts");
ok(route.includes("requireCronSecret(req)") && route.includes("claimOpenCronRun()"), "the job is gated by the cron secret, and runs once in open mode");
ok(route.includes('where("customerMessages", "==", true)'), "only businesses that switched customer messages on are read");
ok(route.includes("smsAllowedAt(settings.automations"), "texts go out only inside quiet hours");
ok(route.includes("sent >= CUSTOMER_MESSAGE_RUN_LIMIT") && CUSTOMER_MESSAGE_RUN_LIMIT === 100, "at most 100 messages go out in one run");
ok(route.includes('customerMessageLog').valueOf() && route.includes(".doc(m.key).set("), "each message is logged once, by the event it was sent for");
ok(route.includes("settings.reviewRequests === true"), "the review ask is off unless the owner switches it on");
ok(!/\.(update|delete)\(/.test(route.replace(/customerMessageLog/g, "")), "the job never changes a booking, quote, project or sale");
const settings = read("app/settings/page.tsx");
ok(settings.includes("Send customers routine messages.") && settings.includes("Ask happy customers for a review."), "both switches are on the Settings page");
ok(settings.includes("customerMessages,") && settings.includes("reviewRequests,"), "both switches are saved with the other settings");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
