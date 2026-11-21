// A believable dummy business for sales demos: "Lanka Gadgets", a small Colombo
// phone-accessories reseller with about three months of history. Pure data — no
// Firebase, no randomness — so the same call always yields the same books and
// scripts/verify-demo-data.ts can prove they balance.
//
// It is only ever written into a brand-new, separate demo account created by
// app/api/admin/demo (never into a customer's business). Every date is
// relative to `todayISO`, so the demo always looks current: some invoices are
// overdue, some not yet due, one bill is unpaid, and there is an opening
// balance so the "moving a running business in" story can be shown live.
import { DEFAULT_SETTINGS } from "./types";
import type { Settings } from "./types";

export interface DemoDoc {
  id: string;
  data: Record<string, unknown>;
}

export interface DemoData {
  settings: Settings;
  collections: Record<string, DemoDoc[]>;
}

function isoAddDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export const DEMO_BUSINESS_NAME = "Lanka Gadgets (demo)";

export function buildDemoData(todayISO: string): DemoData {
  const [ty, tm] = todayISO.split("-").map(Number);
  // First day of the month two months ago: three calendar months of history.
  const start = new Date(Date.UTC(ty, tm - 3, 1)).toISOString().slice(0, 10);
  // Never in the future, so the P&L (capped at the current month) sees it all.
  const at = (n: number) => {
    const d = isoAddDays(start, n);
    return d > todayISO ? todayISO : d;
  };

  let seq = 1000;
  const next = () => (seq += 1);
  const col: Record<string, DemoDoc[]> = {};
  const put = (name: string, id: string, data: Record<string, unknown>) => {
    (col[name] ??= []).push({ id, data: { ...data, createdAt: next() } });
  };

  const products: [string, string, string, number, number][] = [
    ["p-earbuds", "Wireless earbuds", "EAR-01", 2200, 3500],
    ["p-case", "Phone case", "CAS-01", 350, 800],
    ["p-powerbank", "Power bank 10000mAh", "PWR-01", 3000, 4900],
    ["p-cable", "USB-C cable", "CBL-01", 450, 950],
  ];
  for (const [id, name, sku, cost, price] of products) {
    put("products", id, {
      name, sku, category: "Accessories", type: "product", active: true,
      defaultCostPrice: cost, defaultSellPrice: price, minStockLevel: 10,
    });
  }

  put("customers", "c-nimal", { name: "Nimal Perera", contact: "0771234567" });
  put("customers", "c-kamal", { name: "Kamal Stores", contact: "0712345678" });
  put("customers", "c-sunil", { name: "Sunil Traders", contact: "0761234567" });
  put("suppliers", "s-cmt", { name: "Colombo Mobile Traders", contact: "0112345678" });
  put("suppliers", "s-fort", { name: "Fort Wholesale", contact: "0119876543" });

  // Day one, the way USER-MANUAL.md says to move a running business over:
  // cash + stock as capital, stock as cash purchases on the start date.
  put("capitalEntries", "cap-open", { kind: "investment", amount: 900000, date: start, notes: "Cash and stock at start" });
  const openStock: [string, number, number][] = [["p-earbuds", 100, 2200], ["p-case", 250, 350], ["p-powerbank", 30, 3000], ["p-cable", 100, 450]];
  openStock.forEach(([productId, qty, unitCost], i) =>
    put("purchases", `pur-open-${i}`, { productId, qty, unitCost, date: start, supplier: "Opening stock" })
  );

  // Money already owed on the start date (no revenue, no cost booked).
  put("openingBalances", "ob-nimal", {
    kind: "receivable", party: "Nimal Perera", contact: "0771234567", amount: 45000,
    date: start, dueDate: at(14), note: "INV-0031",
  });
  put("openingBalances", "ob-cmt", {
    kind: "payable", party: "Colombo Mobile Traders", amount: 60000,
    date: start, dueDate: at(30), note: "Bill 8812",
  });
  put("receivablePayments", "rp-nimal", { saleId: "ob-nimal", amount: 20000, date: at(10), method: "bank_transfer" });
  put("payablePayments", "pp-cmt", { purchaseId: "ob-cmt", amount: 30000, date: at(25), method: "bank_transfer" });

  // Restocks: one on supplier credit (partly paid), one for cash.
  put("purchases", "pur-r1", {
    productId: "p-earbuds", qty: 30, unitCost: 2300, date: at(35), supplier: "Colombo Mobile Traders",
    paymentMethod: "credit", creditTermDays: 30, dueDate: isoAddDays(at(35), 30),
  });
  put("payablePayments", "pp-r1", { purchaseId: "pur-r1", amount: 15000, date: at(60), method: "bank_transfer" });
  put("purchases", "pur-r2", { productId: "p-powerbank", qty: 20, unitCost: 3100, date: at(50), supplier: "Fort Wholesale" });

  // Everyday cash sales, one round a day, rotating items.
  const rotation: [string, number, number][] = [["p-earbuds", 3, 3500], ["p-case", 6, 800], ["p-cable", 5, 950], ["p-powerbank", 2, 4900], ["p-case", 8, 800], ["p-earbuds", 4, 3500]];
  const span = Math.max(0, Math.round((Date.parse(todayISO) - Date.parse(start)) / 86400000));
  let round = 0;
  for (let day = 1; day <= span; day += 1) {
    const [productId, qty, unitPrice] = rotation[round % rotation.length];
    put("sales", `sale-cash-${round}`, { productId, qty, unitPrice, date: at(day), paymentMethod: "cash", customer: "Walk-in" });
    round += 1;
  }

  // Credit sales: one overdue and partly collected, one not yet due.
  put("sales", "sale-kamal", {
    productId: "p-powerbank", qty: 5, unitPrice: 4900, date: at(15), customer: "Kamal Stores", customerContact: "0712345678",
    paymentMethod: "credit", creditTermDays: 30, dueDate: isoAddDays(at(15), 30),
  });
  put("receivablePayments", "rp-kamal", { saleId: "sale-kamal", amount: 10000, date: at(50), method: "cash" });
  put("sales", "sale-sunil", {
    productId: "p-case", qty: 10, unitPrice: 800, date: at(span > 20 ? span - 10 : 0), customer: "Sunil Traders", customerContact: "0761234567",
    paymentMethod: "credit", creditTermDays: 30, dueDate: isoAddDays(at(span > 20 ? span - 10 : 0), 30),
  });

  // Expenses: monthly rent, a monthly service retainer (recurring revenue), a paid one-off, and one unpaid bill.
  // Recurring lines count as a full month from their first month, so rent alone would make a demo
  // created in the first days of a month show a loss on the very row a prospect looks at first.
  // The retainer is real recurring revenue (a shop-fit-out contract), which keeps every month
  // honest AND shows off the recurring-revenue feature.
  put("expenses", "exp-rent", {
    name: "Shop rent", amount: 25000, category: "Rent", kind: "expense", isRecurring: true, recurrence: "monthly", startDate: start,
  });
  put("expenses", "exp-retainer", {
    name: "Display-stand service retainer (Kamal Stores)", amount: 30000, category: "Service retainer", kind: "revenue",
    isRecurring: true, recurrence: "monthly", startDate: start,
  });
  put("expenses", "exp-pack", {
    name: "Packaging", amount: 6000, category: "Supplies", kind: "expense", isRecurring: false, recurrence: "none", startDate: at(20),
  });
  put("expenses", "exp-courier", {
    name: "Courier invoice", amount: 9500, category: "Delivery", kind: "expense", isRecurring: false, recurrence: "none",
    startDate: at(45), payee: "Pronto Courier", paymentStatus: "unpaid", dueDate: isoAddDays(at(45), 30),
  });

  return { settings: { ...DEFAULT_SETTINGS, businessName: DEMO_BUSINESS_NAME, currency: "LKR" }, collections: col };
}
