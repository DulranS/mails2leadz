"use client";

import { compareByBin } from "@/lib/bins";
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney } from "@/lib/format";
import { parseCounted, countVariance, varianceValue, MAX_COUNT_LINES } from "@/lib/stockCount";
import { Button, Input } from "@/components/ui";
import { LocationField, defaultLocationId } from "@/components/LocationPicker";

// The count sheet: type what is really on the shelf for each item, see the difference against the books, and record
// every difference at once. Items left blank are not touched. Differences are recorded as ordinary count-correction
// adjustments (not revenue and not cost of goods, but they DO reach profit: a shortage is booked as stock shrinkage, a loss at
// average cost, and extra stock as a gain), worked out against the stock on hand at the moment you
// press the button, so a sale made while you were counting is not counted twice.
export default function StockCountSheet({ onDone }: { onDone: () => void }) {
  const { products, ledgers, locations, locationStockLevels, recordStockCount, settings } = useData();
  const toast = useToast();
  const multiLocation = locations.filter((l) => l.active).length > 1;
  const [locationId, setLocationId] = useState(defaultLocationId(locations));
  const [query, setQuery] = useState("");
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const goods = useMemo(
    () =>
      products
        .filter((p) => p.type === "product" && p.active)
        .filter((p) => !query.trim() || `${p.name} ${p.sku ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
        .sort(compareByBin),
    [products, query]
  );

  const systemQty = (id: string) =>
    multiLocation
      ? locationStockLevels.find((l) => l.productId === id && l.locationId === locationId)?.qtyOnHand ?? 0
      : ledgers.get(id)?.qtyOnHand ?? 0;

  // Everything typed so far, across the whole list (not only the rows the search is showing).
  const summary = useMemo(() => {
    let differ = 0;
    let counted = 0;
    let errors = 0;
    let netValue = 0;
    for (const p of products) {
      const t = typed[p.id];
      if (t === undefined || t.trim() === "") continue;
      const parsed = parseCounted(t, !!p.allowFractionalQty);
      if (parsed.error) { errors += 1; continue; }
      counted += 1;
      const v = countVariance(systemQty(p.id), parsed.value);
      if (v !== null && v !== 0) {
        differ += 1;
        netValue += varianceValue(v, ledgers.get(p.id)?.wac ?? 0) ?? 0;
      }
    }
    return { differ, counted, errors, netValue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, products, ledgers, locationStockLevels, locationId, multiLocation]);

  async function record() {
    setBusy(true);
    try {
      const counts = products
        .filter((p) => p.type === "product")
        .map((p) => ({ productId: p.id, counted: parseCounted(typed[p.id] ?? "", !!p.allowFractionalQty).value }));
      const n = await recordStockCount(counts, { locationId: multiLocation ? locationId : undefined, notes: notes || undefined });
      toast.success("Stock count recorded", `${n} item${n === 1 ? "" : "s"} adjusted`);
      onDone();
    } catch (err) {
      toast.error("Couldn't record the count", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const tooMany = summary.differ > MAX_COUNT_LINES;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Type what is really there for each item; leave an item blank to skip it. Only items that differ are adjusted, and the difference is
        worked out against the stock on hand when you press Record, not what this screen showed.
      </p>
      {multiLocation && <LocationField value={locationId} onChange={(id) => { setLocationId(id); setTyped({}); }} label="Counting at" />}
      <Input placeholder="Search by name or SKU" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="max-h-[50vh] overflow-y-auto border border-line rounded-md divide-y divide-line">
        {goods.length === 0 && <div className="p-3 text-sm text-muted">No items to count.</div>}
        {goods.map((p) => {
          const system = systemQty(p.id);
          const t = typed[p.id] ?? "";
          const parsed = parseCounted(t, !!p.allowFractionalQty);
          const v = parsed.error ? null : countVariance(system, parsed.value);
          return (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-[11px] text-muted num">
                  {p.binLocation ? `Shelf ${p.binLocation} · ` : ""}Books: {system}
                  {v !== null && v !== 0 && (
                    <span className={v < 0 ? "text-bad" : "text-good"}>
                      {" "}· {v > 0 ? "+" : ""}{v} ({formatMoney(varianceValue(v, ledgers.get(p.id)?.wac ?? 0) ?? 0, settings.currency)})
                    </span>
                  )}
                  {v === 0 && <span className="text-good"> · matches</span>}
                  {parsed.error && <span className="text-bad"> · {parsed.error}</span>}
                </div>
              </div>
              <input
                aria-label={`Counted: ${p.name}`}
                inputMode="decimal"
                value={t}
                onChange={(e) => setTyped((m) => ({ ...m, [p.id]: e.target.value }))}
                placeholder="Counted"
                className="w-24 rounded-md border border-line bg-panel2 px-2 py-2 text-sm text-right num"
              />
            </div>
          );
        })}
      </div>
      <Input placeholder="Note (optional), e.g. end-of-month count" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="text-xs text-muted num">
        {summary.counted} counted · {summary.differ} differ
        {summary.differ > 0 && <> · effect on this month&apos;s profit: {summary.netValue > 0 ? "+" : ""}{formatMoney(summary.netValue, settings.currency)} (shortages are booked as stock shrinkage at average cost, extra stock as a gain)</>}
        {summary.errors > 0 && <span className="text-bad"> · {summary.errors} to fix</span>}
        {tooMany && <span className="text-bad"> · too many at once, count one category at a time</span>}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="button" disabled={busy || summary.differ === 0 || summary.errors > 0 || tooMany} onClick={record}>
          {busy ? "Recording…" : `Record count (${summary.differ} adjustment${summary.differ === 1 ? "" : "s"})`}
        </Button>
      </div>
    </div>
  );
}
