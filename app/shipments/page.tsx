"use client";

// Shipments: goods on their way, by reference, with each stage and the proof of delivery. A manual record: nothing is fetched from a
// carrier. Freight and customs costs stay on the purchase or expense, so no money figure changes here.
import { useMemo, useState, type FormEvent } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { todayIso } from "@/lib/format";
import {
  MAX_SHIP_CARRIER, MAX_SHIP_NOTES, MAX_SHIP_PERSON, MAX_SHIP_PLACE, MAX_SHIP_REF, SHIPMENT_STAGES, cleanShipmentInput, isOverdue,
  nextStage, sortOpenShipments, summarizeShipments, validateShipmentInput, type ShipmentInput,
} from "@/lib/shipments";
import type { Shipment, ShipmentStage } from "@/lib/types";
import { Button, Card, EmptyState, Field, Input, Label, Modal, PageHeader, Select, Stat, TableCardSkeleton, Textarea } from "@/components/ui";

const stageLabel = (s: ShipmentStage) => SHIPMENT_STAGES.find((x) => x.value === s)?.label ?? s;

// The date field each stage fills in when it is reached.
const DATE_KEY: Partial<Record<ShipmentStage, "shippedOn" | "arrivedOn" | "clearedOn" | "deliveredOn">> = {
  shipped: "shippedOn",
  arrived: "arrivedOn",
  cleared: "clearedOn",
  delivered: "deliveredOn",
};

function toInput(s: Shipment): ShipmentInput {
  return {
    reference: s.reference,
    carrier: s.carrier,
    supplierName: s.supplierName,
    origin: s.origin,
    destination: s.destination,
    stage: s.stage,
    etaDate: s.etaDate,
    shippedOn: s.shippedOn,
    arrivedOn: s.arrivedOn,
    clearedOn: s.clearedOn,
    deliveredOn: s.deliveredOn,
    receivedBy: s.receivedBy,
    proofRef: s.proofRef,
    notes: s.notes,
  };
}

export default function ShipmentsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "staff", "accountant"]);
  const { role } = useAuth();
  const { shipments, loading, addShipment, updateShipment, deleteShipment } = useData();
  const toast = useToast();
  const canWrite = can(role, "manage:shipments");
  const canDelete = can(role, "delete:records");
  const today = todayIso();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Shipment | null>(null);
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => summarizeShipments(shipments, today), [shipments, today]);
  const open = useMemo(() => sortOpenShipments(shipments, today), [shipments, today]);
  const delivered = useMemo(
    () =>
      shipments
        .filter((s) => s.stage === "delivered")
        .sort((a, b) => (b.deliveredOn ?? "").localeCompare(a.deliveredOn ?? ""))
        .slice(0, 10),
    [shipments]
  );

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Shipments" />
        <TableCardSkeleton rows={4} cols={3} />
      </>
    );
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  async function save(input: ShipmentInput) {
    const err = validateShipmentInput(input);
    if (err) {
      toast.error("Check this shipment", err);
      return;
    }
    setBusy(true);
    try {
      const clean = cleanShipmentInput(input);
      if (editing) await updateShipment(editing.id, clean);
      else await addShipment(clean);
      toast.success(editing ? "Shipment updated" : "Shipment added");
      setFormOpen(false);
      setEditing(null);
    } catch (e) {
      toast.error("Couldn't save the shipment", toastableErrorMessage(e));
    }
    setBusy(false);
  }

  // Moves a shipment to its next stage and stamps today on that stage. Delivery needs the receiver, so that step opens the editor.
  async function advance(s: Shipment) {
    const next = nextStage(s.stage);
    if (!next) return;
    const input: ShipmentInput = { ...toInput(s), stage: next };
    const key = DATE_KEY[next];
    if (key) input[key] = today;
    if (next === "delivered") {
      setEditing(s);
      setFormOpen(true);
      toast.error("Enter who received it", "Delivery needs the receiver's name. Fill it in, then save.");
      return;
    }
    const err = validateShipmentInput(input);
    if (err) {
      toast.error("Couldn't move it on", err);
      return;
    }
    try {
      await updateShipment(s.id, cleanShipmentInput(input));
      toast.success(`Marked: ${stageLabel(next)}`);
    } catch (e) {
      toast.error("Couldn't update", toastableErrorMessage(e));
    }
  }

  async function remove(s: Shipment) {
    if (!window.confirm("Delete this shipment? This can't be undone.")) return;
    try {
      await deleteShipment(s.id);
      toast.success("Shipment deleted");
    } catch (e) {
      toast.error("Couldn't delete", toastableErrorMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Shipments"
        action={canWrite ? <Button onClick={openNew}>New shipment</Button> : undefined}
      />

      <Card className="mb-6">
        <div className="text-xs text-muted">
          Record each shipment by its waybill, airway bill, bill of lading or tracking number, and move it on as it reaches each stage. Delivery
          needs the name of who received it, which is your proof of delivery. Nothing is fetched from the carrier, and freight and customs costs
          stay on the purchase or expense.
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Stat label="On the way" value={String(summary.open)} />
        <Stat label="Overdue" value={String(summary.overdue)} tone={summary.overdue > 0 ? "bad" : "good"} sub="past their expected day" />
        <Stat label="Delivered, last 30 days" value={String(summary.deliveredLast30)} tone="good" />
        <Stat
          label="Average days to deliver"
          value={summary.avgDaysToDeliver === null ? "—" : String(summary.avgDaysToDeliver)}
          sub="from the day it left"
        />
      </div>

      {shipments.length === 0 ? (
        <EmptyState
          title="No shipments yet"
          body="Record a shipment when goods are booked, so you can see where it is, when it is due, and who signed for it."
          action={canWrite ? <Button onClick={openNew}>New shipment</Button> : undefined}
        />
      ) : (
        <>
          <div className="text-sm font-medium mb-2">On the way</div>
          {open.length === 0 ? (
            <div className="text-xs text-muted mb-6">Nothing is on the way.</div>
          ) : (
            <div className="space-y-2.5 mb-6">
              {open.map((s) => {
                const late = isOverdue(s, today);
                const next = nextStage(s.stage);
                const route = s.origin && s.destination ? `${s.origin} → ${s.destination}` : s.origin || s.destination || "";
                return (
                  <Card key={s.id} className="!p-3.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {s.reference}
                        {s.carrier ? ` · ${s.carrier}` : ""}
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {[s.supplierName, route].filter(Boolean).join(" · ")}
                      </div>
                      <div className={`text-xs mt-1 ${late ? "text-bad" : "text-muted"}`}>
                        {stageLabel(s.stage)}
                        {s.etaDate ? ` · expected ${s.etaDate}` : ""}
                        {late ? " · overdue" : ""}
                      </div>
                    </div>
                    {canWrite && (
                      <div className="flex flex-wrap gap-2 mt-2.5 pt-2.5 border-t border-line">
                        {next && (
                          <Button variant="ghost" className="text-xs" disabled={busy} onClick={() => advance(s)}>
                            Mark: {stageLabel(next)}
                          </Button>
                        )}
                        <Button variant="ghost" className="text-xs" onClick={() => { setEditing(s); setFormOpen(true); }}>
                          Edit
                        </Button>
                        {canDelete && (
                          <button onClick={() => remove(s)} className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]">
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {delivered.length > 0 && (
            <>
              <div className="text-sm font-medium mb-2">Recently delivered</div>
              <div className="space-y-2.5">
                {delivered.map((s) => (
                  <Card key={s.id} className="!p-3.5">
                    <div className="text-sm font-medium truncate">
                      {s.reference}
                      {s.supplierName ? ` · ${s.supplierName}` : ""}
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      Delivered {s.deliveredOn}
                      {s.receivedBy ? ` · received by ${s.receivedBy}` : ""}
                      {s.proofRef ? ` · proof ${s.proofRef}` : ""}
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <Modal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} title={editing ? "Edit shipment" : "New shipment"}>
        <ShipmentForm
          key={editing?.id ?? "new"}
          initial={editing ? toInput(editing) : undefined}
          busy={busy}
          onSave={save}
          onCancel={() => { setFormOpen(false); setEditing(null); }}
        />
      </Modal>
    </>
  );
}

function ShipmentForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial?: ShipmentInput;
  busy: boolean;
  onSave: (i: ShipmentInput) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<ShipmentInput>(initial ?? { reference: "", stage: "booked" });
  const reached = SHIPMENT_STAGES.findIndex((x) => x.value === v.stage);
  const stageAtOrAfter = (s: ShipmentStage) => SHIPMENT_STAGES.findIndex((x) => x.value === s) <= reached;

  function set<K extends keyof ShipmentInput>(k: K, val: ShipmentInput[K]) {
    setV((p) => ({ ...p, [k]: val }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave(v);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field>
        <Label>Reference (waybill, airway bill, bill of lading or tracking number)</Label>
        <Input required maxLength={MAX_SHIP_REF} value={v.reference} onChange={(e) => set("reference", e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Carrier (optional)</Label>
          <Input maxLength={MAX_SHIP_CARRIER} value={v.carrier ?? ""} onChange={(e) => set("carrier", e.target.value)} />
        </Field>
        <Field>
          <Label>Supplier (optional)</Label>
          <Input maxLength={MAX_SHIP_PLACE} value={v.supplierName ?? ""} onChange={(e) => set("supplierName", e.target.value)} />
        </Field>
        <Field>
          <Label>From</Label>
          <Input maxLength={MAX_SHIP_PLACE} value={v.origin ?? ""} onChange={(e) => set("origin", e.target.value)} />
        </Field>
        <Field>
          <Label>To</Label>
          <Input maxLength={MAX_SHIP_PLACE} value={v.destination ?? ""} onChange={(e) => set("destination", e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>Stage</Label>
        <Select value={v.stage} onChange={(e) => set("stage", e.target.value as ShipmentStage)}>
          {SHIPMENT_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {v.stage !== "delivered" && (
          <Field>
            <Label>Expected day</Label>
            <Input type="date" value={v.etaDate ?? ""} onChange={(e) => set("etaDate", e.target.value || undefined)} />
          </Field>
        )}
        {stageAtOrAfter("shipped") && (
          <Field>
            <Label>Day it left</Label>
            <Input type="date" value={v.shippedOn ?? ""} onChange={(e) => set("shippedOn", e.target.value || undefined)} />
          </Field>
        )}
        {stageAtOrAfter("arrived") && (
          <Field>
            <Label>Day it arrived</Label>
            <Input type="date" value={v.arrivedOn ?? ""} onChange={(e) => set("arrivedOn", e.target.value || undefined)} />
          </Field>
        )}
        {stageAtOrAfter("cleared") && (
          <Field>
            <Label>Day it cleared customs</Label>
            <Input type="date" value={v.clearedOn ?? ""} onChange={(e) => set("clearedOn", e.target.value || undefined)} />
          </Field>
        )}
        {stageAtOrAfter("delivered") && (
          <Field>
            <Label>Day it was delivered</Label>
            <Input type="date" value={v.deliveredOn ?? ""} onChange={(e) => set("deliveredOn", e.target.value || undefined)} />
          </Field>
        )}
      </div>
      {v.stage === "delivered" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <Label>Received by (proof of delivery)</Label>
            <Input maxLength={MAX_SHIP_PERSON} value={v.receivedBy ?? ""} onChange={(e) => set("receivedBy", e.target.value)} />
          </Field>
          <Field>
            <Label>Delivery note or signed waybill number (optional)</Label>
            <Input maxLength={MAX_SHIP_REF} value={v.proofRef ?? ""} onChange={(e) => set("proofRef", e.target.value)} />
          </Field>
        </div>
      )}
      <Field>
        <Label>Notes (optional)</Label>
        <Textarea maxLength={MAX_SHIP_NOTES} value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save shipment"}
        </Button>
      </div>
    </form>
  );
}
