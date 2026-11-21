// Automation (v187c): the expense category suggestion and the review-reply draft rules. Both are pure and run without a model
// (the draft is only the request and the cleaning here). Run: npx tsx scripts/verify-automation.ts
import fs from "node:fs";
import { suggestExpenseCategory } from "../lib/expenseCategory";
import { EXPENSE_CATEGORIES } from "../lib/types";
import { validateDraftRequest, buildDraftUserContent, finalizeDraft, buildDraftSystemPrompt, MAX_REVIEW_REPLY_CHARS } from "../lib/aiDraft";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(suggestExpenseCategory("CEB electricity bill") === "Rent & utilities", "an electricity bill is suggested as rent and utilities");
ok(suggestExpenseCategory("Fuel for van") === "Transport & logistics", "fuel is suggested as transport");
ok(suggestExpenseCategory("Sales staff salary") === "Sales payroll" && suggestExpenseCategory("Staff salary") === "Payroll & labor", "sales staff pay and general pay are told apart");
ok(suggestExpenseCategory("Facebook ad boost") === "Marketing" && suggestExpenseCategory("Google Workspace monthly") === "Software & tools", "ads and software subscriptions are suggested");
ok(suggestExpenseCategory("Zoo trip") === undefined && suggestExpenseCategory("") === undefined, "no suggestion when nothing matches");
ok(suggestExpenseCategory("Rentokil pest control") === undefined, "a word inside another word does not trigger a suggestion (rent in Rentokil)");
ok(suggestExpenseCategory("Office rent") === "Rent & utilities", "a rent payment is recognised inside a longer name");
const rules = ["Sales payroll", "Payroll & labor", "Rent & utilities", "Transport & logistics", "Marketing", "Software & tools", "Professional fees", "Insurance", "Bank & payment fees", "Other overhead"];
ok(rules.every((r) => (EXPENSE_CATEGORIES as readonly string[]).includes(r)), "every suggestion is a real expense category");

const req = validateDraftRequest({ kind: "review_reply", name: "Amal", stars: 2, comment: "Late delivery,   cold food." });
ok(req.ok && req.req.kind === "review_reply" && req.req.stars === 2 && req.req.notes === "Late delivery, cold food.", "a review reply request keeps the stars and tidies the comment");
ok(!validateDraftRequest({ kind: "review_reply" }).ok, "there must be a review to reply to");
ok(validateDraftRequest({ kind: "review_reply", comment: "Great" }).ok && (validateDraftRequest({ kind: "review_reply", comment: "Great" }) as { req: { name?: string } }).req.name === "the customer", "a missing name becomes 'the customer'");
ok(buildDraftUserContent(req.ok ? req.req : ({} as never)).includes("2 of 5 stars"), "the stars reach the model");
ok(buildDraftSystemPrompt("review_reply", { offer: "food" }).includes("Never promise a refund"), "the reply rules forbid promises the review does not contain");
const reply = finalizeDraft("Thanks for telling us. We are sorry the food was cold.", "review_reply") ?? "";
ok(reply.length > 0 && !reply.includes("opt out") && !/reply STOP/i.test(reply), "a review reply carries no marketing opt-out line");
ok(finalizeDraft("x".repeat(3000), "review_reply")!.length <= MAX_REVIEW_REPLY_CHARS, "a review reply is capped in length");
ok(finalizeDraft("Act now, last chance!", "review_reply") === null, "pressure language is still refused for review replies");

ok(read("components/QuickForms.tsx").includes("suggestExpenseCategory(name)") && read("components/QuickForms.tsx").includes("if (!category && name.trim())"), "the expense form fills an empty category only");
ok(read("app/feedback/page.tsx").includes("<ReviewReplyDraft"), "online reviews show the draft button");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
