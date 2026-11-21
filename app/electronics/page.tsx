"use client";

// Licences and permits (with expiry dates to watch), trade-ins taken in as part payment, and supplier price-protection claims.
// Owner and Manager only. Each record is a button press. Nothing here files with an authority, pays a supplier or posts a ledger entry.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { formatMoney, todayIso } from "@/lib/format";
import {
  MAX_NAME,
  MAX_NOTE,
  PRICE_DROP_STATUSES,
  PROJECT_STATUSES,
  TRADE_IN_CONDITIONS,
  projectBudgetOpen,
  TRADE_IN_STATUSES,
  licenceStatus,
  licencesToWatch,
  priceProtectionClaim,
  priceProtectionOpen,
  tradeInOwed,
  validateElectronics,
  type ElectronicsInput,
  type StoredElectronicsRecord,
} from "@/lib/electronicsRecords";
import { Badge, Button, Card, EmptyState, Field, Input, Label, PageHeader, Select, TableCardSkeleton, Textarea } from "@/components/ui";

type Kind = "licence" | "tradein" | "pricedrop" | "project";

const KIND_LABEL: Record<Kind, string> = {
  licence: "Licence or permit",
  tradein: "Trade-in",
  pricedrop: "Price protection",
  project: "R&D project",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  credited: "Credited",
  paid_out: "Paid out",
  resold: "Resold",
  claimed: "Claimed",
  idea: "Idea",
  prototype: "Prototype",
  testing: "Testing",
  certification: "Certification",
  launched: "Launched",
  dropped: "Dropped",
};

export default function ElectronicsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager"]);
  const { businessRecords, settings, loading, addElectronicsRecord, updateElectronicsStatus, deleteElectronicsRecord } = useData();
  const toast = useToast();
  const money = (n: number) => formatMoney(n, settings.currency);

  const [kind, setKind] = useState<Kind>("licence");
  const [busy, setBusy] = useState(false);
  // licence
  const [licName, setLicName] = useState("");
  const [authority, setAuthority] = useState("");
  const [number, setNumber] = useState("");
  const [issued, setIssued] = useState("");
  const [expiry, setExpiry] = useState("");
  const [licCost, setLicCost] = useState("");
  // trade-in
  const [customer, setCustomer] = useState("");
  const [device, setDevice] = useState("");
  const [serial, setSerial] = useState("");
  const [condition, setCondition] = useState<(typeof TRADE_IN_CONDITIONS)[number]>("good");
  const [credit, setCredit] = useState("");
  // price protection
  const [supplier, setSupplier] = useState("");
  const [product, setProduct] = useState("");
  const [oldPrice, setOldPrice] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [units, setUnits] = useState("");
  // shared
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  // project
  const [projName, setProjName] = useState("");
  const [projBudget, setProjBudget] = useState("");
  const [projTarget, setProjTarget] = useState("");

  const records = useMemo(() => [...businessRecords].sort((a, b) => b.createdAt - a.createdAt), [businessRecords]);
  const today = todayIso();
  const watch = useMemo(() => licencesToWatch(records, today), [records, today]);
  const owedTradeIns = useMemo(() => tradeInOwed(records), [records]);
  const openPriceProtection = useMemo(() => priceProtectionOpen(records), [records]);
  const openProjectBudget = useMemo(() => projectBudgetOpen(records), [records]);

  const previewClaim = kind === "pricedrop" ? priceProtectionClaim(Number(oldPrice), Number(newPrice), Number(units)) : 0;

  function buildInput(): ElectronicsInput {
    if (kind === "licence") {
      return {
        kind,
        name: licName.trim(),
        authority: authority.trim() || undefined,
        number: number.trim() || undefined,
        issuedDate: issued || undefined,
        expiryDate: expiry || undefined,
        cost: licCost === "" ? undefined : Number(licCost),
        note: note.trim() || undefined,
      };
    }
    if (kind === "project") {
      return {
        kind,
        name: projName.trim(),
        status: "idea",
        budget: projBudget === "" ? undefined : Number(projBudget),
        targetDate: projTarget || undefined,
        note: note.trim() || undefined,
      };
    }
    if (kind === "tradein") {
      return {
        kind,
        customer: customer.trim() || undefined,
        device: device.trim(),
        serialNo: serial.trim() || undefined,
        condition,
        agreedCredit: Number(credit),
        date,
        status: "open",
        note: note.trim() || undefined,
      };
    }
    return {
      kind,
      supplier: supplier.trim() || undefined,
      product: product.trim(),
      oldPrice: Number(oldPrice),
      newPrice: Number(newPrice),
      unitsOnHand: Number(units),
      date,
      status: "open",
      note: note.trim() || undefined,
    };
  }

  function clearForm() {
    setLicName(""); setAuthority(""); setNumber(""); setIssued(""); setExpiry(""); setLicCost("");
    setCustomer(""); setDevice(""); setSerial(""); setCredit("");
    setSupplier(""); setProduct(""); setOldPrice(""); setNewPrice(""); setUnits("");
    setProjName(""); setProjBudget(""); setProjTarget("");
    setNote("");
  }

  function recordLabel(i: ElectronicsInput): string {
    if (i.kind === "licence" || i.kind === "project") return i.name;
    if (i.kind === "tradein") return i.device;
    return i.product;
  }

  async function save() {
    const input = buildInput();
    const problem = validateElectronics(input);
    if (problem) {
      toast.error("Check this record", problem);
      return;
    }
    setBusy(true);
    try {
      await addElectronicsRecord(input);
      toast.success(KIND_LABEL[kind], recordLabel(input));
      clearForm();
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      await updateElectronicsStatus(id, status);
      toast.success("Status updated", STATUS_LABEL[status] ?? status);
    } catch (err) {
      toast.error("Couldn't update", toastableErrorMessage(err));
    }
  }

  async function remove(r: StoredElectronicsRecord) {
    if (!window.confirm("Delete this record? It cannot be undone.")) return;
    try {
      await deleteElectronicsRecord(r.id);
      toast.info("Record deleted");
    } catch (err) {
      toast.error("Couldn't delete", toastableErrorMessage(err));
    }
  }

  function describe(r: StoredElectronicsRecord): { title: string; detail: string } {
    if (r.kind === "licence") {
      const when = r.expiryDate ? `expires ${r.expiryDate}` : "no expiry date";
      return { title: r.name, detail: [r.authority, r.number && `No. ${r.number}`, when, r.cost ? money(r.cost) : null].filter(Boolean).join(" · ") };
    }
    if (r.kind === "tradein") {
      return { title: `Trade-in · ${r.device}`, detail: [r.customer, r.condition, `credit ${money(r.agreedCredit)}`, r.date].filter(Boolean).join(" · ") };
    }
    if (r.kind === "project") {
      return { title: `R&D · ${r.name}`, detail: [STATUS_LABEL[r.status] ?? r.status, r.budget !== undefined ? `budget ${money(r.budget)}` : null, r.targetDate ? `target ${r.targetDate}` : null].filter(Boolean).join(" · ") };
    }
    const claim = priceProtectionClaim(r.oldPrice, r.newPrice, r.unitsOnHand);
    return { title: `Price drop · ${r.product}`, detail: [r.supplier, `${money(r.oldPrice)} to ${money(r.newPrice)}`, `${r.unitsOnHand} held`, `claim ${money(claim)}`, r.date].filter(Boolean).join(" · ") };
  }

  if (guardLoading || !allowed) return null;
  if (loading) return <><PageHeader title="Licences & trade-ins" /><TableCardSkeleton rows={4} cols={4} /></>;

  return (
    <>
      <PageHeader title="Licences & trade-ins" />
      <div className="text-xs text-muted mb-4 max-w-2xl">
        Keep the licences and permits you need, with expiry dates, so renewals are not missed. Record trade-ins you take as part payment
        and price drops from a supplier whose stock you still hold. Each save is a button press. Nothing here files with an authority,
        pays a supplier or posts to the ledger; the amounts are a record for you to act on.
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <div className="text-xs text-muted">Licences to renew</div>
          <div className="text-xl font-semibold">{watch.length}</div>
          <div className="text-xs text-muted mt-1">{watch.length === 0 ? "Nothing expired or due within 60 days." : "Expired or due within 60 days, listed below."}</div>
        </Card>
        <Card>
          <div className="text-xs text-muted">Trade-in credit owed</div>
          <div className="text-xl font-semibold">{money(owedTradeIns)}</div>
          <div className="text-xs text-muted mt-1">Open trade-ins not yet credited or paid out.</div>
        </Card>
        <Card>
          <div className="text-xs text-muted">Price-protection claims open</div>
          <div className="text-xl font-semibold">{money(openPriceProtection)}</div>
          <div className="text-xs text-muted mt-1">Still to claim from suppliers.</div>
        </Card>
        <Card>
          <div className="text-xs text-muted">R&D budget still open</div>
          <div className="text-xl font-semibold">{money(openProjectBudget)}</div>
          <div className="text-xs text-muted mt-1">Projects not yet launched or dropped.</div>
        </Card>
      </div>

      {watch.length > 0 && (
        <Card className="mb-6">
          <div className="font-medium mb-2">Renewals to act on</div>
          <ul className="text-sm space-y-1">
            {watch.map(({ r, status }) => (
              <li key={r.id} className="flex items-center gap-2">
                <Badge tone={status === "expired" ? "bad" : "amber"}>{status === "expired" ? "Expired" : "Due soon"}</Badge>
                <span>{r.name}</span>
                <span className="text-muted">{r.expiryDate}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-6">
        <div className="flex flex-wrap gap-2 mb-4">
          {(["licence", "tradein", "pricedrop", "project"] as Kind[]).map((k) => (
            <Button key={k} variant={kind === k ? "primary" : "ghost"} onClick={() => setKind(k)}>
              {KIND_LABEL[k]}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {kind === "licence" && (
            <>
              <Field><Label>Licence or permit name</Label><Input maxLength={MAX_NAME} value={licName} onChange={(e) => setLicName(e.target.value)} placeholder="e.g. Electrical retailer licence" /></Field>
              <Field><Label>Issued by (optional)</Label><Input value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="Authority name" /></Field>
              <Field><Label>Number (optional)</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
              <Field><Label>Cost to renew (optional)</Label><Input type="number" min="0" step="any" value={licCost} onChange={(e) => setLicCost(e.target.value)} /></Field>
              <Field><Label>Issued on (optional)</Label><Input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} /></Field>
              <Field><Label>Expires on</Label><Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
            </>
          )}
          {kind === "tradein" && (
            <>
              <Field><Label>Device handed in</Label><Input maxLength={MAX_NAME} value={device} onChange={(e) => setDevice(e.target.value)} placeholder="e.g. iPhone 12 128GB" /></Field>
              <Field><Label>Customer (optional)</Label><Input value={customer} onChange={(e) => setCustomer(e.target.value)} /></Field>
              <Field><Label>Serial number (optional)</Label><Input value={serial} onChange={(e) => setSerial(e.target.value)} /></Field>
              <Field><Label>Condition</Label>
                <Select value={condition} onChange={(e) => setCondition(e.target.value as (typeof TRADE_IN_CONDITIONS)[number])}>
                  {TRADE_IN_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field><Label>Credit agreed ({settings.currency})</Label><Input type="number" min="0" step="any" value={credit} onChange={(e) => setCredit(e.target.value)} /></Field>
              <Field><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            </>
          )}
          {kind === "pricedrop" && (
            <>
              <Field><Label>Product whose price fell</Label><Input maxLength={MAX_NAME} value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. 55in 4K TV" /></Field>
              <Field><Label>Supplier (optional)</Label><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field>
              <Field><Label>Old price per unit</Label><Input type="number" min="0" step="any" value={oldPrice} onChange={(e) => setOldPrice(e.target.value)} /></Field>
              <Field><Label>New price per unit</Label><Input type="number" min="0" step="any" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} /></Field>
              <Field><Label>Units you still hold</Label><Input type="number" min="0" step="1" value={units} onChange={(e) => setUnits(e.target.value)} /></Field>
              <Field><Label>Date the supplier cut the price</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              {previewClaim > 0 && (
                <div className="md:col-span-2 text-sm">Claim to request from the supplier: <span className="font-semibold">{money(previewClaim)}</span></div>
              )}
            </>
          )}
          {kind === "project" && (
            <>
              <Field><Label>Product or project name</Label><Input maxLength={MAX_NAME} value={projName} onChange={(e) => setProjName(e.target.value)} placeholder="e.g. Wireless earbuds v2" /></Field>
              <Field><Label>Budget (optional)</Label><Input type="number" min="0" step="any" value={projBudget} onChange={(e) => setProjBudget(e.target.value)} /></Field>
              <Field><Label>Target launch date (optional)</Label><Input type="date" value={projTarget} onChange={(e) => setProjTarget(e.target.value)} /></Field>
              <div className="md:col-span-2 text-xs text-muted">A new project starts at Idea. Move it along its stages with the buttons in the list below.</div>
            </>
          )}
          <Field className="md:col-span-2"><Label>Note (optional)</Label><Textarea maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={save} disabled={busy}>Save {KIND_LABEL[kind].toLowerCase()}</Button>
        </div>
      </Card>

      {records.length === 0 ? (
        <EmptyState title="Nothing recorded yet" body="Add the licences you hold, trade-ins you take in, and price drops you want to claim. They will be listed here." />
      ) : (
        <Card>
          <div className="font-medium mb-3">Records</div>
          <ul className="divide-y divide-line">
            {records.map((r) => {
              const { title, detail } = describe(r);
              const st = r.kind === "licence" ? licenceStatus(r.expiryDate, today) : null;
              return (
                <li key={r.id} className="py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[12rem]">
                    <div className="font-medium">{title}</div>
                    <div className="text-xs text-muted">{detail}</div>
                    {r.note && <div className="text-xs text-muted mt-1">{r.note}</div>}
                  </div>
                  {st && <Badge tone={st === "expired" ? "bad" : st === "expiring" ? "amber" : st === "ok" ? "good" : "default"}>{st === "none" ? "No expiry" : st === "expired" ? "Expired" : st === "expiring" ? "Due soon" : "Valid"}</Badge>}
                  {r.kind === "tradein" && (
                    <div className="flex gap-1">
                      {TRADE_IN_STATUSES.map((s) => (
                        <Button key={s} variant={r.status === s ? "primary" : "ghost"} onClick={() => setStatus(r.id, s)}>{STATUS_LABEL[s]}</Button>
                      ))}
                    </div>
                  )}
                  {r.kind === "project" && (
                    <div className="flex flex-wrap gap-1">
                      {PROJECT_STATUSES.map((s) => (
                        <Button key={s} variant={r.status === s ? "primary" : "ghost"} onClick={() => setStatus(r.id, s)}>{STATUS_LABEL[s]}</Button>
                      ))}
                    </div>
                  )}
                  {r.kind === "pricedrop" && (
                    <div className="flex gap-1">
                      {PRICE_DROP_STATUSES.map((s) => (
                        <Button key={s} variant={r.status === s ? "primary" : "ghost"} onClick={() => setStatus(r.id, s)}>{STATUS_LABEL[s]}</Button>
                      ))}
                    </div>
                  )}
                  <Button variant="danger" onClick={() => remove(r)}>Delete</Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
