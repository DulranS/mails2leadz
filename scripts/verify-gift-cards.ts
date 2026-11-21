// Gift cards (lib/giftCards.ts) and the bearer exception in the deposit check (lib/customerDeposits.ts). Hand-worked cases.
// Run: npx tsx scripts/verify-gift-cards.ts
import fs from "node:fs";
import {
  findGiftCard, giftCardLiability, giftCardName, listGiftCards, newGiftCardCode, normalizeGiftCardCode,
  validateGiftCardSale, validateGiftCardUse,
} from "../lib/giftCards";
import { validateNewDepositEntry } from "../lib/customerDeposits";
import type { CustomerDepositEntry } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

let n = 0;
const dep = (p: Partial<CustomerDepositEntry> & Pick<CustomerDepositEntry, "customer" | "kind" | "amount" | "date">): CustomerDepositEntry =>
  ({ id: `e${++n}`, createdAt: n, ...p }) as CustomerDepositEntry;

// Codes: normalise, and always new.
ok(normalizeGiftCardCode("abcd2345") === "ABCD-2345", "a code without the dash is put in the usual form");
ok(normalizeGiftCardCode(" ab cd-23 45 ") === "ABCD-2345", "stray spaces and case are ignored");
ok(normalizeGiftCardCode("ABCD-234") === "", "a code that is too short is refused");
ok(normalizeGiftCardCode("") === "", "an empty code is refused");
const taken = new Set(["AAAA-2222"]);
// The first eight draws make AAAA-AAAA, the next eight make SSSS-SSSS (index 16 of the alphabet, S).
let draws = 0;
const firstThenNext = () => (draws++ < 8 ? 0 : 0.5);
const first = newGiftCardCode(taken, () => 0);
ok(first === "AAAA-AAAA", "a generated code has the right shape");
const avoid = newGiftCardCode(new Set(["AAAA-AAAA"]), firstThenNext);
ok(avoid === "SSSS-SSSS", "a code already in use is skipped for the next one");
ok(!/[01IO]/.test(newGiftCardCode(new Set(), () => 0.999)), "codes never use 0, 1, I or O");

// A card: sold for 5,000 by Nimal, 2 Jan; 2,000 used on an invoice for Ann on 10 Jan; 1,000 refunded on 20 Jan.
const code = "KQ7T-P9WX";
const name = giftCardName(code);
const ledger: CustomerDepositEntry[] = [
  dep({ customer: name, kind: "received", amount: 5000, date: "2026-01-02", method: "cash", giftCardCode: code, notes: "Bought by Nimal" }),
  dep({ customer: name, kind: "applied", amount: 2000, date: "2026-01-10", saleId: "S-ANN" }),
  dep({ customer: name, kind: "refunded", amount: 1000, date: "2026-01-20", method: "cash" }),
];
const row = listGiftCards(ledger, "2026-01-31")[0];
ok(row.balance === 2000, "the balance is what is left after use and refund (5000 - 2000 - 1000 = 2000)");
ok(row.buyer === "Nimal" && row.soldAmount === 5000 && row.issuedDate === "2026-01-02", "the buyer, value and day sold are shown");
ok(findGiftCard(ledger, "kq7tp9wx", "2026-01-31")!.balance === 2000, "lookup works with any case and no dash");
ok(findGiftCard(ledger, "ZZZZ-ZZZZ", "2026-01-31") === null, "an unknown code finds nothing");
ok(findGiftCard(ledger, "KQ7T-P9WX", "2026-01-05")!.balance === 5000, "as at an earlier date, only earlier movements count");
ok(findGiftCard(ledger, "KQ7T-P9WX", "2026-01-31")!.history.length === 3, "the history lists every movement");
ok(giftCardLiability(ledger, "2026-01-31").total === 2000 && giftCardLiability(ledger, "2026-01-31").cardsInUse === 1, "the liability is the money still held on cards");
ok(giftCardLiability(ledger, "2026-01-01").total === 0, "nothing is owed before the card is sold");

// A used-up card lists as used up and cannot be used again.
const used = [
  dep({ customer: name, kind: "received", amount: 500, date: "2026-02-01", method: "cash", giftCardCode: code }),
  dep({ customer: name, kind: "applied", amount: 500, date: "2026-02-02", saleId: "S1" }),
];
ok(listGiftCards(used, "2026-02-03")[0].balance === 0, "a fully used card has no balance");
ok(validateGiftCardUse({ balance: 0, amount: 10, outstanding: 100 }) === "This gift card has nothing left on it.", "a used-up card is refused");

// Selling a card.
ok(validateGiftCardSale({ amount: 0, date: "2026-01-02", today: "2026-01-02", method: "cash" }) !== null, "a card of zero is refused");
ok(validateGiftCardSale({ amount: 500, date: "2026-01-03", today: "2026-01-02", method: "cash" }) !== null, "a card cannot be sold on a future day");
ok(validateGiftCardSale({ amount: 500, date: "2026-01-02", today: "2026-01-02", method: "card" }) === null, "a valid sale is accepted");

// Using a card: never more than the balance or what is owed.
ok(validateGiftCardUse({ balance: 2000, amount: 2500, outstanding: 9000 })!.startsWith("The card only has"), "more than the balance is refused");
ok(validateGiftCardUse({ balance: 2000, amount: 1500, outstanding: 1000 })!.startsWith("That is more than"), "more than is owed on the invoice is refused");
ok(validateGiftCardUse({ balance: 2000, amount: 1000, outstanding: 1000 }) === null, "exactly what is owed, within the balance, is accepted");

// The bearer exception: a card may pay another customer's invoice, but an ordinary deposit may not.
const baseCheck = { date: "2026-01-15", saleId: "S-BOB", invoiceOutstanding: 800 };
ok(
  validateNewDepositEntry({ ...baseCheck, customer: name, kind: "applied", amount: 800, invoiceCustomer: "Bob", bearer: true }, ledger) === null,
  "a card pays Bob's invoice when it is marked as a bearer card"
);
ok(
  validateNewDepositEntry({ ...baseCheck, customer: name, kind: "applied", amount: 800, invoiceCustomer: "Bob" }, ledger) !== null,
  "without the bearer mark the card cannot pay someone else's invoice"
);
ok(
  validateNewDepositEntry({ ...baseCheck, customer: "Ann", kind: "applied", amount: 300, invoiceCustomer: "Bob" }, []) !== null,
  "an ordinary customer deposit still cannot pay another customer's invoice"
);
ok(
  validateNewDepositEntry({ ...baseCheck, customer: name, kind: "applied", amount: 2500, invoiceCustomer: "Bob", bearer: true }, ledger) !== null,
  "a bearer card still cannot go below zero"
);

// Wiring checks.
const dataCtx = fs.readFileSync("contexts/DataContext.tsx", "utf8");
ok(/isGiftCardCustomer\(e\.customer, customerDeposits\)/.test(dataCtx), "addCustomerDeposit checks for a bearer card");
ok(/giftCardCode: e\.giftCardCode/.test(dataCtx) || /payload\.giftCardCode = e\.giftCardCode/.test(dataCtx), "the card code is saved with the money taken");
ok(/already in use/.test(dataCtx), "a code is refused when it is already in use");
const page = fs.readFileSync("app/gift-cards/page.tsx", "utf8");
ok(/useRequireRole\(\["owner", "manager", "staff"\]\)/.test(page), "the Gift cards page is for owner, manager and staff (staff sell only)");
ok(/printVoucher\(/.test(page) && /escapeHtml\(code\)/.test(page), "the voucher is printed with the code escaped");

const rules = fs.readFileSync("firestore.rules", "utf8");
ok(/allow create: if isOwnerOrManager\(businessId\)\s*\|\|\s*\(isStaff\(businessId\)\s*&&\s*request\.resource\.data\.kind == "received"/.test(rules), "staff may create only a received deposit at the counter");
ok(/request\.resource\.data\.giftCardCode is string/.test(rules) && /request\.resource\.data\.createdByUid == request\.auth\.uid/.test(rules), "a staff gift card sale must carry a code and be theirs");
ok(/allow update: if isOwnerOrManager\(businessId\);/.test(rules.slice(rules.indexOf("match /customerDeposits"))), "only owner and manager can change deposits");
const perms = fs.readFileSync("lib/permissions.ts", "utf8");
ok(/"create:giftCard",\n\s*"manage:bookings"/.test(perms), "staff are granted create:giftCard and nothing that reads balances");
ok(/requirePermission\(e\.kind === "received" && e\.giftCardCode \? "create:giftCard" : "manage:products"\)/.test(dataCtx), "the deposit write lets staff sell a card only");
ok(/!isStaff && \(/.test(page) && /useRequireRole\(\["owner", "manager", "staff"\]\)/.test(page), "staff see the sell form only on the gift cards page");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
