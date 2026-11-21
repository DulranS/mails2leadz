// Server-only loader for one invoice (the sales that share an invoiceId, or one sale that has none). Used by the owner's link
// route and by the customer's route, so both always see the same sales. Admin SDK, no client rules involved.
import type { Firestore } from "firebase-admin/firestore";
import type { Discount, ReceivablePayment, Sale, SaleReturn } from "./types";

export interface LoadedInvoice {
  key: string;
  sales: Sale[];
  returns: SaleReturn[];
  discounts: Discount[];
  payments: ReceivablePayment[];
}

// key = the invoiceId shared by the lines, or the id of a sale that has no invoiceId (the same rule as groupSalesByInvoice).
export async function loadInvoice(db: Firestore, businessId: string, key: string): Promise<LoadedInvoice | null> {
  const base = db.collection("users").doc(businessId);
  let sales: Sale[] = [];
  const byInvoice = await base.collection("sales").where("invoiceId", "==", key).get();
  if (!byInvoice.empty) {
    sales = byInvoice.docs.map((d) => ({ ...(d.data() as Sale), id: d.id }));
  } else {
    const one = await base.collection("sales").doc(key).get();
    if (!one.exists) return null;
    const data = one.data() as Sale;
    if (data.invoiceId) return null; // belongs to an invoice: must be reached by that invoice's key
    sales = [{ ...data, id: one.id }];
  }
  const saleIds = sales.map((s) => s.id);
  const perSale = async (collection: string) =>
    (await Promise.all(saleIds.map((id) => base.collection(collection).where("saleId", "==", id).get()))).flatMap((snap) =>
      snap.docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }))
    );
  const [returns, discounts, payments] = await Promise.all([
    perSale("saleReturns") as Promise<SaleReturn[]>,
    perSale("discounts") as Promise<Discount[]>,
    perSale("receivablePayments") as Promise<ReceivablePayment[]>,
  ]);
  return { key, sales, returns, discounts, payments };
}
