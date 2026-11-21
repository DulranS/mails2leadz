// Owner review (lib/reviewQueue.ts) and loyalty points (lib/loyalty.ts), with hand-worked cases, plus the wiring on the pages.
// Run: npx tsx scripts/verify-review-queue.ts
import fs from "node:fs";
import { reviewKey, reviewQueue } from "../lib/reviewQueue";
import { loyaltyStanding } from "../lib/loyalty";
import type { CustomerDepositEntry, Discount, Expense, Member, ReviewMark, SaleReturn } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

const members = [
  { id: "O", role: "owner", name: "Owner" },
  { id: "M", role: "manager", name: "Mina" },
  { id: "S", role: "staff", name: "Saman" },
  { id: "A", role: "accountant", name: "Ayesha" },
] as Pick<Member, "id" | "role" | "name">[];

const disc = (p: Partial<Discount>) => ({ id: "d", saleId: "x", productId: "p", amount: 0, reason: "goodwill", date: "2026-03-01", createdAt: 1, ...p }) as Discount;
const discounts = [
  disc({ id: "d1", amount: 15000, createdByUid: "S", createdByName: "Saman" }), // staff, over: flagged
  disc({ id: "d2", amount: 9000, createdByUid: "M" }), // manager, under: not flagged
  disc({ id: "d3", amount: 50000, createdByUid: "O" }), // owner's own: not flagged
  disc({ id: "d4", amount: 20000 }), // no maker recorded: not flagged
];
const expenses = [
  { id: "e1", name: "Generator fuel", amount: 12000, category: "Fuel", startDate: "2026-03-02", createdByUid: "S", createdByName: "Saman" },
  { id: "e2", name: "Tea", amount: 8000, category: "Food", startDate: "2026-03-02", createdByUid: "M" },
] as unknown as Expense[];
const returns = [
  { id: "r1", refundAmount: 11000, date: "2026-03-03", createdByUid: "A", createdByName: "Ayesha" },
] as unknown as SaleReturn[];
const dep = (p: Partial<CustomerDepositEntry>) => ({ id: "x", customer: "Ann", kind: "received", amount: 0, date: "2026-03-04", createdAt: 1, ...p }) as CustomerDepositEntry;
const deposits = [
  dep({ id: "f1", kind: "refunded", amount: 30000, createdByUid: "S", createdByName: "Saman" }), // refund by staff: flagged
  dep({ id: "f2", kind: "received", amount: 40000, createdByUid: "S" }), // money in: not a refund, not flagged
  dep({ id: "f3", kind: "refunded", amount: 50000, createdByUid: "ghost" }), // maker not on the team: not flagged
];

const marks: ReviewMark[] = [];
const q = () => reviewQueue({ threshold: 10000, discounts, expenses, returns, deposits, members, marks });

let items = q();
ok(items.map((i) => i.key).join(",") === "refund:f1,discount:d1,expense:e1,return:r1", "the flagged items are listed largest first");
ok(items.every((i) => i.amount > 10000), "only items over the threshold are listed");
ok(items[0].byName === "Saman" && items[3].byName === "Ayesha", "each item says who made it");
ok(items.find((i) => i.kind === "discount")!.what.startsWith("Discount: "), "a discount is labelled with its reason");
ok(items.find((i) => i.kind === "expense")!.date === "2026-03-02", "an expense is dated by when it started");

// Marking one checked removes it from the list, and only that one.
marks.push({ id: reviewKey("discount", "d1"), checkedAt: 2 });
items = q();
ok(!items.some((i) => i.key === "discount:d1"), "a checked item is removed from the list");
ok(items.length === 3, "the other flagged items stay on the list");

// Threshold off means nothing is listed.
ok(reviewQueue({ threshold: 0, discounts, expenses, returns, deposits, members, marks: [] }).length === 0, "with no threshold set, nothing is listed");
ok(reviewQueue({ threshold: undefined as unknown as number, discounts, expenses, returns, deposits, members, marks: [] }).length === 0, "an unset threshold lists nothing");

// Exactly at the threshold is not over it.
ok(reviewQueue({ threshold: 12000, discounts: [], expenses, returns: [], deposits: [], members, marks: [] }).length === 0, "an entry exactly at the threshold is not listed");

// Loyalty: one point per whole amount spent, and how much more for the next.
const l1 = loyaltyStanding(1250, 500)!;
ok(l1.points === 2 && l1.toNext === 250, "1,250 spent at one point per 500 is 2 points, 250 to the next");
const l2 = loyaltyStanding(500, 500)!;
ok(l2.points === 1 && l2.toNext === 500, "exactly one step is one point, a full step to the next");
const l3 = loyaltyStanding(499.99, 500)!;
ok(l3.points === 0 && l3.toNext === 0.01, "just under a step is no points yet");
const l4 = loyaltyStanding(-50, 500)!;
ok(l4.points === 0 && l4.toNext === 500, "a negative spend (returns beyond sales) earns nothing");
ok(loyaltyStanding(100, 0) === null && loyaltyStanding(100, undefined) === null, "with loyalty off there is no standing");

// Wiring checks.
const dash = fs.readFileSync("app/dashboard/page.tsx", "utf8");
ok(/<ReviewQueueCard \/>/.test(dash) && /import ReviewQueueCard from "@\/components\/ReviewQueueCard"/.test(dash), "the dashboard shows the review card");
const cust = fs.readFileSync("app/customers/page.tsx", "utf8");
ok(/loyaltyStanding\(stats\?\.revenue \?\? 0, settings\.loyaltyEvery\)/.test(cust), "the customers page works out points from net revenue");
ok(/loyalty\.points/.test(cust), "the customers page shows the points");
const settings = fs.readFileSync("app/settings/page.tsx", "utf8");
ok(/reviewAbove: Math\.max\(0, Number\(reviewAbove\) \|\| 0\)/.test(settings) && /loyaltyEvery: Math\.max\(0, Number\(loyaltyEvery\) \|\| 0\)/.test(settings), "the settings save both amounts");
const dataCtx = fs.readFileSync("contexts/DataContext.tsx", "utf8");
ok(/createdByUid: uid,\s*createdByName: memberName/.test(dataCtx), "a new expense records who entered it");
ok(/markReviewed: async/.test(dataCtx) && /doc\(db, "users", bizId, "reviewMarks", key\)/.test(dataCtx), "marking an item checked is saved");
const rules = fs.readFileSync("firestore.rules", "utf8");
ok(/match \/reviewMarks\/\{docId\} \{/.test(rules), "the security rules cover review marks");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
