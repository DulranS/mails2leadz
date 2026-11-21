"use client";

// Tabs: open orders for a table, bar seat or takeaway. Items go on as they are ordered; when the table pays, the tab is charged in
// one go and each item is written as an ordinary sale (with its sales tax), so stock, reports and the books treat it like any sale.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import { addToTab, changeTabQty, equalShares, MAX_SHARE_PEOPLE, tabTotal } from "@/lib/tabs";
import { KITCHEN_LABEL, lineKey, newTicket, nextKitchenStatus, partPaymentPlan, unsentLines } from "@/lib/tabKitchen";
import { kitchenTicketHtml } from "@/lib/kitchenPrint";
import { printJob } from "@/lib/thermalPrint";
import { billLines, kitchenTicketLines, renderTicket } from "@/lib/escpos";
import { tabBillHtml } from "@/lib/tabBill";
import type { PaymentMethod, TabLine } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Field, Input, Label, PageHeader, Select, TableCardSkeleton } from "@/components/ui";

const PAY: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "credit", label: "On credit" },
];

export default function TabsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "staff"]);
  const { role } = useAuth();
  const { tabs, products, catalog, settings, loading, addTab, updateTabLines, closeTab, deleteTab, setTabTickets, payTabPart } = useData();
  const toast = useToast();
  const money = (n: number) => formatMoney(n, settings.currency);
  const isStaff = role === "staff";
  const canDelete = can(role, "delete:records");

  // Items on the menu, and the service items a service charge can be recorded under. Staff work from the cost-free catalog.
  const menu = useMemo(
    () =>
      isStaff
        ? catalog.filter((c) => c.active && c.type !== "service").map((c) => ({ id: c.id, name: c.name, price: c.sellPrice ?? 0, taxRatePct: c.taxRatePct ?? null }))
        : products.filter((p) => p.active && p.type !== "service").map((p) => ({ id: p.id, name: p.name, price: p.defaultSellPrice ?? 0, taxRatePct: p.taxRatePct ?? null })),
    [isStaff, catalog, products]
  );
  const serviceItems = useMemo(
    () =>
      isStaff
        ? catalog.filter((c) => c.active && c.type === "service").map((c) => ({ id: c.id, name: c.name }))
        : products.filter((p) => p.active && p.type === "service").map((p) => ({ id: p.id, name: p.name })),
    [isStaff, catalog, products]
  );

  const [name, setName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [people, setPeople] = useState("1");
  const [customer, setCustomer] = useState("");
  const [svcPct, setSvcPct] = useState("");
  const [svcProductId, setSvcProductId] = useState("");
  const [busy, setBusy] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [pick, setPick] = useState<Record<string, number>>({});

  const openTabs = useMemo(() => tabs.filter((t) => t.status === "open"), [tabs]);
  const current = openTabs.find((t) => t.id === openId) ?? null;
  const total = current ? tabTotal(current.lines) : 0;

  if (guardLoading || !allowed) return null;
  if (loading) return <TableCardSkeleton />;

  async function openTable() {
    setBusy(true);
    try {
      const id = await addTab(name);
      setName("");
      setOpenId(id);
      toast.success("Tab opened");
    } catch (e) {
      toast.error("Couldn't open the tab", toastableErrorMessage(e));
    }
    setBusy(false);
  }

  async function saveLines(lines: TabLine[]) {
    if (!current) return;
    try {
      await updateTabLines(current.id, lines);
    } catch (e) {
      toast.error("Couldn't update the tab", toastableErrorMessage(e));
    }
  }

  function addItem(item: { id: string; name: string; price: number; taxRatePct: number | null }) {
    if (!current) return;
    saveLines(addToTab(current.lines, { productId: item.id, name: item.name, unitPrice: item.price, taxRatePct: item.taxRatePct }));
  }

  function change(line: TabLine, delta: number) {
    if (!current) return;
    saveLines(changeTabQty(current.lines, line.productId, line.unitPrice, delta));
  }

  async function sendToKitchen() {
    if (!current) return;
    const ticket = newTicket(unsentLines(current.lines, current.tickets), `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, Date.now());
    if (!ticket) {
      toast.info("Nothing new to send", "Everything on this tab has already gone to the kitchen.");
      return;
    }
    try {
      await setTabTickets(current.id, [...(current.tickets ?? []), ticket]);
      toast.success("Sent to the kitchen", `${ticket.items.reduce((s, i) => s + i.qty, 0)} items`);
    } catch (e) {
      toast.error("Couldn't send to the kitchen", toastableErrorMessage(e));
    }
  }

  async function moveTicket(ticketId: string) {
    if (!current) return;
    const next = (current.tickets ?? []).map((t) => (t.id === ticketId ? { ...t, status: nextKitchenStatus(t.status) } : t));
    try {
      await setTabTickets(current.id, next);
    } catch (e) {
      toast.error("Couldn't update the ticket", toastableErrorMessage(e));
    }
  }

  const pickPlan = current ? partPaymentPlan(current.lines, pick) : null;

  async function payPart() {
    if (!current || !pickPlan || pickPlan.error) return;
    if (!window.confirm(`Pay for these items on ${current.table}, ${money(tabTotal(pickPlan.paid))}? They are recorded as sales now.`)) return;
    setBusy(true);
    try {
      await payTabPart(current.id, pick, {
        date: todayIso(),
        paymentMethod: payMethod,
        customer: customer.trim() || undefined,
        serviceChargePct: Number(svcPct) || 0,
        serviceProductId: svcProductId || undefined,
      });
      toast.success(`Paid for part of ${current.table}`, money(tabTotal(pickPlan.paid)));
      setPick({});
    } catch (e) {
      toast.error("Couldn't take that payment", toastableErrorMessage(e));
    }
    setBusy(false);
  }

  async function printBill() {
    if (!current) return;
    const heading = settings.businessName?.trim() || "Bill";
    const doc = {
      heading,
      table: current.table,
      date: todayIso(),
      items: current.lines.map((l) => ({ qty: l.qty, name: l.name, unitPrice: l.unitPrice })),
      total,
      currency: settings.currency,
      footer: "Thank you",
    };
    const res = await printJob({ bytes: renderTicket(billLines(doc)), html: tabBillHtml(doc) });
    if (res.via === "printer") toast.success("Bill sent to the printer", current.table);
    else if (res.error) toast.error("Bill not sent to the printer", res.error);
  }

  async function charge() {
    if (!current) return;
    if (!window.confirm(`Close ${current.table} for ${money(total)}? Its items are recorded as sales now.`)) return;
    setBusy(true);
    try {
      await closeTab(current.id, {
        date: todayIso(),
        paymentMethod: payMethod,
        customer: customer.trim() || undefined,
        serviceChargePct: Number(svcPct) || 0,
        serviceProductId: svcProductId || undefined,
      });
      toast.success(`${current.table} closed`, money(total));
      setOpenId(null);
      setCustomer("");
      setSvcPct("");
      setSvcProductId("");
      setPayMethod("cash");
      setPeople("1");
    } catch (e) {
      toast.error("Couldn't close the tab", toastableErrorMessage(e));
    }
    setBusy(false);
  }

  async function removeTab() {
    if (!current) return;
    if (!window.confirm(`Delete the open tab for ${current.table}? Nothing has been sold on it.`)) return;
    try {
      await deleteTab(current.id);
      setOpenId(null);
      toast.success("Tab deleted");
    } catch (e) {
      toast.error("Couldn't delete the tab", toastableErrorMessage(e));
    }
  }

  return (
    <>
      <PageHeader title="Tabs" />
      <Card className="mb-4">
        <div className="text-sm font-medium mb-2">Open a table</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            openTable();
          }}
          className="flex flex-wrap gap-2"
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Table 4, Bar 2, Takeaway Ann" className="flex-1 min-w-[200px]" />
          <Button type="submit" disabled={busy || !name.trim()}>Open tab</Button>
        </form>
        <div className="text-xs text-muted mt-2">Add items as they are ordered. When the table pays, press Close and charge: each item is recorded as a sale with its tax.</div>
      </Card>

      {openTabs.length === 0 ? (
        <EmptyState title="No open tabs" body="Open one when a table sits down or an order starts. The bill is charged in one go when it is paid." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-4">
          {openTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setOpenId(t.id);
                setPayMethod("cash");
                setCustomer("");
              }}
              className={`text-left rounded-lg border p-3 min-h-[44px] ${t.id === openId ? "border-amber-soft" : "border-line"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium break-words">{t.table}</div>
                <Badge tone="amber">Open</Badge>
              </div>
              <div className="text-xs text-muted mt-1">
                {t.lines.reduce((s, l) => s + l.qty, 0)} items · opened {t.openedOn}
              </div>
              <div className="text-sm num mt-1">{money(tabTotal(t.lines))}</div>
            </button>
          ))}
        </div>
      )}

      {current && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="text-sm font-medium">{current.table}</div>
            <div className="text-sm num">{money(total)}</div>
          </div>

          <div className="text-xs font-medium text-muted mb-1">Add to the tab</div>
          {menu.length === 0 ? (
            <div className="text-xs text-muted mb-3">There are no items on the menu yet. Add them on the Items page.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {menu.map((m) => (
                <button key={m.id} type="button" onClick={() => addItem(m)} disabled={busy} className="rounded-lg border border-line p-2 text-left text-xs min-h-[44px] hover:border-amber-soft">
                  <div className="break-words">{m.name}</div>
                  <div className="text-muted num mt-0.5">{money(m.price)}</div>
                </button>
              ))}
            </div>
          )}

          <div className="text-xs font-medium text-muted mb-1">On the tab</div>
          {current.lines.length === 0 ? (
            <div className="text-xs text-muted mb-4">Nothing ordered yet.</div>
          ) : (
            <div className="divide-y divide-line mb-4">
              {current.lines.map((l) => (
                <div key={`${l.productId}-${l.unitPrice}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="text-sm break-words">{l.name}</div>
                    <div className="text-muted mt-0.5">{money(l.unitPrice)} each</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" className="text-xs min-h-[44px]" disabled={busy} onClick={() => change(l, -1)}>−</Button>
                    <span className="num w-6 text-center">{l.qty}</span>
                    <Button variant="ghost" className="text-xs min-h-[44px]" disabled={busy} onClick={() => change(l, 1)}>+</Button>
                    <span className="num w-24 text-right">{money(l.qty * l.unitPrice)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="text-xs font-medium text-muted">Kitchen</div>
            <Button variant="ghost" className="text-xs min-h-[44px]" disabled={busy || current.lines.length === 0} onClick={sendToKitchen}>
              Send new items to the kitchen
            </Button>
          </div>
          {(current.tickets ?? []).length === 0 ? (
            <div className="text-xs text-muted mb-4">Nothing sent to the kitchen yet.</div>
          ) : (
            <div className="space-y-2 mb-4">
              {(current.tickets ?? []).map((t) => (
                <div key={t.id} className="rounded-lg border border-line p-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={t.status === "ready" ? "good" : "amber"}>{KITCHEN_LABEL[t.status]}</Badge>
                      <span className="text-muted num">{new Date(t.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <Button
                      variant="ghost"
                      className="text-xs min-h-[44px]"
                      onClick={async () => {
                        const sentAt = new Date(t.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                        const res = await printJob({
                          bytes: renderTicket(kitchenTicketLines(current.table, sentAt, t.status, t.items)),
                          html: kitchenTicketHtml(current.table, t, sentAt),
                        });
                        if (res.via === "printer") toast.success("Sent to the kitchen printer", current.table);
                        else if (res.error) toast.error("Ticket not sent to the printer", res.error);
                      }}
                    >
                      Print
                    </Button>
                    {t.status !== "served" && (
                      <Button variant="ghost" className="text-xs min-h-[44px]" disabled={busy} onClick={() => moveTicket(t.id)}>
                        Mark {KITCHEN_LABEL[nextKitchenStatus(t.status)].toLowerCase()}
                      </Button>
                    )}
                  </div>
                  <div className="mt-1 break-words">{t.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</div>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 mb-4">
            <Field>
              <Label>How they pay</Label>
              <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                {PAY.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </Select>
              {payMethod === "credit" && (
                <div className="text-[11px] text-muted mt-1">
                  To split the bill equally, close it on credit under the table name, then record each share as it is paid on the Receivables page.
                </div>
              )}
            </Field>
            <Field>
              <Label>Split between how many people?</Label>
              <Input type="number" min="1" max="20" step="1" value={people} onChange={(e) => setPeople(e.target.value)} />
              {(() => {
                const n = Number(people);
                if (!(n > 1)) return <div className="text-[11px] text-muted mt-1">Leave at 1 for one bill.</div>;
                const shares = equalShares(total, n);
                if (!shares) return <div className="text-[11px] text-bad mt-1">Use a whole number from 1 to {MAX_SHARE_PEOPLE}.</div>;
                return (
                  <div className="text-[11px] text-muted mt-1">
                    Each share: {money(shares[0])}{shares.length > 1 && shares[shares.length - 1] !== shares[0] ? `, the last ${money(shares[shares.length - 1])}` : ""}. Close on credit under the table name, then record each share on Receivables as it is paid.
                  </div>
                );
              })()}
            </Field>
            <Field>
              <Label>Customer name {payMethod === "credit" ? "(needed for credit)" : "(optional)"}</Label>
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Name on the bill" />
            </Field>
            <Field>
              <Label>Service charge % (optional)</Label>
              <Input type="number" min="0" max="100" step="0.1" value={svcPct} onChange={(e) => setSvcPct(e.target.value)} placeholder="None" />
            </Field>
            {Number(svcPct) > 0 && (
              <Field>
                <Label>Service item it is recorded under</Label>
                <Select value={svcProductId} onChange={(e) => setSvcProductId(e.target.value)}>
                  <option value="">Choose one</option>
                  {serviceItems.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={charge} disabled={busy || current.lines.length === 0}>
              {busy ? "Closing…" : `Close and charge ${money(total)}`}
            </Button>
            <Button variant="ghost" onClick={printBill} disabled={busy || current.lines.length === 0}>
              Print bill
            </Button>
            <Button variant="ghost" onClick={() => setSplitOpen((v) => !v)} disabled={busy || current.lines.length === 0}>
              {splitOpen ? "Hide the split" : "Split the bill"}
            </Button>
            {canDelete && (
              <Button variant="danger" onClick={removeTab} disabled={busy}>Delete tab</Button>
            )}
          </div>

          {splitOpen && (
            <div className="mt-4 rounded-lg border border-line p-3">
              <div className="text-xs font-medium text-muted mb-2">Pay for some items, the rest stays open</div>
              <div className="divide-y divide-line mb-3">
                {current.lines.map((l) => (
                  <div key={lineKey(l)} className="flex items-center justify-between gap-2 py-2 text-xs">
                    <div className="min-w-0 break-words">
                      {l.name} <span className="text-muted">({l.qty} on the tab)</span>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      max={l.qty}
                      step="1"
                      className="w-20 text-right"
                      value={pick[lineKey(l)] ?? 0}
                      onChange={(e) => setPick((m) => ({ ...m, [lineKey(l)]: Number(e.target.value) }))}
                    />
                  </div>
                ))}
              </div>
              {pickPlan?.error ? (
                <div className="text-xs text-muted mb-2">{pickPlan.error}</div>
              ) : (
                pickPlan && (
                  <div className="text-xs num mb-2">
                    Paying {money(tabTotal(pickPlan.paid))} now · {pickPlan.remaining.length > 0 ? `${money(tabTotal(pickPlan.remaining))} stays on the tab` : "the tab closes"}
                  </div>
                )
              )}
              <Button onClick={payPart} disabled={busy || !!pickPlan?.error}>Pay for these items</Button>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
