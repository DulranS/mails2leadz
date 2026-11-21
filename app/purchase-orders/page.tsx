"use client";

import { receiptVariance } from "@/lib/receiving";
import { useMemo, useState } from "react";
import BuyingListCard from "@/components/BuyingListCard";
import type { BuyingLine } from "@/lib/buyingList";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { formatMoney, formatNumber, todayIso } from "@/lib/format";
import type { OrderStatus, Product, PurchaseOrder } from "@/lib/types";
import { LocationField, defaultLocationId } from "@/components/LocationPicker";
import { PackUnitSelect } from "@/components/PackUnitSelect";
import { baseUnitLabel, resolveEntryUnit, toBaseQty, toBaseUnitAmount } from "@/lib/units";
import { landedUnitCost } from "@/lib/calculations";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Label,
  Modal,
  PageHeader,
  Select,
  Stat,
  StatGridSkeleton,
  Table,
  TableCardSkeleton,
  EmptyState,
} from "@/components/ui";

const STATUS_TONE: Record<OrderStatus, "default" | "good" | "bad" | "amber"> = {
  draft: "default",
  ordered: "amber",
  in_transit: "amber",
  awaiting_approval: "amber",
  received: "good",
  cancelled: "bad",
};

export default function PurchaseOrdersPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager"]);
  const {
    products,
    purchaseOrders,
    addPurchaseOrder,
    updatePurchaseOrder,
    cancelPurchaseOrder,
    sendDraftPurchaseOrder,
    deletePurchaseOrder,
    updatePurchaseOrderApproval,
    receivePurchaseOrder,
    openOrders,
    settings,
    loading,
  } = useData();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrder | null>(null);
  // A filled-in but unsaved order, from a line of "What to order now". Nothing is written until the form is confirmed.
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const currency = settings.currency;

  function openNew() {
    setEditing(null);
    setDraft(null);
    setModalOpen(true);
  }
  function openEdit(po: PurchaseOrder) {
    setEditing(po);
    setDraft(null);
    setModalOpen(true);
  }
  function openDraft(line: BuyingLine) {
    setEditing(null);
    setDraft({ productId: line.productId, qtyOrdered: line.suggestQty, unitCost: line.costKnown ? line.unitCost : undefined, supplier: line.supplier ?? undefined });
    setModalOpen(true);
  }

  function handleCancel(id: string) {
    if (!confirm("Cancel this order? You can still delete it afterward if it was a mistake.")) return;
    cancelPurchaseOrder(id)
      .then(() => toast.success("Order cancelled"))
      .catch(() => toast.error("Couldn't cancel the order"));
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this order from history? This can't be undone.")) return;
    deletePurchaseOrder(id)
      .then(() => toast.success("Order deleted"))
      .catch(() => toast.error("Couldn't delete the order"));
  }

  const stockProducts = useMemo(() => products.filter((p) => p.type === "product"), [products]);
  const openList = useMemo(
    () => purchaseOrders.filter((po) => po.status === "ordered" || po.status === "in_transit"),
    [purchaseOrders]
  );
  const awaitingList = useMemo(() => purchaseOrders.filter((po) => po.status === "awaiting_approval"), [purchaseOrders]);
  const draftList = useMemo(() => purchaseOrders.filter((po) => po.status === "draft"), [purchaseOrders]);
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "Item";
  async function sendDraft(id: string) {
    try {
      await sendDraftPurchaseOrder(id);
      toast.success("Sent", "The order is placed, or waits for approval if it is above your amount");
    } catch (err) {
      toast.error("Couldn't send it", toastableErrorMessage(err));
    }
  }
  const closedList = useMemo(
    () => purchaseOrders.filter((po) => po.status === "received" || po.status === "cancelled"),
    [purchaseOrders]
  );

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Wholesale orders" action={<Button disabled>+ Place order</Button>} />
        <StatGridSkeleton count={3} className="lg:grid-cols-3" />
        <TableCardSkeleton rows={5} cols={6} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Wholesale orders"
        action={
          <Button onClick={openNew} disabled={stockProducts.length === 0}>
            + Place order
          </Button>
        }
      />

      <BuyingListCard onOrder={openDraft} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <Stat label="Open orders" value={formatNumber(openOrders.openOrderCount)} />
        <Stat label="Units on order" value={formatNumber(openOrders.openOrderUnits)} />
        <Stat label="Already committed to spend" value={formatMoney(openOrders.openOrderValue, currency)} tone="amber" />
      </div>

      {stockProducts.length === 0 && (
        <EmptyState
          title="Add a physical product first"
          body="Wholesale orders apply to type: product offerings — services have nothing to reorder. Add one on the Products page."
        />
      )}

      {stockProducts.length > 0 && purchaseOrders.length === 0 && (
        <EmptyState
          title="No orders placed yet"
          body="Place a wholesale order to track it from commitment through to delivery. Receiving it automatically logs the stock on the Purchases page."
        />
      )}

      {draftList.length > 0 && (
        <Card className="p-4 mb-4">
          <div className="text-sm font-medium mb-1">Drafts to review ({draftList.length})</div>
          <div className="text-xs text-muted mb-2">Made from the buying list. Nothing has been sent. Sending applies your approval amount, the same as any other order.</div>
          <div className="space-y-2">
            {draftList.map((po) => (
              <div key={po.id} className="flex items-center justify-between gap-3 flex-wrap text-sm">
                <span>{productName(po.productId)} · {po.qtyOrdered} units · {po.supplier ?? "no supplier"}</span>
                <span className="flex gap-3">
                  <button onClick={() => sendDraft(po.id)} className="text-xs text-amber-soft hover:underline min-h-[32px]">Send to supplier</button>
                  <button onClick={() => cancelPurchaseOrder(po.id).catch((err) => toast.error("Couldn't discard it", toastableErrorMessage(err)))} className="text-xs text-muted hover:text-fg min-h-[32px]">Discard</button>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {awaitingList.length > 0 && (
        <Card className="mb-6">
          <div className="text-sm font-medium mb-1">Waiting for approval ({awaitingList.length})</div>
          <div className="text-xs text-muted mb-3">These are above your approval amount. Nothing is ordered until one of you approves it.</div>
          <div className="space-y-2">
            {awaitingList.map((po) => {
              const p = products.find((x) => x.id === po.productId);
              return (
                <div key={po.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{p?.name ?? "Item"}</span>
                    <span className="text-muted"> · {formatNumber(po.qtyOrdered)} units · {formatMoney(po.qtyOrdered * po.unitCost, currency)}{po.supplier ? ` · ${po.supplier}` : ""}</span>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => updatePurchaseOrderApproval(po.id, "approved").then(() => toast.success("Order approved")).catch((err) => toast.error("Couldn't approve it", toastableErrorMessage(err)))} className="text-xs text-good hover:underline min-h-[32px]">Approve</button>
                    <button onClick={() => { const note = prompt("Reason for rejecting (optional)") ?? ""; updatePurchaseOrderApproval(po.id, "rejected", note).then(() => toast.success("Order rejected")).catch((err) => toast.error("Couldn't reject it", toastableErrorMessage(err))); }} className="text-xs text-bad hover:underline min-h-[32px]">Reject</button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {openList.length > 0 && (
        <Card className="mb-6">
          <div className="text-sm font-medium mb-3">Open orders</div>

          {/* Mobile: one card per order. Same data as the table below, never
              rendered at the same time. */}
          <div className="sm:hidden space-y-2.5">
            {openList.map((po) => {
              const product = products.find((p) => p.id === po.productId);
              return (
                <Card key={po.id} className="!p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{product?.name ?? "—"}</div>
                      <div className="text-xs text-muted mt-0.5 num">{po.orderDate}</div>
                    </div>
                    <Badge tone={STATUS_TONE[po.status]}>{po.status.replace("_", " ")}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                    <div>
                      <span className="text-muted">Qty </span>
                      <span className="num">{po.qtyOrdered}</span>
                    </div>
                    <div>
                      <span className="text-muted">Unit cost </span>
                      <span className="num">{formatMoney(po.unitCost, currency)}</span>
                    </div>
                    <div>
                      <span className="text-muted">Expected </span>
                      <span className="num">{po.expectedDate || "—"}</span>
                  {po.supplierAck && <span className="block text-xs text-good">supplier confirmed {po.supplierAck.confirmedDate}</span>}
                    </div>
                    {po.supplier && (
                      <div>
                        <span className="text-muted">Supplier </span>
                        <span>{po.supplier}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                    <button onClick={() => setReceivingId(po.id)} className="text-xs text-good hover:underline min-h-[44px] sm:min-h-[32px]">
                      Receive
                    </button>
                    <button onClick={() => openEdit(po)} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]">
                      Edit
                    </button>
                    <button onClick={() => handleCancel(po.id)} className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]">
                      Cancel
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Desktop: the full table, unchanged. */}
          <div className="hidden sm:block">
          <Table>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="py-2 pr-3 font-medium">Ordered</th>
                <th className="py-2 px-3 font-medium">Product</th>
                <th className="py-2 px-3 font-medium text-right">Qty</th>
                <th className="py-2 px-3 font-medium text-right">Unit cost</th>
                <th className="py-2 px-3 font-medium">Expected</th>
                <th className="py-2 px-3 font-medium">Supplier</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 pl-3 font-medium text-right">·</th>
              </tr>
            </thead>
            <tbody>
              {openList.map((po) => {
                const product = products.find((p) => p.id === po.productId);
                return (
                  <tr key={po.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 text-muted num">{po.orderDate}</td>
                    <td className="py-2.5 px-3 font-medium">{product?.name ?? "—"}</td>
                    <td className="py-2.5 px-3 num text-right">{po.qtyOrdered}</td>
                    <td className="py-2.5 px-3 num text-right">{formatMoney(po.unitCost, currency)}</td>
                    <td className="py-2.5 px-3 text-muted num">{po.expectedDate || "—"}{po.supplierAck && <span className="block text-xs text-good">supplier confirmed {po.supplierAck.confirmedDate}</span>}</td>
                    <td className="py-2.5 px-3 text-muted">{po.supplier || "—"}</td>
                    <td className="py-2.5 px-3">
                      <Badge tone={STATUS_TONE[po.status]}>{po.status.replace("_", " ")}</Badge>
                    </td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      <button onClick={() => setReceivingId(po.id)} className="text-xs text-good hover:underline mr-3">
                        Receive
                      </button>
                      <button onClick={() => openEdit(po)} className="text-xs text-muted hover:text-fg mr-3">
                        Edit
                      </button>
                      <button onClick={() => handleCancel(po.id)} className="text-xs text-muted hover:text-bad">
                        Cancel
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          </div>
        </Card>
      )}

      {closedList.length > 0 && (
        <Card>
          <div className="text-sm font-medium mb-3">Order history</div>

          {/* Mobile: one card per order. Same data as the table below, never
              rendered at the same time. */}
          <div className="sm:hidden space-y-2.5">
            {closedList.map((po) => {
              const product = products.find((p) => p.id === po.productId);
              return (
                <Card key={po.id} className="!p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{product?.name ?? "—"}</div>
                      <div className="text-xs text-muted mt-0.5 num">{po.orderDate}</div>
                    </div>
                    <Badge tone={STATUS_TONE[po.status]}>{po.status}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                    <div>
                      <span className="text-muted">Ordered </span>
                      <span className="num">{po.qtyOrdered}</span>
                    </div>
                    <div>
                      <span className="text-muted">Received </span>
                      <span className="num">{po.qtyReceived ?? "—"}</span>
                    </div>
                  </div>
                  <ReceiptFlag po={po} />
                  <div className="mt-2.5 pt-2.5 border-t border-line">
                    <button onClick={() => handleDelete(po.id)} className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]">
                      Delete
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Desktop: the full table, unchanged. */}
          <div className="hidden sm:block">
          <Table>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="py-2 pr-3 font-medium">Ordered</th>
                <th className="py-2 px-3 font-medium">Product</th>
                <th className="py-2 px-3 font-medium text-right">Qty ordered</th>
                <th className="py-2 px-3 font-medium text-right">Qty received</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 pl-3 font-medium text-right">·</th>
              </tr>
            </thead>
            <tbody>
              {closedList.map((po) => {
                const product = products.find((p) => p.id === po.productId);
                return (
                  <tr key={po.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 text-muted num">{po.orderDate}</td>
                    <td className="py-2.5 px-3 font-medium">{product?.name ?? "—"}</td>
                    <td className="py-2.5 px-3 num text-right">{po.qtyOrdered}</td>
                    <td className="py-2.5 px-3 num text-right">
                      {po.qtyReceived ?? "—"}
                      <ReceiptFlag po={po} />
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge tone={STATUS_TONE[po.status]}>{po.status}</Badge>
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      <button onClick={() => handleDelete(po.id)} className="text-xs text-muted hover:text-bad">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit order" : "Place wholesale order"}>
        <OrderForm
          key={editing?.id ?? (draft ? `draft-${draft.productId}` : "new")}
          products={stockProducts}
          initial={editing}
          draft={draft}
          onCancel={() => setModalOpen(false)}
          onSave={async (values) => {
            try {
              if (editing) {
                await updatePurchaseOrder(editing.id, values);
                toast.success("Order updated");
              } else {
                await addPurchaseOrder(values);
                toast.success("Order placed");
              }
              setModalOpen(false);
            } catch (err) {
              toast.error(editing ? "Couldn't update the order" : "Couldn't place the order", toastableErrorMessage(err));
            }
          }}
        />
      </Modal>

      <Modal open={!!receivingId} onClose={() => setReceivingId(null)} title="Receive order">
        {receivingId && (
          <ReceiveForm
            po={purchaseOrders.find((p) => p.id === receivingId)!}
            onCancel={() => setReceivingId(null)}
            onSave={async (receipt) => {
              try {
                await receivePurchaseOrder(receivingId, receipt);
                toast.success("Order received", "Stock updated");
                setReceivingId(null);
              } catch (err) {
                toast.error("Couldn't receive the order", toastableErrorMessage(err));
              }
            }}
          />
        )}
      </Modal>
    </>
  );
}

type OrderDraft = { productId: string; qtyOrdered: number; unitCost?: number; supplier?: string };

function OrderForm({
  products,
  initial,
  draft,
  onSave,
  onCancel,
}: {
  products: Product[];
  initial?: PurchaseOrder | null;
  draft?: OrderDraft | null;
  onSave: (values: {
    productId: string;
    qtyOrdered: number;
    unitCost: number;
    orderDate: string;
    expectedDate?: string;
    supplier?: string;
    notes?: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [productId, setProductId] = useState(initial?.productId ?? draft?.productId ?? products[0]?.id ?? "");
  const [qtyOrdered, setQtyOrdered] = useState(initial?.qtyOrdered?.toString() ?? draft?.qtyOrdered?.toString() ?? "");
  const [unitCost, setUnitCost] = useState(initial?.unitCost?.toString() ?? draft?.unitCost?.toString() ?? "");
  const [orderDate, setOrderDate] = useState(initial?.orderDate ?? todayIso());
  const [expectedDate, setExpectedDate] = useState(initial?.expectedDate ?? "");
  const [supplier, setSupplier] = useState(initial?.supplier ?? draft?.supplier ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  // Ordering in packs: entered per pack, saved per base unit (lib/units.ts). A saved order is always shown in base units.
  const [entryUnitId, setEntryUnitId] = useState("");
  const product = products.find((p) => p.id === productId);
  const entryUnit = resolveEntryUnit(product, entryUnitId);
  const factor = entryUnit.factor;
  const unitText = baseUnitLabel(product) || "unit";
  const qtyBase = toBaseQty(Number(qtyOrdered) || 0, factor);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({
          productId,
          qtyOrdered: qtyBase,
          unitCost: toBaseUnitAmount(Number(unitCost), factor),
          orderDate,
          expectedDate: expectedDate || undefined,
          supplier,
          notes,
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <Field>
        <Label>Product</Label>
        <Select required value={productId} onChange={(e) => { setProductId(e.target.value); setEntryUnitId(""); }}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <PackUnitSelect product={product} value={entryUnitId} onChange={(id) => setEntryUnitId(id)} label="Ordering in" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>{entryUnit.id === "" ? "Quantity ordered" : `${entryUnit.name}s ordered`}</Label>
          <Input required type="number" inputMode="decimal" min="0" step={product?.allowFractionalQty ? "any" : "1"} value={qtyOrdered} onChange={(e) => setQtyOrdered(e.target.value)} />
        </Field>
        <Field>
          <Label>{entryUnit.id === "" ? "Quoted unit cost" : `Quoted cost per ${entryUnit.name}`}</Label>
          <Input required type="number" inputMode="decimal" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
        </Field>
      </div>
      {entryUnit.id !== "" && qtyBase > 0 && Number(unitCost) > 0 && (
        <div className="text-xs text-muted -mt-2" aria-live="polite">
          = {qtyBase} {unitText} on order, at {toBaseUnitAmount(Number(unitCost), factor).toFixed(2)} per {unitText}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Order date</Label>
          <Input required type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Expected delivery (optional)</Label>
          <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>Supplier (optional)</Label>
        <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
      </Field>
      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : initial ? "Save changes" : "Place order"}
        </Button>
      </div>
    </form>
  );
}

function ReceiveForm({
  po,
  onSave,
  onCancel,
}: {
  po: { qtyOrdered: number; unitCost: number; productId?: string };
  onSave: (receipt: { qtyReceived: number; receivedUnitCost: number; receivedDate: string; locationId?: string; freightCost?: number; customsCost?: number; otherLandedCost?: number; expiryDate?: string; batchRef?: string; receivingNote?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const { locations, products } = useData();
  const fractional = products.find((p) => p.id === po.productId)?.allowFractionalQty;
  const [qtyReceived, setQtyReceived] = useState(po.qtyOrdered.toString());
  const [receivingNote, setReceivingNote] = useState("");
  const [receivedUnitCost, setReceivedUnitCost] = useState(po.unitCost.toString());
  const [receivedDate, setReceivedDate] = useState(todayIso());
  const [locationId, setLocationId] = useState(defaultLocationId(locations));
  const [busy, setBusy] = useState(false);
  // Freight, customs and handling arrive as their own bills, once for the whole delivery. They belong in the stock cost,
  // or the margin on this stock is overstated by exactly what it cost to get it here.
  const [showLanded, setShowLanded] = useState(false);
  const [freight, setFreight] = useState("");
  const [customs, setCustoms] = useState("");
  const [otherCost, setOtherCost] = useState("");
  // Optional, memo-only: same two fields as the Purchases form, so stock that arrives through an order is covered by the Expiry watch too.
  const [expiryDate, setExpiryDate] = useState("");
  const [batchRef, setBatchRef] = useState("");
  const qtyNum = Number(qtyReceived) || 0;
  const landedTotal = showLanded ? (Number(freight) || 0) + (Number(customs) || 0) + (Number(otherCost) || 0) : 0;
  const allIn = landedUnitCost(Number(receivedUnitCost) || 0, qtyNum, showLanded ? Number(freight) || 0 : 0, showLanded ? Number(customs) || 0 : 0, showLanded ? Number(otherCost) || 0 : 0);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({
          qtyReceived: Number(qtyReceived),
          receivedUnitCost: Number(receivedUnitCost),
          receivedDate,
          locationId: locationId || undefined,
          freightCost: showLanded ? Number(freight) || 0 : undefined,
          customsCost: showLanded ? Number(customs) || 0 : undefined,
          otherLandedCost: showLanded ? Number(otherCost) || 0 : undefined,
          expiryDate: expiryDate || undefined,
          batchRef: batchRef.trim() || undefined,
          receivingNote: receivingNote.trim() || undefined,
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <div className="text-xs text-muted">
        Confirm what actually arrived — this creates the inventory entry. Quantity or cost can differ from what was
        originally ordered.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Quantity received</Label>
          <Input required type="number" inputMode="decimal" min="0" step={fractional ? "any" : "1"} value={qtyReceived} onChange={(e) => setQtyReceived(e.target.value)} />
        </Field>
        <Field>
          <Label>Actual unit cost</Label>
          <Input required type="number" min="0" step="0.01" value={receivedUnitCost} onChange={(e) => setReceivedUnitCost(e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>Anything wrong with the delivery? (optional)</Label>
        <Input value={receivingNote} onChange={(e) => setReceivingNote(e.target.value)} placeholder="e.g. 2 damaged, 3 short" />
        <div className="text-[11px] text-muted mt-1">A note for your records. It does not change the stock or the cost.</div>
      </Field>
      <div className="rounded-lg border border-line p-3">
        <button type="button" onClick={() => setShowLanded((v) => !v)} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-0">
          {showLanded ? "− Hide" : "+ Add"} freight / customs / handling for this delivery
        </button>
        {showLanded && (
          <>
            <div className="text-[11px] text-muted mt-1.5 mb-3">
              Enter the TOTAL for the whole delivery, not per unit. It is spread across the {qtyNum || "…"} units so your real cost, and margin, include getting them here.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field>
                <Label>Freight/shipping</Label>
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={freight} onChange={(e) => setFreight(e.target.value)} />
              </Field>
              <Field>
                <Label>Customs/duty</Label>
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={customs} onChange={(e) => setCustoms(e.target.value)} />
              </Field>
              <Field>
                <Label>Other (handling…)</Label>
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={otherCost} onChange={(e) => setOtherCost(e.target.value)} />
              </Field>
            </div>
            {landedTotal > 0 && qtyNum > 0 && (
              <div className="text-xs text-muted mt-3 pt-3 border-t border-line" aria-live="polite">
                Goods {Number(receivedUnitCost || 0).toFixed(2)} + delivery {(landedTotal / qtyNum).toFixed(2)} ={" "}
                <span className="text-fg font-medium">{allIn.toFixed(2)} each, all-in</span>
              </div>
            )}
          </>
        )}
      </div>
      <Field>
        <Label>Received date</Label>
        <Input required type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
      </Field>
      <LocationField value={locationId} onChange={setLocationId} label="Received into" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Use-by / expiry date (optional)</Label>
          <Input type="date" min={receivedDate} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          <div className="text-[11px] text-muted mt-1">Food, medicine, cosmetics. Skip it for anything that does not expire.</div>
        </Field>
        <Field>
          <Label>Batch / lot number (optional)</Label>
          <Input value={batchRef} onChange={(e) => setBatchRef(e.target.value)} placeholder="From the supplier's label" />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Mark received"}
        </Button>
      </div>
    </form>
  );
}

// Short or over delivery, and the note on what was wrong with it. Shown only when there is something to say.
function ReceiptFlag({ po }: { po: PurchaseOrder }) {
  const v = receiptVariance(po.qtyOrdered, po.qtyReceived);
  if (v.kind === "none" && !po.receivingNote) return null;
  if (v.kind === "exact" && !po.receivingNote) return null;
  return (
    <div className="mt-1 space-y-1 text-left">
      {v.kind === "short" && <Badge tone="amber">Short by {v.units}</Badge>}
      {v.kind === "over" && <Badge tone="default">Over by {v.units}</Badge>}
      {po.receivingNote && <div className="text-[11px] text-muted">{po.receivingNote}</div>}
    </div>
  );
}
