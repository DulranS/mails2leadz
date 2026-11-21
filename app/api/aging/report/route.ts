import { requireAiContext } from "@/lib/firebaseAdmin";
import { aiErrorResponse } from "@/lib/apiError";
import { generateAgingReport, getOverdueAlerts } from "@/lib/paymentAging";
import type { Sale, Purchase, ReceivablePayment, PayablePayment, ReceivableWriteOff, Expense, BillPayment, OpeningBalance, SupplierCreditEntry, SupplierReturn, CustomerDepositEntry } from "@/lib/types";

export const runtime = "nodejs";
// This route reads the Authorization header (via requireAiContext) on every
// request — a value that can never exist at build time. Without this, Next
// tries to statically pre-render the GET handler and throws
// DYNAMIC_SERVER_USAGE ("couldn't be rendered statically because it used
// `request.headers`") instead of just treating it as dynamic
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireAiContext(req);
    const { db, businessId } = ctx;

    // Fetch all relevant data
    const [salesSnap, purchasesSnap, receivablePaymentsSnap, payablePaymentsSnap, receivableWriteOffsSnap, expensesSnap, billPaymentsSnap, openingBalancesSnap, supplierReturnsSnap, supplierCreditsSnap, customerDepositsSnap] = await Promise.all([
      // Credit only: the aging maths skips cash sales/purchases, so they are never read.
      db.collection(`users/${businessId}/sales`).where("paymentMethod", "==", "credit").get(),
      db.collection(`users/${businessId}/purchases`).where("paymentMethod", "==", "credit").get(),
      db.collection(`users/${businessId}/receivablePayments`).get(),
      db.collection(`users/${businessId}/payablePayments`).get(),
      db.collection(`users/${businessId}/receivableWriteOffs`).get(),
      db.collection(`users/${businessId}/expenses`).get(),
      db.collection(`users/${businessId}/billPayments`).get(),
      db.collection(`users/${businessId}/openingBalances`).get(),
      db.collection(`users/${businessId}/supplierReturns`).where("settlement", "==", "reduce_payable").get(),
      // Supplier credit used on a bill is no longer owed either.
      db.collection(`users/${businessId}/supplierCredits`).where("kind", "==", "applied").get(),
      // A customer deposit used on an invoice is no longer owed.
      db.collection(`users/${businessId}/customerDeposits`).where("kind", "==", "applied").get(),
    ]);

    const sales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Sale[];
    const purchases = purchasesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Purchase[];
    const receivablePayments = receivablePaymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ReceivablePayment[];
    const payablePayments = payablePaymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as PayablePayment[];
    const receivableWriteOffs = receivableWriteOffsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as ReceivableWriteOff[];
    const expenses = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Expense[];
    const billPayments = billPaymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as BillPayment[];
    const openingBalances = openingBalancesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as OpeningBalance[];
    const supplierReturns = supplierReturnsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as SupplierReturn[];
    const supplierCredits = supplierCreditsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as SupplierCreditEntry[];
    const customerDeposits = customerDepositsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as CustomerDepositEntry[];

    // Generate aging report
    const report = generateAgingReport(sales, purchases, receivablePayments, payablePayments, receivableWriteOffs, undefined, expenses, billPayments, openingBalances, supplierReturns, supplierCredits, customerDeposits);

    // Get overdue alerts
    const overdueAlerts = getOverdueAlerts(report.receivables);

    return Response.json({
      ...report,
      overdueAlerts,
    });
  } catch (err) {
    return aiErrorResponse(err, "aging/report GET");
  }
}