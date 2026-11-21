"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { formatNumber, todayIso } from "@/lib/format";
import type { Location } from "@/lib/types";
import {
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
} from "@/components/ui";

export default function LocationsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager"]);
  const {
    locations,
    addLocation,
    updateLocation,
    deleteLocation,
    products,
    locationStockLevels,
    stockTransfers,
    addStockTransfer,
    role,
    loading,
  } = useData();
  const toast = useToast();
  const canEdit = can(role, "manage:products");
  const canDelete = can(role, "delete:records");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  // Total physical units on hand at each location, summed across every
  // product — a quick "does this place have any stock at all" signal.
  const unitsByLocation = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of locationStockLevels) {
      map.set(l.locationId, (map.get(l.locationId) ?? 0) + Math.max(0, l.qtyOnHand));
    }
    return map;
  }, [locationStockLevels]);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(l: Location) {
    setEditing(l);
    setModalOpen(true);
  }

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Locations" action={<Button disabled>+ Add location</Button>} />
        <StatGridSkeleton count={2} />
        <TableCardSkeleton rows={4} cols={3} />
      </>
    );
  }

  const activeLocations = locations.filter((l) => l.active);
  const canTransfer = canEdit && activeLocations.length >= 2 && products.some((p) => p.type === "product" && p.active);

  return (
    <>
      <PageHeader
        title="Locations"
        action={
          <div className="flex gap-2">
            {canTransfer && (
              <Button variant="ghost" onClick={() => setTransferOpen(true)}>
                Transfer stock
              </Button>
            )}
            {canEdit && <Button onClick={openNew}>+ Add location</Button>}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6">
        <Stat label="Locations" value={locations.length.toString()} />
        <Stat label="Active" value={activeLocations.length.toString()} />
      </div>

      {locations.length <= 1 && (
        <div className="mb-4 text-xs text-muted">
          You have one location, so it never shows up as a picker anywhere else in the app — everything just works
          the way it always has. Add a second one here if you&apos;re tracking stock or sales across more than one place.
        </div>
      )}

      <div className="sm:hidden space-y-2.5">
        {locations.map((l) => (
          <Card key={l.id} className="p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">
                {l.name}
                {l.isDefault && <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">Default</span>}
              </div>
              {canEdit && (
                <button onClick={() => openEdit(l)} className="text-xs text-muted hover:text-fg">
                  Edit
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-1.5 text-xs">
              <span className="text-muted">{l.active ? "Active" : "Inactive"}</span>
              <span className="num">{formatNumber(unitsByLocation.get(l.id) ?? 0)} on hand</span>
            </div>
          </Card>
        ))}
      </div>

      <Card className="hidden sm:block">
        <Table>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
              <th className="py-2 pr-3 font-medium whitespace-nowrap">Name</th>
              <th className="py-2 px-3 font-medium whitespace-nowrap">Status</th>
              <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Units on hand</th>
              {canEdit && <th className="py-2 pl-3 font-medium text-right">·</th>}
            </tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="py-2.5 pr-3 font-medium">
                  {l.name}
                  {l.isDefault && <span className="ml-2 text-[10px] uppercase tracking-wide text-muted">Default</span>}
                </td>
                <td className="py-2.5 px-3 text-muted">{l.active ? "Active" : "Inactive"}</td>
                <td className="py-2.5 px-3 num text-right">{formatNumber(unitsByLocation.get(l.id) ?? 0)}</td>
                {canEdit && (
                  <td className="py-2.5 pl-3 text-right">
                    <button onClick={() => openEdit(l)} className="text-xs text-muted hover:text-fg">
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {stockTransfers.length > 0 && (
        <>
          <div className="text-sm font-medium mt-8 mb-2">Recent transfers</div>

          <div className="sm:hidden space-y-2.5">
            {stockTransfers.slice(0, 25).map((t) => (
              <Card key={t.id} className="p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{products.find((p) => p.id === t.productId)?.name ?? "—"}</span>
                  <span className="num text-sm">{formatNumber(t.qty)}</span>
                </div>
                <div className="text-xs text-muted mt-1">
                  {locations.find((l) => l.id === t.fromLocationId)?.name ?? "—"} →{" "}
                  {locations.find((l) => l.id === t.toLocationId)?.name ?? "—"} · {t.date}
                </div>
              </Card>
            ))}
          </div>

          <Card className="hidden sm:block">
            <Table>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                  <th className="py-2 pr-3 font-medium whitespace-nowrap">Date</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap">Item</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap">From</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap">To</th>
                  <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Qty</th>
                </tr>
              </thead>
              <tbody>
                {stockTransfers.slice(0, 25).map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 text-muted">{t.date}</td>
                    <td className="py-2.5 px-3">{products.find((p) => p.id === t.productId)?.name ?? "—"}</td>
                    <td className="py-2.5 px-3 text-muted">{locations.find((l) => l.id === t.fromLocationId)?.name ?? "—"}</td>
                    <td className="py-2.5 px-3 text-muted">{locations.find((l) => l.id === t.toLocationId)?.name ?? "—"}</td>
                    <td className="py-2.5 px-3 num text-right">{formatNumber(t.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit location" : "Add location"}>
        <LocationForm
          initial={editing}
          onCancel={() => setModalOpen(false)}
          onSave={async (values) => {
            try {
              if (editing) await updateLocation(editing.id, values);
              else await addLocation(values);
              toast.success(editing ? "Location updated" : "Location added", values.name);
              setModalOpen(false);
            } catch (err) {
              toast.error("Couldn't save", toastableErrorMessage(err));
            }
          }}
          onDelete={
            editing && canDelete && !editing.isDefault
              ? async () => {
                  if (!confirm(`Delete "${editing.name}"? This only works if nothing has ever been recorded against it — the right move for a branch added by mistake. Use Inactive instead for one that closed after real use.`))
                    return;
                  try {
                    await deleteLocation(editing.id);
                    toast.success("Location deleted", editing.name);
                    setModalOpen(false);
                  } catch (err) {
                    toast.error("Couldn't delete location", toastableErrorMessage(err));
                  }
                }
              : undefined
          }
        />
      </Modal>

      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Transfer stock">
        <TransferForm
          onCancel={() => setTransferOpen(false)}
          onSave={async (values) => {
            try {
              await addStockTransfer(values);
              toast.success("Stock transferred");
              setTransferOpen(false);
            } catch (err) {
              toast.error("Couldn't transfer stock", toastableErrorMessage(err));
            }
          }}
        />
      </Modal>
    </>
  );
}

function LocationForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Location | null;
  onSave: (values: { name: string; active?: boolean }) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSave(initial ? { name, active } : { name });
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <Field>
        <Label>Name</Label>
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kandy branch" />
      </Field>
      {initial && !initial.isDefault && (
        <Field>
          <Label>Status</Label>
          <Select value={active ? "active" : "inactive"} onChange={(e) => setActive(e.target.value === "active")}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      )}
      {initial?.isDefault && (
        <div className="text-xs text-muted">
          This is the default location — every sale, purchase, or adjustment logged before locations existed lives
          here, so it can be renamed but not deactivated.
        </div>
      )}
      <div className="flex items-center justify-between pt-2">
        <div>
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function TransferForm({
  onSave,
  onCancel,
}: {
  onSave: (values: { productId: string; fromLocationId: string; toLocationId: string; qty: number; date: string; notes?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const { products, locations, locationStockLevels } = useData();
  const stockProducts = useMemo(() => products.filter((p) => p.type === "product" && p.active), [products]);
  const activeLocations = locations.filter((l) => l.active);

  const [productId, setProductId] = useState(stockProducts[0]?.id ?? "");
  const [fromLocationId, setFromLocationId] = useState(activeLocations[0]?.id ?? "");
  const [toLocationId, setToLocationId] = useState(activeLocations[1]?.id ?? activeLocations[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const availableAtSource = locationStockLevels.find(
    (l) => l.productId === productId && l.locationId === fromLocationId
  )?.qtyOnHand ?? 0;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSave({
            productId,
            fromLocationId,
            toLocationId,
            qty: Number(qty) || 0,
            date,
            notes: notes || undefined,
          });
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <Field>
        <Label>Item</Label>
        <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
          {stockProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>From</Label>
          <Select value={fromLocationId} onChange={(e) => setFromLocationId(e.target.value)}>
            {activeLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <div className="text-[11px] text-muted mt-1">{formatNumber(availableAtSource)} on hand there now</div>
        </Field>
        <Field>
          <Label>To</Label>
          <Select value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
            {activeLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {fromLocationId === toLocationId && (
        <div className="text-xs text-amber-soft">Pick two different locations.</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Quantity</Label>
          <Input required type="number" min="0.01" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field>
          <Label>Date</Label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. restocking after weekend rush" />
      </Field>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || fromLocationId === toLocationId || !(Number(qty) > 0)}>
          {busy ? "Moving…" : "Transfer"}
        </Button>
      </div>
    </form>
  );
}
