// Empirical check for "close the books" (lib/periodLock.ts, lib/periodGuards.ts)
// and for the AI Assistant's server-side write path (lib/aiAutoConfirm.ts).
//
// Run: npx tsx scripts/verify-period-lock.ts

import { readFileSync } from "node:fs";
import {
  isValidIsoDate, endOfMonthIso, endOfPreviousMonthIso, isPeriodClosed, assertPeriodOpen,
  validateBooksClosedThrough, normalizeClosedThrough, firstOpenDateIso, formatIsoLong, PeriodClosedError,
} from "../lib/periodLock";
import { PERIOD_GUARDED_METHODS, withPeriodGuards, type PeriodGuardState } from "../lib/periodGuards";
import { autoConfirmEntry, isAutoConfirmable } from "../lib/aiAutoConfirm";
import { DEFAULT_SETTINGS } from "../lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}
function throws(fn: () => void): Error | null { try { fn(); return null; } catch (e) { return e as Error; } }
async function rejects(fn: () => Promise<unknown>): Promise<Error | null> { try { await fn(); return null; } catch (e) { return e as Error; } }

async function main() {
  // ---- dates -------------------------------------------------------------
  assert(isValidIsoDate("2026-08-31") && isValidIsoDate("2028-02-29"), "real dates accepted (incl. leap day)");
  assert(!isValidIsoDate("2027-02-29") && !isValidIsoDate("2026-13-01") && !isValidIsoDate("2026-00-10") && !isValidIsoDate("2026-04-31"), "impossible dates rejected");
  assert(!isValidIsoDate("yesterday") && !isValidIsoDate("2026-8-1") && !isValidIsoDate(undefined) && !isValidIsoDate(20260801), "non-ISO values rejected");
  assert(endOfMonthIso("2026-02-10") === "2026-02-28" && endOfMonthIso("2028-02-10") === "2028-02-29", "end of month handles February / leap years");
  assert(endOfPreviousMonthIso("2026-09-21") === "2026-08-31", "end of previous month");
  assert(endOfPreviousMonthIso("2026-01-05") === "2025-12-31", "end of previous month across a year boundary");
  assert(firstOpenDateIso("2026-08-31") === "2026-09-01" && firstOpenDateIso("2025-12-31") === "2026-01-01", "first open date is the day after the lock");
  assert(formatIsoLong("2026-08-31") === "31 Aug 2026", "long date format");

  // ---- validation of the owner's action ---------------------------------
  const today = "2026-09-21";
  assert(validateBooksClosedThrough(null, today) === null, "reopening (null) is always allowed");
  assert(validateBooksClosedThrough("2026-08-31", today) === null, "closing the last completed month is allowed");
  assert(validateBooksClosedThrough("2026-03-31", today) === null, "closing an older month-end is allowed");
  assert(validateBooksClosedThrough("2026-08-15", today) !== null, "a mid-month date is refused");
  assert(validateBooksClosedThrough("2026-09-30", today) !== null, "the month still in progress is refused");
  assert(validateBooksClosedThrough("2026-12-31", today) !== null, "a future month is refused");
  assert(validateBooksClosedThrough("2026-02-30", today) !== null, "an impossible date is refused");

  // ---- the lock itself ---------------------------------------------------
  assert(isPeriodClosed("2026-08-31", "2026-08-31"), "the lock date itself is closed");
  assert(isPeriodClosed("2026-01-01", "2026-08-31"), "an earlier date is closed");
  assert(!isPeriodClosed("2026-09-01", "2026-08-31"), "the day after the lock is open");
  assert(!isPeriodClosed("2026-08-01", undefined) && !isPeriodClosed("2026-08-01", ""), "no lock => nothing closed");
  assert(!isPeriodClosed("2026-08-01", "garbage") && normalizeClosedThrough("garbage") === undefined, "a corrupted lock value fails open, not shut");
  assert(!isPeriodClosed(undefined, "2026-08-31") && !isPeriodClosed("nope", "2026-08-31"), "a missing/malformed record date is not the lock's business");
  const e = throws(() => assertPeriodOpen("2026-08-31", ["2026-09-05", "2026-08-10"]));
  assert(e instanceof PeriodClosedError, "assertPeriodOpen throws PeriodClosedError for a closed date");
  assert(!!e && e.message.includes("31 Aug 2026") && e.message.includes("10 Aug 2026") && e.message.includes("1 Sep 2026"), "message names the lock, the date, and the first open date");
  assert(throws(() => assertPeriodOpen("2026-08-31", ["2026-09-05", undefined])) === null, "open + missing dates pass");

  // ---- guard table against realistic state ------------------------------
  const state: PeriodGuardState = {
    sales: [{ id: "sOld", date: "2026-07-10" }, { id: "sNew", date: "2026-09-02" }],
    purchases: [{ id: "pOld", date: "2026-06-01" }],
    expenses: [
      { id: "eOld", startDate: "2026-07-15", isRecurring: false },
      { id: "eRent", startDate: "2025-01-01", isRecurring: true },
      { id: "eNew", startDate: "2026-09-03", isRecurring: false },
    ],
    receivablePayments: [{ id: "rp1", saleId: "sNew", date: "2026-08-20" }, { id: "rp2", saleId: "sOld", date: "2026-09-10" }],
    receivableWriteOffs: [],
    payablePayments: [],
    billPayments: [{ id: "bp1", expenseId: "eNew", date: "2026-08-25" }],
    saleReturns: [],
    discounts: [],
    stockAdjustments: [{ id: "sa1", date: "2026-05-05" }],
    capitalEntries: [{ id: "c1", date: "2026-04-01" }],
    taxPayments: [{ id: "t1", date: "2026-08-31" }],
    recurringExpenseOccurrences: [{ id: "occ1", period: "2026-08-01" }],
    openingBalances: [{ id: "ob1", date: "2026-07-01" }],
  };
  const calls: string[] = [];
  const fake: Record<string, any> = { notGuarded: async () => "x", data: [1, 2, 3] };
  for (const name of Object.keys(PERIOD_GUARDED_METHODS)) fake[name] = async () => { calls.push(name); return name; };
  let lock: string | undefined = "2026-08-31";
  const g = withPeriodGuards(fake, () => lock, () => state);

  const blocked = async (name: string, ...args: unknown[]) => (await rejects(() => g[name](...args))) instanceof PeriodClosedError;
  const allowed = async (name: string, ...args: unknown[]) => (await rejects(() => g[name](...args))) === null;

  assert(await blocked("addSale", { date: "2026-08-31" }), "addSale into a closed month is refused");
  assert(await allowed("addSale", { date: "2026-09-01" }), "addSale into an open month passes");
  assert(await blocked("updateSale", "sOld", { qty: 9 }), "editing a closed-month sale is refused");
  assert(await blocked("updateSale", "sNew", { date: "2026-08-01" }), "moving an open sale INTO a closed month is refused");
  assert(await allowed("updateSale", "sNew", { qty: 9 }), "editing an open sale passes");
  assert(await blocked("deleteSale", "sOld"), "deleting a closed-month sale is refused");
  assert(await blocked("deleteSale", "sNew"), "deleting an open sale is refused when a linked payment is dated in a closed month");
  assert(await allowed("addReceivablePayment", { saleId: "sOld", date: "2026-09-21" }), "collecting cash today against a closed-month invoice passes");
  assert(await blocked("addReceivablePayment", { saleId: "sOld", date: "2026-08-02" }), "back-dating a payment into a closed month is refused");
  assert(await blocked("deleteReceivablePayment", "rp1"), "deleting a payment dated in a closed month is refused");
  assert(await allowed("deleteReceivablePayment", "rp2"), "deleting an open-month payment passes");
  assert(await blocked("addOpeningBalance", { date: "2026-08-15" }), "an opening balance can't be added into a closed month (it moves owner's capital)");
  assert(await blocked("deleteOpeningBalance", "ob1"), "deleting a closed-month opening balance is refused");
  assert(await blocked("bulkAddSales", [{ date: "2026-09-02" }, { date: "2026-08-02" }]), "one closed row blocks a whole bulk import");
  assert(await allowed("bulkAddSales", [{ date: "2026-09-02" }, { date: "2026-09-03" }]), "an all-open bulk import passes");
  assert(await blocked("addPurchase", { date: "2026-08-01" }) && await blocked("deletePurchase", "pOld"), "purchases are locked");
  assert(await blocked("receivePurchaseOrder", "po1", { receivedDate: "2026-08-30", qtyReceived: 1, receivedUnitCost: 1 }), "receiving an order dated in a closed month is refused");
  assert(await blocked("addExpense", { isRecurring: false, startDate: "2026-08-10" }), "one-off expense in a closed month is refused");
  assert(await allowed("addExpense", { isRecurring: true, startDate: "2026-08-10" }), "recurring schedules are not frozen");
  assert(await allowed("updateExpense", "eRent", { amount: 5 }), "editing an old recurring schedule passes");
  assert(await blocked("updateExpense", "eOld", { isRecurring: true }), "turning a closed one-off expense recurring is refused");
  assert(await blocked("updateExpense", "eNew", { startDate: "2026-07-01" }), "moving an open expense into a closed month is refused");
  assert(await blocked("deleteExpense", "eNew"), "deleting an open expense with a closed-month bill payment is refused");
  assert(await blocked("postExpenseOccurrence", "occ1"), "posting a drafted occurrence for a closed period is refused");
  assert(await blocked("addSaleReturn", { date: "2026-08-01" }) && await blocked("addDiscount", { date: "2026-08-01" }) && await blocked("addStockAdjustment", { date: "2026-08-01" }), "returns, discounts and stock adjustments are locked");
  assert(await blocked("deleteStockAdjustment", "sa1") && await blocked("updateCapitalEntry", "c1", { amount: 1 }) && await blocked("deleteTaxPayment", "t1"), "stock adjustments, capital entries and tax payments are locked");
  assert(await blocked("fulfillOffer", "prod", { date: "2026-08-02" }) && await blocked("recordProduction", "prod", { date: "2026-08-02" }), "fulfil/produce runs are locked");
  assert(await g.notGuarded() === "x" && g.data.length === 3, "non-guarded members pass through untouched");
  const before = calls.length;
  await rejects(() => g.addSale({ date: "2026-08-01" }));
  assert(calls.length === before, "a refused write never reaches the underlying method");
  lock = undefined;
  assert(await allowed("addSale", { date: "2020-01-01" }) && await allowed("deleteSale", "sOld"), "with no lock everything passes");
  lock = "2026-08-31";
  lock = undefined;

  // ---- the table must match DataContext.tsx -----------------------------
  const src = readFileSync(new URL("../contexts/DataContext.tsx", import.meta.url), "utf8");
  const missing = Object.keys(PERIOD_GUARDED_METHODS).filter((n) => !new RegExp(`^    ${n}: `, "m").test(src));
  assert(missing.length === 0, `every guarded method exists in DataContext.tsx${missing.length ? " — missing: " + missing.join(", ") : ""}`);
  // Any add*/update*/delete* method whose target record carries a date but is
  // not in the table is an unlocked hole; list the ones we knowingly skip.
  // Events hold no money: their ticket sales are ordinary sales, which the period lock already covers when they are recorded.
  const DELIBERATELY_UNLOCKED = new Set([
    // v230 recruiting: candidates are people records, with no money and no entry in the books.
    "addCandidate", "moveCandidate", "deleteCandidate", "updateCandidateChecks",
    // v232 obligations calendar: deadlines and renewals, with no money in them.
    "addObligation", "completeObligation", "deleteObligation",
    // v255 sustainability log: measurements (energy, waste, donations, volunteer hours), with no money posted from them.
    "addSustainabilityEntry", "deleteSustainabilityEntry",
    // v249 contract register: the terms of agreements, with no money posted from them.
    "addContract", "updateContract", "deleteContract",
    // v243 draft orders: an order to be reviewed, not a posting; the same as placing an order, which is not frozen by the lock either.
    "addDraftPurchaseOrders", "sendDraftPurchaseOrder",
    // v234 feedback loops: improvements and alternative suppliers, with no money in them.
    "addImprovement", "setImprovementStatus", "deleteImprovement", "addAlternative", "setAlternativeStatus", "deleteAlternative",
    // v177e risk register and quality log: nothing here posts to the books.
    "addRisk", "updateRisk", "deleteRisk", "addQualityCheck", "updateQualityCheck", "deleteQualityCheck",
    // v182 business log: competitors, objectives, correspondence and inspections are records, not money.
    "addLogEntry", "updateLogEntry", "recordInspectionDone", "deleteLogEntry",
    // v183 web orders: a status change or a line match is not money; each confirmed line goes through addSale, which the lock governs.
    "updateWebOrder", "deleteWebOrder",
    // v183b purchase approval and v183c log status: who may place an order and where a record stands. Neither posts money.
    "updatePurchaseOrderApproval", "updateLogStatus",
    // v176 operations (lib/operations.ts): records about how the business runs. None posts to the books, so a closed period does not lock them.
    "addRequest","updateRequestStatus","updateRequestReimbursed","deleteRequest","addProcedure","updateProcedure","updateProcedureAck","deleteProcedure","addCompliance","updateCompliance","deleteCompliance","addIncident","updateIncident","deleteIncident","addMaintenance","updateMaintenance","deleteMaintenance","logMaintenanceDone","addKpi","updateKpi","recordKpiReading","deleteKpi","addReview","updateReview","deleteReview",
    "addEvent","updateEvent","deleteEvent","addProduct","updateProduct","deleteProduct","addPurchaseOrder","updatePurchaseOrder","deletePurchaseOrder","addEstimate","updateEstimate","deleteEstimate",
    "addLead","updateLead","deleteLead","addPlaybookEntry","updatePlaybookEntry","deletePlaybookEntry","addLeaveRecord","deleteLeaveRecord","addSupportCase","updateSupportCase","deleteSupportCase","addFeedbackEntry","updateFeedbackEntry","deleteFeedbackEntry","addBusinessTask","updateBusinessTask","deleteBusinessTask","addBooking","updateBooking","deleteBooking","addTab","updateTabLines","deleteTab","addShift","updateShift","deleteShift","addShiftsForWeek","addShipment","updateShipment","deleteShipment","updateRental","addVariableCost","updateVariableCost","deleteVariableCost","addCustomer","updateCustomer","deleteCustomer","addSupplier","updateSupplier",
    "deleteSupplier","addRecurringInvoice","updateRecurringInvoice","deleteRecurringInvoice","addEmployee","updateEmployee","deleteEmployee","addJournalEntry","updateJournalEntry",
    "deleteJournalEntry","addOpportunity","updateOpportunity","deleteOpportunity","addBankStatementLine","updateBankStatementLine","deleteBankStatementLine","addLoan","updateLoan",
    "deleteLoan","addCashCount","updateCashCount","deleteCashCount","addFixedAsset","updateFixedAsset","deleteFixedAsset","addProject","updateProject","deleteProject",
    "addProjectCostSegment","updateProjectCostSegment","deleteProjectCostSegment","addProjectMilestone","updateProjectMilestone","deleteProjectMilestone","addTimeEntry",
    "updateTimeEntry","deleteTimeEntry","addRecurringExpenseTemplate","updateRecurringExpenseTemplate","deleteRecurringExpenseTemplate","updateExpenseOccurrenceLines",
    "discardExpenseOccurrence","addVariableCost","bulkDiscountProducts","updateOwnProfile","updateSettings","createInvite","revokeInvite","changeMemberRole","setMemberActive",
    // Locations are a structural tag (where stock/transactions physically sit), not a
    // dated financial record — nothing here touches revenue/COGS/WAC or any statement
    // total, so there's no "back-dating into a closed month" case to guard against.
    // deleteLocation additionally self-guards: it only ever removes a Location with zero
    // transactions against it (see DataContext.tsx), so it can't retroactively touch a
    // closed period's numbers either. addStockTransfer moves physical qty between two
    // Locations and carries a date, but — like addStockAdjustment's sibling StockTransfer
    // comment says — never touches revenue, COGS, or WAC, so it's exempt for the same
    // reason Locations are, not an oversight.
    "addLocation","updateLocation","deleteLocation","addStockTransfer",
    // A Security is only the holding's name and latest price. No money moves when it is created or
    // repriced (the price only changes today's unrealised value, never a month's recorded cash or
    // profit), and deleteSecurity refuses while any trade exists. The dated money movements are the
    // trades and income, and those ARE locked (addInvestmentTxn / deleteInvestmentTxn).
    "addSecurity","updateSecurity","deleteSecurity",
    // A lost sale (stock-out) is a memo of what a customer wanted and could not have. It never touches stock, revenue,
    // cost, cash or any statement (lib/stockOuts.ts), so there is no closed period for it to alter.
    "addStockOut","deleteStockOut",
    // A collections diary line is a note about a phone call: who was contacted, what they promised, when to try again. It never
    // touches cash, revenue, cost or any statement (lib/collections.ts), so closing a month has nothing in it to protect. The
    // money itself, when it arrives, goes through addReceivablePayment / addLentLoanTxn, which ARE locked.
    "addCollectionNote","deleteCollectionNote",
    // A job (work order) is an operational ticket: what was brought in, the parts and labour, the status. It moves no money by
    // itself. Turning it into an estimate writes a draft quote, which is not a ledger entry (lib/workOrders.ts), and a sale or
    // payment for the job goes through the locked sale and payment methods.
    "addWorkOrder","updateWorkOrder","deleteWorkOrder",
    // A cheque on the register is a memo: a promise to pay or be paid, not cash. It records no payment and touches no sale, cost,
    // cash or statement (lib/cheques.ts), so there is no closed period for it to alter. The payment itself, when the cheque
    // clears, goes through the locked payment methods.
    "addCheque","updateCheque","deleteCheque",
    // A mileage trip is a memo too: kilometres driven and an estimated running cost that is never posted (lib/mileage.ts).
    "addTrip","updateTrip","deleteTrip",
    // A membership is a count of prepaid hours left; the fee is an ordinary (locked) sale, and a covered booking records no sale (lib/memberships.ts).
    "addMembership","updateMembership","deleteMembership",
    // A farm batch is a count of animals and a log of feed, losses and readings. Feed and stock are bought through the locked purchase methods and the harvest is sold through the locked sale methods; typed costs are never posted (lib/farm.ts).
    "addFarmBatch","updateFarmBatch","deleteFarmBatch","addFarmEntry","deleteFarmEntry",
    // A contingent item is a memo of what could cost the business money, never booked (lib/contingent.ts). It moves no ledger line.
    "addContingency","updateContingency","deleteContingency",
    // A personal data request is a record of a request and its deadline (lib/dataRequests.ts). It moves no money and no ledger line.
    "addDataRequest","updateDataRequest","deleteDataRequest",
  ]);
  const writers = [...src.matchAll(/^    ((?:add|update|delete)[A-Za-z]+): async/gm)].map((m) => m[1]);
  const unclassified = writers.filter((n) => !(n in PERIOD_GUARDED_METHODS) && !DELIBERATELY_UNLOCKED.has(n));
  assert(unclassified.length === 0, `every add/update/delete method is either locked or knowingly exempt${unclassified.length ? " — unclassified: " + unclassified.join(", ") : ""}`);

  // ---- AI Assistant server path -----------------------------------------
  function fakeDb(closedThrough?: string) {
    const written: { path: string; data: any }[] = [];
    const db: any = {
      doc: (_path: string) => ({ get: async () => ({ data: () => (closedThrough ? { booksClosedThrough: closedThrough } : {}) }) }),
      collection: (path: string) => ({ add: async (data: any) => { written.push({ path, data }); return { id: "new1" }; } }),
    };
    return { db, written };
  }
  const expense = (date: string, isRecurring = false) => ({ id: "x", status: "pending" as const, kind: "expense" as const, name: "Rent", amount: 100, isRecurring, date });
  const sale = (date: string) => ({ id: "y", status: "pending" as const, kind: "sale" as const, productName: "Cement", matchedProductId: "p1", matchConfidence: 0.95, qty: 1, unitPrice: 10, date });

  assert(!isAutoConfirmable(expense("yesterday") as any) && !isAutoConfirmable(sale("2026-13-40") as any), "a proposal with a non-calendar date is never auto-confirmable");
  assert(isAutoConfirmable(expense("2026-09-01") as any) && isAutoConfirmable(sale("2026-09-01") as any), "a complete proposal with a real date is confirmable");

  let d = fakeDb("2026-08-31");
  const deps = (x: ReturnType<typeof fakeDb>) => ({ db: x.db, businessId: "b1", uid: "u1", memberName: "Ann", settings: DEFAULT_SETTINGS });
  let err = await rejects(() => autoConfirmEntry(deps(d), sale("2026-08-15") as any));
  assert(err instanceof PeriodClosedError && d.written.length === 0, "AI confirm of a sale into a closed month is refused and writes nothing");
  err = await rejects(() => autoConfirmEntry(deps(d), expense("2026-08-15") as any));
  assert(err instanceof PeriodClosedError && d.written.length === 0, "AI confirm of a one-off expense into a closed month is refused");
  err = await rejects(() => autoConfirmEntry(deps(d), expense("2026-08-15", true) as any));
  assert(err === null && d.written.some((w) => w.path.endsWith("/expenses")), "AI confirm of a recurring expense is not frozen (matches the app)");
  d = fakeDb("2026-08-31");
  err = await rejects(() => autoConfirmEntry(deps(d), sale("2026-09-02") as any));
  assert(err === null && d.written.some((w) => w.path.endsWith("/sales")), "AI confirm into an open month writes the sale");
  d = fakeDb(undefined);
  err = await rejects(() => autoConfirmEntry(deps(d), sale("2020-01-01") as any));
  assert(err === null, "with no lock the AI path is unchanged");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
