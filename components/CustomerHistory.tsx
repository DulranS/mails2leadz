"use client";

// Everything that has happened with one customer, newest first, on one screen: sales, deposits, rentals, bookings, support
// and payment contacts. Owner and manager use it from the Customers page; it only reads.
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { customerHistory, type HistoryKind } from "@/lib/customerTimeline";
import { formatMoney } from "@/lib/format";
import { Badge, EmptyState } from "@/components/ui";

const KIND_LABEL: Record<HistoryKind, string> = {
  sale: "Sale",
  deposit: "Deposit",
  rental: "Rental",
  booking: "Booking",
  support: "Support",
  collection: "Payment contact",
};

export default function CustomerHistory({ name }: { name: string }) {
  const { sales, customerDeposits, rentals, bookings, supportCases, collectionNotes, products, settings } = useData();
  const productName = useMemo(() => {
    const m = new Map(products.map((p) => [p.id, p.name]));
    return (id: string) => m.get(id) ?? "Item";
  }, [products]);
  const events = useMemo(
    () =>
      customerHistory({
        name,
        sales,
        deposits: customerDeposits,
        rentals,
        bookings,
        supportCases,
        collectionNotes,
        productName,
      }),
    [name, sales, customerDeposits, rentals, bookings, supportCases, collectionNotes, productName]
  );

  if (events.length === 0) return <EmptyState title="No history yet" body={`Nothing is recorded for ${name} yet.`} />;

  return (
    <div className="divide-y divide-line text-xs">
      {events.map((e, idx) => (
        <div key={`${e.date}-${e.kind}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <div className="min-w-0">
            <div className="text-sm break-words">{e.label}</div>
            <div className="text-muted mt-0.5">
              {e.date} · <Badge tone="default">{KIND_LABEL[e.kind]}</Badge>
            </div>
          </div>
          {e.amount !== undefined && <span className="text-sm num">{formatMoney(e.amount, settings.currency)}</span>}
        </div>
      ))}
    </div>
  );
}
