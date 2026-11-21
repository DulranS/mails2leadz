"use client";

// Jobs (work orders): what the front desk and the workshop open, price, track and hand back. A job's labour and parts become an
// estimate with one button, and the estimate then follows the usual path to a sale. Every change is a button press.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import { escapeHtml, openPrintWindow } from "@/lib/print";
import {
  jobBoard,
  isOverdue,
  labourTotal,
  NEXT_STATUSES,
  partsTotal,
  STATUS_LABEL,
  validateWorkOrder,
  workOrderTotal,
  MAX_ITEM_LENGTH,
  MAX_PROBLEM_LENGTH,
  type WorkOrder,
  type WorkOrderLine,
  type WorkOrderStatus,
} from "@/lib/workOrders";
import { Badge, Button, Card, EmptyState, Field, Input, Label, PageHeader, Select, Stat, TableCardSkeleton, Textarea } from "@/components/ui";

const FILTERS: { key: "active" | "all" | WorkOrderStatus; label: string }[] = [
  { key: "active", label: "Open" },
  { key: "ready", label: "Ready to collect" },
  { key: "waiting_parts", label: "Waiting for parts" },
  { key: "all", label: "All" },
];

function jobCardHtml(o: WorkOrder, currency: string, business: string): string {
  const money = (n: number) => `${currency} ${n.toFixed(2)}`;
  const rows = o.lines
    .map((l) => `<tr><td>${escapeHtml(l.kind === "labour" ? "Labour" : "Part")}</td><td>${escapeHtml(l.name)}</td><td class="r">${escapeHtml(String(l.qty))}</td><td class="r">${escapeHtml(money(l.qty * l.unitPrice))}</td></tr>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(o.number)}</title>
<style>
body{font-family:Arial,sans-serif;margin:24px;color:#000;max-width:720px}
h1{font-size:22px;margin:0 0 4px} .meta{font-size:13px;margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
td,th{padding:6px 4px;border-bottom:1px solid #ccc;text-align:left} td.r,th.r{text-align:right}
.total{font-weight:bold;font-size:15px} .box{border:1px solid #999;padding:8px;margin-top:10px;font-size:13px;min-height:40px}
</style></head><body>
<h1>${escapeHtml(business)} · Job card ${escapeHtml(o.number)}</h1>
<div class="meta">Opened ${escapeHtml(o.openedDate)}${o.dueDate ? ` · Due ${escapeHtml(o.dueDate)}` : ""} · Status: ${escapeHtml(STATUS_LABEL[o.status])}</div>
<div class="meta"><b>Customer:</b> ${escapeHtml(o.customer ?? "—")}${o.customerContact ? ` · ${escapeHtml(o.customerContact)}` : ""}</div>
<div class="meta"><b>Item:</b> ${escapeHtml(o.item)}</div>
${o.problem ? `<div class="box"><b>Problem:</b> ${escapeHtml(o.problem)}</div>` : ""}
<table><thead><tr><th>Type</th><th>Description</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<table><tr><td class="total">Total</td><td class="r total">${escapeHtml(money(workOrderTotal(o.lines)))}</td></tr></table>
${o.notes ? `<div class="box"><b>Notes:</b> ${escapeHtml(o.notes)}</div>` : ""}
<div style="margin-top:28px;font-size:12px">Customer signature: ____________________ &nbsp; Collected by: ____________________</div>
</body></html>`;
}

export default function JobsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "staff"]);
  const { role } = useAuth();
  const { workOrders, products, settings, loading, addWorkOrder, updateWorkOrder, makeEstimateFromWorkOrder, deleteWorkOrder } = useData();
  const toast = useToast();
  const money = (n: number) => formatMoney(n, settings.currency);
  const today = todayIso();
  const canDelete = can(role, "delete:records");

  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("active");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  // new job form
  const [customer, setCustomer] = useState("");
  const [contact, setContact] = useState("");
  const [item, setItem] = useState("");
  const [problem, setProblem] = useState("");
  const [openedDate, setOpenedDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<WorkOrderLine[]>([]);
  const [pickKind, setPickKind] = useState<"labour" | "part">("labour");
  const [pickId, setPickId] = useState("");
  const [pickQty, setPickQty] = useState("1");

  const services = useMemo(() => products.filter((p) => p.type === "service"), [products]);
  const parts = useMemo(() => products.filter((p) => p.type !== "service"), [products]);
  const board = useMemo(() => jobBoard(workOrders, today), [workOrders, today]);
  const shown = useMemo(() => {
    const list = filter === "all" ? workOrders : filter === "active" ? workOrders.filter((o) => o.status !== "collected" && o.status !== "cancelled") : workOrders.filter((o) => o.status === filter);
    return [...list].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || b.createdAt - a.createdAt);
  }, [workOrders, filter]);

  if (guardLoading || !allowed) return null;
  if (loading) return <><PageHeader title="Jobs" /><TableCardSkeleton rows={4} cols={4} /></>;

  function addLine() {
    const pool = pickKind === "labour" ? services : parts;
    const p = pool.find((x) => x.id === pickId);
    const qty = Number(pickQty);
    if (!p) {
      toast.error("Choose an item to add");
      return;
    }
    if (!(qty > 0)) {
      toast.error("Enter a quantity above zero");
      return;
    }
    setLines((prev) => [...prev, { kind: pickKind, productId: p.id, name: p.name, qty, unitPrice: p.defaultSellPrice ?? 0 }]);
    setPickId("");
    setPickQty("1");
  }

  function resetForm() {
    setCustomer("");
    setContact("");
    setItem("");
    setProblem("");
    setDueDate("");
    setNotes("");
    setLines([]);
    setOpenedDate(todayIso());
  }

  async function saveJob() {
    const input = {
      customer: customer.trim() || undefined,
      customerContact: contact.trim() || undefined,
      item: item.trim(),
      problem: problem.trim() || undefined,
      openedDate,
      dueDate: dueDate || undefined,
      notes: notes.trim() || undefined,
      lines,
    };
    const problemText = validateWorkOrder(input);
    if (problemText) {
      toast.error("Check the job", problemText);
      return;
    }
    setBusy(true);
    try {
      await addWorkOrder(input);
      toast.success("Job opened", item.trim());
      resetForm();
      setAdding(false);
    } catch (err) {
      toast.error("Couldn't open the job", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function move(o: WorkOrder, status: WorkOrderStatus) {
    try {
      await updateWorkOrder(o.id, { status });
      toast.success(STATUS_LABEL[status], o.number);
    } catch (err) {
      toast.error("Couldn't update the job", toastableErrorMessage(err));
    }
  }

  async function estimate(o: WorkOrder) {
    if (!window.confirm(`Make an estimate from ${o.number} for ${money(workOrderTotal(o.lines))}? You can still send and accept it from Estimates.`)) return;
    try {
      await makeEstimateFromWorkOrder(o.id);
      toast.success("Estimate made", `From ${o.number}. Find it on Estimates.`);
    } catch (err) {
      toast.error("Couldn't make the estimate", toastableErrorMessage(err));
    }
  }

  function printCard(o: WorkOrder) {
    const ok = openPrintWindow(jobCardHtml(o, settings.currency, settings.businessName?.trim() || "Job card"));
    if (!ok) toast.error("Couldn't open the job card", "Allow pop-ups for this site, then press Print again.");
  }

  async function remove(o: WorkOrder) {
    if (!window.confirm(`Delete ${o.number} (${o.item})? This cannot be undone.`)) return;
    try {
      await deleteWorkOrder(o.id);
      setOpenId(null);
      toast.info("Job deleted", o.number);
    } catch (err) {
      toast.error("Couldn't delete", toastableErrorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Jobs"
        action={<Button onClick={() => setAdding((v) => !v)}>{adding ? "Close" : "+ Open a job"}</Button>}
      />
      <div className="text-xs text-muted mb-4 max-w-2xl">
        Repairs, trade and made-to-order work. Open a job, add the labour and parts, move it along, print the job card, and make an
        estimate when the customer agrees. Each change is a button press.
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <Stat label="Open" value={String(board.open)} />
        <Stat label="Overdue" value={String(board.overdue)} />
        <Stat label="Ready to collect" value={String(board.readyToCollect)} />
        <Stat label="Waiting for parts" value={String(board.waitingParts)} />
        <Stat label="Open value" value={money(board.openValue)} />
      </div>

      {adding && (
        <Card className="mb-4 max-w-3xl">
          <div className="text-sm font-medium mb-3">New job</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field><Label>Customer (optional)</Label><Input value={customer} onChange={(e) => setCustomer(e.target.value)} /></Field>
            <Field><Label>Contact (optional)</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone or email" /></Field>
            <Field><Label>Item or job</Label><Input value={item} onChange={(e) => setItem(e.target.value)} maxLength={MAX_ITEM_LENGTH} placeholder="e.g. Samsung A12, Toyota Axio, sofa reupholstery" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field><Label>Opened</Label><Input type="date" max={todayIso()} value={openedDate} onChange={(e) => setOpenedDate(e.target.value)} /></Field>
              <Field><Label>Due (optional)</Label><Input type="date" min={openedDate} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
            </div>
          </div>
          <Field className="mt-3">
            <Label>What is wrong or wanted (optional)</Label>
            <Textarea value={problem} onChange={(e) => setProblem(e.target.value)} maxLength={MAX_PROBLEM_LENGTH} rows={2} />
          </Field>

          <div className="mt-4 text-sm font-medium">Labour and parts</div>
          {lines.length > 0 && (
            <ul className="mt-2 divide-y divide-line text-sm">
              {lines.map((l, i) => (
                <li key={i} className="py-2 flex items-center justify-between gap-2">
                  <span className="min-w-0">{l.kind === "labour" ? "Labour" : "Part"} · {l.name} · {l.qty} × {money(l.unitPrice)}</span>
                  <div className="flex items-center gap-2">
                    <span className="num">{money(l.qty * l.unitPrice)}</span>
                    <Button variant="ghost" className="text-xs min-h-[44px]" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>Remove</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3 items-end">
            <Field>
              <Label>Add</Label>
              <Select value={pickKind} onChange={(e) => { setPickKind(e.target.value as "labour" | "part"); setPickId(""); }}>
                <option value="labour">Labour (a service)</option>
                <option value="part">Part (a product)</option>
              </Select>
            </Field>
            <Field className="sm:col-span-2">
              <Label>{pickKind === "labour" ? "Service" : "Part"}</Label>
              <Select value={pickId} onChange={(e) => setPickId(e.target.value)}>
                <option value="">Choose one</option>
                {(pickKind === "labour" ? services : parts).map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </Select>
            </Field>
            <Field>
              <Label>Quantity</Label>
              <div className="flex gap-2">
                <Input type="number" min="0" step="any" value={pickQty} onChange={(e) => setPickQty(e.target.value)} />
                <Button variant="ghost" onClick={addLine}>Add</Button>
              </div>
            </Field>
          </div>
          {services.length === 0 && pickKind === "labour" && (
            <div className="text-[11px] text-muted mt-2">Add a service on Products first (type: service), then it can be used as labour.</div>
          )}

          <Field className="mt-4">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={saveJob} disabled={busy}>{busy ? "Saving…" : "Open job"}</Button>
            <span className="text-xs text-muted num">
              Labour {money(labourTotal(lines))} · Parts {money(partsTotal(lines))} · Total {money(workOrderTotal(lines))}
            </span>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        {FILTERS.map((f) => (
          <Button key={f.key} variant={filter === f.key ? "primary" : "ghost"} className="text-xs min-h-[44px]" onClick={() => setFilter(f.key)}>
            {f.label}
          </Button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No jobs here" body="Open a job when work comes in. It will show here until it is collected." />
      ) : (
        <div className="grid gap-3 max-w-3xl">
          {shown.map((o) => {
            const late = isOverdue(o, today);
            const open = openId === o.id;
            return (
              <Card key={o.id} className={late ? "border-l-4 border-bad" : ""}>
                <button className="w-full text-left min-h-[44px]" onClick={() => setOpenId(open ? null : o.id)}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{o.number} · {o.item}</div>
                      <div className="text-[11px] text-muted">
                        {o.customer || "Walk-in"}{o.dueDate ? ` · due ${formatDate(o.dueDate)}` : ""}{late ? " · overdue" : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={o.status === "ready" ? "good" : late ? "bad" : "amber"}>{STATUS_LABEL[o.status]}</Badge>
                      <span className="num text-sm">{money(workOrderTotal(o.lines))}</span>
                    </div>
                  </div>
                </button>

                {open && (
                  <div className="mt-3 border-t border-line pt-3 text-sm">
                    {o.problem && <div className="mb-2"><span className="text-muted">Problem: </span>{o.problem}</div>}
                    {o.customerContact && <div className="mb-2"><span className="text-muted">Contact: </span>{o.customerContact}</div>}
                    {o.lines.length > 0 ? (
                      <ul className="divide-y divide-line">
                        {o.lines.map((l, i) => (
                          <li key={i} className="py-1.5 flex justify-between gap-2">
                            <span>{l.kind === "labour" ? "Labour" : "Part"} · {l.name} · {l.qty} × {money(l.unitPrice)}</span>
                            <span className="num">{money(l.qty * l.unitPrice)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-muted text-xs">No labour or parts added yet.</div>
                    )}
                    <div className="mt-2 text-xs text-muted num">Labour {money(labourTotal(o.lines))} · Parts {money(partsTotal(o.lines))}</div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {can(role, "manage:sales") || can(role, "create:sale") ? NEXT_STATUSES[o.status].map((s) => (
                        <Button key={s} variant={s === "cancelled" ? "danger" : "ghost"} className="text-xs min-h-[44px]" onClick={() => move(o, s)}>
                          {s === "cancelled" ? "Cancel job" : `Mark ${STATUS_LABEL[s].toLowerCase()}`}
                        </Button>
                      )) : null}
                      <Button variant="ghost" className="text-xs min-h-[44px]" onClick={() => printCard(o)}>Print job card</Button>
                      {o.estimateId ? (
                        <Badge tone="good">Estimate made</Badge>
                      ) : o.status !== "cancelled" && o.lines.length > 0 ? (
                        <Button className="text-xs min-h-[44px]" onClick={() => estimate(o)}>Make estimate</Button>
                      ) : null}
                      {canDelete && <Button variant="danger" className="text-xs min-h-[44px]" onClick={() => remove(o)}>Delete</Button>}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
