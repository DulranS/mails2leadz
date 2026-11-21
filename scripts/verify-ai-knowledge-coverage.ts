// Confirms the AI assistant's own "what this app does" knowledge
// (lib/aiPrompts.ts) actually mentions every page a customer could
// plausibly ask it about — specifically the ones added or changed this
// session, so the AI can point to them instead of saying "not sure" for a
// feature that exists. A missing page here isn't a crash, just a silent
// "the AI doesn't know its own app" gap — this only catches it because
// someone bothered to write down what SHOULD be there.
//
// Run: npx tsx scripts/verify-ai-knowledge-coverage.ts

import { APP_HELP_KNOWLEDGE } from "../lib/aiPrompts";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

const mustMention: { label: string; needle: string }[] = [
  { label: "Leads page exists", needle: "- Leads:" },
  { label: "Profit by location section is known", needle: "Profit by location" },
  { label: "Survival number is known", needle: "survival number" },
  { label: "Location tagging on expenses is known", needle: "optional Location field on the expense form" },
  { label: "Leads stages are named", needle: "New → Contacted → Qualified" },
  { label: "Support log page exists", needle: "- Support (" },
  { label: "Feedback (NPS) page exists", needle: "- Feedback (" },
  { label: "Find prospects is known", needle: "- Find prospects (" },
  { label: "Tailor your menu is known", needle: "- Tailor your menu (" },
  { label: "Write with AI is known", needle: "- Write with AI (" },
  { label: "Sales below cost is known", needle: "Sales below cost" },
  { label: "Weekly scorecard is known", needle: "This week so far, against last week" },
  { label: "Marketing by channel is known", needle: "Marketing by channel" },
  { label: "Payslip is known", needle: "a Payslip for any employee" },
  { label: "Leave is known", needle: "Leave (log annual" },
  { label: "Profit-based commission is known", needle: "on the profit those sales left" },
  { label: "Message templates are known", needle: "ready-written" },
  { label: "Convert-to-customer action is known", needle: "Convert to customer" },
  { label: "Bill of materials / Produce action is known", needle: "bill of materials" },
  { label: "Estimates page exists", needle: "- Estimates:" },
  { label: "Invoices page exists", needle: "- Invoices:" },
  { label: "Offers page exists", needle: "- Offers:" },
  { label: "Suppliers page exists", needle: "- Suppliers:" },
  { label: "Customer credit limit is known (and that it only warns)", needle: "credit limit for a customer" },
  { label: "Credit limit is described as a warning, not a block", needle: "warning only, never a block" },
  { label: "Reconcile page exists", needle: "- Reconcile:" },
  { label: "Share button (WhatsApp/email) is known", needle: "WhatsApp/email" },
  { label: "production_use exclusion from risk signal is known (so AI doesn't misexplain Financial Health)", needle: "used in production" },
  { label: "Investment-worth-it calculator (NPV/IRR/payback/WACC) is known", needle: "Is this investment worth it?" },
  { label: "Future-value calculator is known", needle: "What will this grow to?" },
  { label: "Startup capital calculator is known", needle: "How much capital do I need to start?" },
  { label: "Statement print / save as PDF is known", needle: "Print / save as PDF" },
  { label: "Close the books (period lock) is known", needle: "Close the books" },
  { label: "Money lent out (lending) page is known", needle: "- Money lent out:" },
  { label: "Lent interest counts as profit only when received", needle: "only once it is received" },
  { label: "AI entries are reviewed by the person, not auto-saved", needle: "never saves anything on its own" },
  { label: "Collections page (late payers, collectors, promises) is known", needle: "- Collections:" },
  { label: "Collections says a broken promise rises to the top and nothing is sent automatically", needle: "nothing is sent automatically" },
  { label: "Supplier price watch is known", needle: "Supplier price watch" },
  { label: "Price what-if section is known", needle: "What if I change my prices?" },
  { label: "Category budgets are known", needle: "Budget by category" },
  { label: "Late payment charge is known and described as advisory", needle: "Late payment charge" },
  { label: "Per-item tax rate is known", needle: "its own tax rate" },
  { label: "Wholesale price is known", needle: "wholesale price" },
  { label: "Supplier statement is known", needle: "Statement button" },
  { label: "What-to-order-now card is known", needle: "What to order now" },
  { label: "Price watch suggests a margin-holding price", needle: "bring the old margin back" },
  { label: "Foreign-currency exposure card is known and described as a what-if with a reference rate", needle: "Reference rate today" },
  { label: "Auto-filled foreign rates are known", needle: "filled from the same free daily rate" },
  { label: "Bookings are known", needle: "- Bookings (Bookings page)" },
  { label: "Delegation is known", needle: "- Delegation (Delegation page" },
  { label: "Shipments are known", needle: "- Shipments (Shipments page" },
  { label: "Rentals are known", needle: "- Rentals (Rentals page" },
  { label: "Gift cards are known", needle: "- Gift cards (Gift cards page" },
  { label: "Owner review is known", needle: "- Owner review (Dashboard" },
  { label: "Loyalty points are known", needle: "- Loyalty points (Customers page" },
  { label: "Freelancer time is known", needle: "- Freelancer time: on the Time page" },
];

for (const { label, needle } of mustMention) {
  assert(APP_HELP_KNOWLEDGE.includes(needle), `${label} (looked for: ${JSON.stringify(needle)})`);
}

// Every page bullet should still be a real, closed line — a stray
// unescaped backtick or template-literal ${} would either break the
// export at import time (caught just by this file running at all) or
// silently inject `undefined` into the prompt. Belt-and-suspenders check
// for the latter specifically.
assert(!APP_HELP_KNOWLEDGE.includes("undefined"), "no stray `undefined` leaked into the prompt string");

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
