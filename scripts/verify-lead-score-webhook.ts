// Lead score (lib/leadScore.ts) and the outbound lead webhook (lib/leadIntake.ts webhookUrlProblem, lib/leadIntakeServer.ts
// pushLeadWebhook, and the two intake routes). Run: npx tsx scripts/verify-lead-score-webhook.ts
import fs from "node:fs";
import { leadScore } from "../lib/leadScore";
import { validateAutomations, webhookUrlProblem } from "../lib/leadIntake";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-11-03";
const NOW = Date.parse("2026-11-03T09:00:00Z");
const base = { id: "L", name: "Amal", stage: "new" as const, createdAt: NOW - 86400000 };

// score
ok(leadScore({ ...base, stage: "won" }, TODAY, NOW).score === 0, "a won lead scores nothing");
ok(leadScore({ ...base, doNotContact: true, contact: "077 123 4567" }, TODAY, NOW).score === 0, "a do-not-contact lead scores nothing");
const both = leadScore({ ...base, contact: "077 123 4567 · a@b.com" }, TODAY, NOW, "94");
ok(both.reasons.some((r) => r.includes("phone and email")), "a lead with a phone and an email gets the top contact points");
const phoneOnly = leadScore({ ...base, contact: "077 123 4567" }, TODAY, NOW, "94");
ok(both.score > phoneOnly.score, "a phone and an email score more than a phone alone");
ok(leadScore({ ...base, contact: "nothing useful" }, TODAY, NOW).reasons.every((r) => !r.includes("phone")), "no contact details, no contact points");
ok(leadScore({ ...base, stage: "proposal_sent" }, TODAY, NOW).score > leadScore({ ...base, stage: "new" }, TODAY, NOW).score, "a proposal sent scores above a new lead");
ok(leadScore({ ...base, estValue: 5000 }, TODAY, NOW).reasons.some((r) => r.includes("value")), "an estimated value is a reason");
ok(leadScore({ ...base, contacts: [{ id: "a", at: NOW, channel: "call", outcome: "spoke" }, { id: "b", at: NOW, channel: "call", outcome: "no_answer" }] } as never, TODAY, NOW).reasons.some((r) => r.includes("spoke")), "speaking with them is a reason");
ok(leadScore({ ...base, lastContactedAt: NOW - 2 * 86400000 }, TODAY, NOW).reasons.some((r) => r.includes("last week")), "a contact in the last week is a reason");
ok(leadScore({ ...base, nextFollowUpDate: "2026-10-30" }, TODAY, NOW).reasons.some((r) => r.includes("overdue")), "an overdue follow-up takes points off");
ok(leadScore({ ...base, consentToContact: true }, TODAY, NOW).reasons.some((r) => r.includes("agreed")), "agreeing to be contacted is a reason");
ok(leadScore({ ...base, expectedCloseDate: "2026-11-20" }, TODAY, NOW).reasons.some((r) => r.includes("30 days")), "an expected close within 30 days is a reason");
const max = leadScore({ ...base, stage: "proposal_sent", contact: "077 123 4567 · a@b.com", estValue: 1, consentToContact: true, expectedCloseDate: "2026-11-10", lastContactedAt: NOW, contacts: [{ id: "a", at: NOW, channel: "call", outcome: "meeting_set" }, { id: "b", at: NOW, channel: "call", outcome: "spoke" }] } as never, TODAY, NOW, "94");
// Every positive factor together is 95 (15 + 25 + 10 + 5 + 10 + 10 + 10 + 10), so the score never reaches the 100 cap with today's factors.
ok(max.score === 95 && max.score <= 100, "a lead with every positive factor scores the full 95 and never above 100");
ok(Array.isArray(max.reasons) && max.reasons.every((r) => /^[+-]?\d+ /.test(r) || r === "Closed"), "every reason states its points");

// webhook address
ok(webhookUrlProblem("") === null, "no webhook is fine (it is off)");
ok(webhookUrlProblem("https://hooks.zapier.com/hooks/catch/123/abc") === null, "a public https address is accepted");
ok(webhookUrlProblem("https://172.32.0.1/x") === null, "172.32 is a public address, not private");
ok(webhookUrlProblem("http://hooks.example.com/x") !== null, "http is refused");
ok(webhookUrlProblem("not a url") !== null, "something that is not an address is refused");
ok(webhookUrlProblem("https://localhost/x") !== null, "localhost is refused");
ok(webhookUrlProblem("https://127.0.0.1/x") !== null && webhookUrlProblem("https://10.0.0.5/x") !== null, "loopback and 10.x are refused");
ok(webhookUrlProblem("https://192.168.1.20/x") !== null && webhookUrlProblem("https://169.254.169.254/latest") !== null, "192.168.x and the cloud metadata address are refused");
ok(webhookUrlProblem("https://172.20.0.1/x") !== null, "172.16 to 172.31 is refused");
ok(webhookUrlProblem("https://[::1]/x") !== null, "an IPv6 literal is refused");
ok(webhookUrlProblem("https://printer.local/x") !== null && webhookUrlProblem("https://db.internal/x") !== null, "local and internal names are refused");
ok(webhookUrlProblem("https://example.com/" + "a".repeat(500)) !== null, "an overlong address is refused");
ok(validateAutomations({ outboundWebhookUrl: "http://x.com" }) !== null, "a bad webhook address is refused when settings are saved");
ok(validateAutomations({ outboundWebhookUrl: "https://hooks.zapier.com/hooks/catch/1/2" }) === null, "a good webhook address passes");

// wiring
const lib = read("lib/leadIntakeServer.ts");
ok(/redirect: "error"/.test(lib) && /AbortSignal\.timeout\(5000\)/.test(lib) && /webhookUrlProblem\(url\)/.test(lib), "the webhook post refuses redirects, has a five-second limit, and rechecks the address");
ok(read("app/api/v1/businesses/[businessId]/leads/route.ts").includes("pushLeadWebhook(a.outboundWebhookUrl"), "the lead API posts each new lead to the webhook");
ok(read("app/api/enquiry/route.ts").includes("pushLeadWebhook(a.outboundWebhookUrl"), "the website enquiry posts each new lead to the webhook");
ok(read("app/leads/page.tsx").includes("leadScore(lead,") && read("app/leads/page.tsx").includes("title={sc.reasons.join"), "each open lead shows its score, with the reasons on hover");
ok(read("components/AutomationsCard.tsx").includes("outboundWebhookUrl"), "the webhook address is set on the Integrations page");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
