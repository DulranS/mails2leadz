"use client";

import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { can } from "@/lib/permissions";
import { lateChargeFor, lateFeeBilledFor, lateFeeKeyFor, lateFeeStillDue } from "@/lib/lateFees";
import { formatMoney } from "@/lib/format";

type NoteLine = { amountOutstanding: number; daysOverdue: number; saleId?: string; saleIds?: string[]; invoiceId?: string; isOpeningBalance?: boolean };

// "Late charge so far" beside an overdue invoice, only when the owner has turned late charges on in Settings and
// something has built up. Advisory until the owner taps "Bill it": that records the charge as a sale of a service item to
// the same customer (never automatic), and a later tap bills only what has built up since.
export default function LateChargeNote({ line, variant }: { line: NoteLine; variant: "row" | "cell" }) {
  const { settings, sales, products, recordLateFee, role } = useData();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const services = products.filter((p) => p.type === "service" && p.active);
  const [productId, setProductId] = useState("");
  const [busy, setBusy] = useState(false);

  const accrued = lateChargeFor(line, settings);
  const key = line.saleId ? lateFeeKeyFor({ invoiceId: line.invoiceId, saleId: line.saleId }) : "";
  const billed = lateFeeBilledFor(sales, key);
  const isFee = (line.saleIds ?? (line.saleId ? [line.saleId] : [])).some((id) => !!sales.find((s) => s.id === id)?.lateFeeForKey);
  const due = lateFeeStillDue(accrued, billed);
  if (isFee || (accrued < 0.005 && billed < 0.005)) return null;
  const money = formatMoney(due, settings.currency);
  if (variant === "cell") return due > 0 ? <div className="text-[11px] text-bad font-normal">+ {money} late charge</div> : null;

  const canBill = !!key && !line.isOpeningBalance && can(role, "manage:sales") && due > 0;
  return (
    <div className="mt-2 text-xs">
      {due > 0 ? (
        <>
          <span className="text-muted">Late charge so far </span>
          <span className="num text-bad">{money}</span>
          <span className="text-muted"> (not billed; it is not in the amount owed)</span>
        </>
      ) : (
        <span className="text-muted">Late charge billed: {formatMoney(billed, settings.currency)}. Nothing further has built up.</span>
      )}
      {billed > 0 && due > 0 && <span className="text-muted"> {formatMoney(billed, settings.currency)} already billed.</span>}
      {canBill && !open && (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center min-h-[40px] sm:min-h-0 px-1 ml-1 text-amber-soft hover:underline">
          Bill it
        </button>
      )}
      {canBill && open && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {services.length === 0 ? (
            <span className="text-muted">Add a service item (for example &quot;Late fee&quot;) on the Products page first.</span>
          ) : (
            <>
              <select
                value={productId || services[0].id}
                onChange={(e) => setProductId(e.target.value)}
                className="rounded-md border border-line bg-panel2 px-2 py-1 text-xs"
                aria-label="Bill the late charge as"
              >
                {services.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await recordLateFee(key, productId || services[0].id);
                    toast.success("Late charge billed", money);
                    setOpen(false);
                  } catch (err) {
                    toast.error("Couldn't bill it", toastableErrorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex items-center min-h-[40px] sm:min-h-0 px-1 text-amber-soft hover:underline disabled:opacity-50"
              >
                {busy ? "Billing…" : `Bill ${money}`}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex items-center min-h-[40px] sm:min-h-0 px-1 text-muted hover:underline">Cancel</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
