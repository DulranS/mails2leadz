// Outreach message templates (lib/messageTemplates.ts): exact wording for a worked case, no leftover placeholders,
// permission-based first contact, and the places that offer them.
// Run: npx tsx scripts/verify-message-templates.ts
import fs from "node:fs";
import { buildMessage, firstName, MESSAGE_TEMPLATES, suggestedLeadTemplate, templatesFor } from "../lib/messageTemplates";
import { LEAD_STAGES } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

// ---- names ----------------------------------------------------------------------------------------------------------------
ok(firstName("Kamal Perera") === "Kamal" && firstName("  Nimali ") === "Nimali" && firstName("") === "there" && firstName("   ") === "there", "the greeting uses the first name, or 'there' when there is none");

// ---- exact wording --------------------------------------------------------------------------------------------------------
const full = buildMessage("intro", { name: "Kamal Perera", business: "Acme Tiles", topic: "a bulk order of tiles" });
ok(full.body === "Hi Kamal, this is Acme Tiles. I'm getting in touch about a bulk order of tiles. Would you be open to a short chat this week? If now is not the right time, just tell me and I won't message again.", "first hello, filled in");
ok(full.subject === "A quick hello", "email subject line");
const bare = buildMessage("intro", { name: "" });
ok(bare.body === "Hi there, this is our team. I'm getting in touch about what we can do for you. Would you be open to a short chat this week? If now is not the right time, just tell me and I won't message again.", "no name, business or topic: plain wording instead of blanks");
ok(buildMessage("intro", { name: "A", business: "  Acme   Tiles ", topic: " tiles\n for  a shop " }).body.includes("this is Acme Tiles.") && buildMessage("intro", { name: "A", topic: " tiles\n for  a shop " }).body.includes("about tiles for a shop."), "stray spaces and line breaks in the business and topic are tidied");
ok(buildMessage("support_check", { name: "Amali Silva", business: "Acme", subject: "Charger stopped working" }).body === 'Hi Amali, we\'ve marked your issue about "Charger stopped working" as resolved. Is everything fine on your side? If not, tell us and we\'ll put it right. Acme', "support check-in quotes the case subject");
ok(buildMessage("support_update", { name: "Amali" }).body.includes('"your request"'), "no subject: 'your request'");
ok(buildMessage("thanks", { name: "Sunil", business: "Acme" }).body === "Hi Sunil, thank you for your order with Acme. Is everything as you expected? If anything isn't right, reply here and we'll sort it out.", "thank-you message");

// ---- every template, with nothing filled in --------------------------------------------------------------------------------
for (const t of MESSAGE_TEMPLATES) {
  const m = buildMessage(t.id, { name: "" });
  ok(!/[{}]/.test(m.body) && !/undefined|NaN|null/.test(m.body) && m.body.trim().length > 40, `${t.id}: no leftover braces or blanks`);
  ok(m.body.startsWith("Hi there,") || m.body.startsWith("Hi there, "), `${t.id}: starts with a greeting`);
  ok(t.email.length > 0 && t.hint.length > 0 && t.label.length > 0, `${t.id}: has a subject, a hint and a label`);
}
ok(new Set(MESSAGE_TEMPLATES.map((t) => t.id)).size === MESSAGE_TEMPLATES.length, "template ids are unique");
ok(templatesFor("lead").length === 5 && templatesFor("customer").length === 5 && templatesFor("support").length === 2, "5 for leads, 5 for customers, 2 for support");

// ---- permission-based, never pressure ---------------------------------------------------------------------------------------
for (const id of ["intro", "follow_up", "winback_lead", "winback_customer", "feedback_ask"]) {
  ok(buildMessage(id, { name: "A" }).body.includes("just tell me and I won't message again"), `${id}: gives an easy way to say no`);
}
const pressure = /\b(hurry|last chance|limited time|limited stock|only today|act now|expires|don't miss|before it's too late|selling fast)\b/i;
ok(MESSAGE_TEMPLATES.every((t) => !pressure.test(buildMessage(t.id, { name: "A", business: "B", topic: "C", subject: "D" }).body)), "no false urgency or scarcity in any template");

// ---- which template fits which stage ----------------------------------------------------------------------------------------
const want: Record<string, string> = { new: "intro", contacted: "follow_up", qualified: "quote_chase", follow_up: "follow_up", proposal_sent: "quote_chase", won: "thanks", lost: "winback_lead" };
for (const s of LEAD_STAGES) ok(suggestedLeadTemplate(s.value) === want[s.value], `stage ${s.value} suggests ${want[s.value]}`);
ok(LEAD_STAGES.length === 7, "all seven lead stages are covered by the mapping above");
ok(buildMessage("nope", { name: "A" }).body === buildMessage(MESSAGE_TEMPLATES[0].id, { name: "A" }).body, "an unknown template id falls back to the first template, never blank");
ok(["thanks"].every((id) => MESSAGE_TEMPLATES.find((t) => t.id === id)?.audience === "customer") && MESSAGE_TEMPLATES.find((t) => t.id === "winback_lead")?.audience === "lead", "audiences are as labelled");

// ---- where they are offered -------------------------------------------------------------------------------------------------
const leadsPage = fs.readFileSync("app/leads/page.tsx", "utf8");
const custPage = fs.readFileSync("app/customers/page.tsx", "utf8");
const supPage = fs.readFileSync("app/support/page.tsx", "utf8");
ok(/<MessageButton\s+audience="lead"[\s\S]*?suggested=\{suggestedLeadTemplate\(lead\.stage\)\}/.test(leadsPage), "lead cards offer the template that fits their stage");
ok((custPage.match(/<MessageButton audience="customer"/g) ?? []).length === 2, "customers: on the mobile card and the table row");
ok(/<MessageButton audience="support"[^>]*subject=\{c\.subject\}/.test(supPage), "support cases offer a message that quotes the subject");
const btn = fs.readFileSync("components/MessageButton.tsx", "utf8");
const fetches = btn.match(/fetch\([^,]*/g) ?? [];
ok(btn.includes("buildShareTargets") && !/XMLHttpRequest|sendBeacon/.test(btn) && fetches.length === 1 && fetches[0] === 'fetch("/api/ai/draft"', "it only opens WhatsApp or the mail app; its one network call is the owner-pressed AI draft to this app's own server, and the result only fills the text box");

console.log(fails === 0 ? `OK: ${checks} checks passed` : `${fails} of ${checks} checks FAILED`);
process.exit(fails === 0 ? 0 : 1);
