"use client";

// Gift cards: sell a card with a code, look one up, use it on any open invoice, or refund what is left on it in cash.
// The money is held as a liability until a card is used, so it is not income until then (lib/giftCards.ts). Owner and Manager
// can do all of it. Staff can only sell a card at the counter: balances and history are not visible to them, so those parts are hidden.
import { useMemo, useState, type FormEvent } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { formatMoney, todayIso } from "@/lib/format";
import { escapeHtml, openPrintWindow } from "@/lib/print";
import {
  findGiftCard, giftCardLiability, giftCardName, listGiftCards, newGiftCardCode, normalizeGiftCardCode,
  validateGiftCardSale, validateGiftCardUse, type GiftCardMethod,
} from "@/lib/giftCards";
import { Badge, Button, Card, EmptyState, Field, Input, Label, PageHeader, Select, Stat, TableCardSkeleton } from "@/components/ui";

const METHOD_LABEL: Record<GiftCardMethod, string> = { cash: "Cash", card: "Card", bank_transfer: "Bank transfer" };
const KIND_LABEL = { received: "Sold", applied: "Used on an invoice", refunded: "Refunded in cash" } as const;

export default function GiftCardsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "staff"]);
  const { role } = useAuth();
  const isStaff = role === "staff";
  const { customerDeposits, receivablesAging, settings, addCustomerDeposit, loading } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const money = (n: number) => formatMoney(n, currency);
  const today = todayIso();

  // Sell
  const [value, setValue] = useState("");
  const [buyer, setBuyer] = useState("");
  const [method, setMethod] = useState<GiftCardMethod>("cash");
  const [soldOn, setSoldOn] = useState(today);
  const [issued, setIssued] = useState<{ code: string; amount: number; buyer: string } | null>(null);
  // Look up and use
  const [codeInput, setCodeInput] = useState("");
  const [found, setFound] = useState<string | null>(null);
  const [saleId, setSaleId] = useState("");
  const [useAmount, setUseAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<GiftCardMethod>("cash");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => listGiftCards(customerDeposits, today), [customerDeposits, today]);
  const liability = useMemo(() => giftCardLiability(customerDeposits, today), [customerDeposits, today]);
  const card = useMemo(() => (found ? findGiftCard(customerDeposits, found, today) : null), [found, customerDeposits, today]);
  // Every open invoice line, for any customer: a gift card is a bearer card.
  const openItems = useMemo(
    () =>
      receivablesAging.lines.flatMap((l) =>
        l.items
          .filter((i) => i.amountOutstanding > 0.005)
          .map((i) => ({ saleId: i.saleId, label: `${l.customer || "No name"} · ${i.productName} · ${i.qty} × ${money(i.unitPrice)}`, outstanding: i.amountOutstanding }))
      ),
    [receivablesAging, currency] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const chosen = openItems.find((o) => o.saleId === saleId) ?? null;

  if (guardLoading || !allowed) return null;
  if (loading) return <TableCardSkeleton />;

  async function sell(e: FormEvent) {
    e.preventDefault();
    const amount = Number(value);
    const problem = validateGiftCardSale({ amount, date: soldOn, today, method });
    if (problem) return toast.error("Couldn't sell the card", problem);
    setBusy(true);
    try {
      const taken = new Set(customerDeposits.map((c) => c.giftCardCode).filter((c): c is string => !!c));
      const code = newGiftCardCode(taken);
      await addCustomerDeposit({
        customer: giftCardName(code),
        kind: "received",
        amount,
        date: soldOn,
        method,
        giftCardCode: code,
        notes: buyer.trim() ? `Bought by ${buyer.trim()}` : undefined,
      });
      setIssued({ code, amount, buyer: buyer.trim() });
      setValue("");
      setBuyer("");
      toast.success(`Gift card ${code} sold`);
    } catch (err) {
      toast.error("Couldn't sell the card", toastableErrorMessage(err));
    }
    setBusy(false);
  }

  function lookUp(raw: string) {
    const code = normalizeGiftCardCode(raw);
    if (!code) return toast.error("That is not a gift card code", "Codes look like ABCD-2345.");
    if (!findGiftCard(customerDeposits, code, today)) return toast.error("No gift card with that code", "Check the code and try again.");
    setFound(code);
    setCodeInput(code);
    setSaleId("");
    setUseAmount("");
  }

  function pickInvoice(id: string) {
    setSaleId(id);
    const o = openItems.find((x) => x.saleId === id);
    const balance = card?.balance ?? 0;
    setUseAmount(o ? String(Math.min(balance, o.outstanding).toFixed(2)) : "");
  }

  async function useCard(e: FormEvent) {
    e.preventDefault();
    if (!card || !chosen) return;
    const amount = Number(useAmount);
    const problem = validateGiftCardUse({ balance: card.balance, amount, outstanding: chosen.outstanding });
    if (problem) return toast.error("Couldn't use the card", problem);
    setBusy(true);
    try {
      await addCustomerDeposit({ customer: card.name, kind: "applied", amount, date: today, saleId: chosen.saleId });
      toast.success(`${money(amount)} taken off card ${card.code}`);
      setSaleId("");
      setUseAmount("");
    } catch (err) {
      toast.error("Couldn't use the card", toastableErrorMessage(err));
    }
    setBusy(false);
  }

  async function refundBalance() {
    if (!card || card.balance <= 0) return;
    if (!window.confirm(`Refund ${money(card.balance)} left on card ${card.code} in cash? The card will be used up.`)) return;
    setBusy(true);
    try {
      await addCustomerDeposit({ customer: card.name, kind: "refunded", amount: card.balance, date: today, method: refundMethod });
      toast.success(`Refunded ${money(card.balance)} from card ${card.code}`);
    } catch (err) {
      toast.error("Couldn't refund the card", toastableErrorMessage(err));
    }
    setBusy(false);
  }

  function printVoucher(code: string, amount: number, who: string) {
    const biz = settings.businessName ? escapeHtml(settings.businessName) : "Gift card";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Gift card ${escapeHtml(code)}</title>
<style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;padding:40px}
.card{border:3px solid #222;border-radius:14px;padding:32px;width:420px;text-align:center}
.biz{font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#555}
.val{font-size:44px;font-weight:700;margin:18px 0}.code{font-size:26px;letter-spacing:4px;font-family:monospace;margin:10px 0}
.small{font-size:12px;color:#555;margin-top:18px}</style></head><body><div class="card">
<div class="biz">${biz}</div><div class="val">${escapeHtml(amount.toFixed(2))} ${escapeHtml(currency)}</div>
<div>Gift card code</div><div class="code">${escapeHtml(code)}</div>
${who ? `<div class="small">For: ${escapeHtml(who)}</div>` : ""}
<div class="small">Present this code to use the value. Keep it safe: whoever has the code can spend the balance.</div>
</div><script>window.onload=function(){window.print();}</script></body></html>`;
    if (!openPrintWindow(html, { waitForLoad: true })) toast.error("Couldn't open the voucher", "Allow pop-ups for this site and try again.");
  }

  return (
    <>
      <PageHeader
        title="Gift cards"
        action={
          <Button variant="ghost" onClick={() => document.getElementById("sell-card")?.scrollIntoView({ behavior: "smooth" })}>
            Sell a card
          </Button>
        }
      />
      {!isStaff && (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        {!isStaff && (
          <>
            <Stat label="Cards still in use" value={String(liability.cardsInUse)} />
            <Stat label="Owed to card holders" value={money(liability.total)} sub="a liability until the cards are used" tone={liability.total > 0 ? "amber" : "default"} />
            <Stat label="Cards issued" value={String(rows.length)} />
          </>
        )}
      </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="sell-card" className="scroll-mt-4">
          <div className="text-sm font-medium mb-3">Sell a gift card</div>
          {issued ? (
            <div className="space-y-3">
              <div className="text-xs text-muted">Hand this to the buyer. The card is ready to use now.</div>
              <div className="rounded-lg border border-line p-4 text-center">
                <div className="text-xs text-muted">Code</div>
                <div className="text-2xl font-mono tracking-widest mt-1">{issued.code}</div>
                <div className="text-sm mt-2">{money(issued.amount)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => printVoucher(issued.code, issued.amount, issued.buyer)}>Print voucher</Button>
                <Button variant="ghost" onClick={() => setIssued(null)}>Sell another</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={sell} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <Label>Value</Label>
                  <Input type="number" min="0" step="0.01" required value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Amount in ${currency}`} />
                </Field>
                <Field>
                  <Label>How they paid</Label>
                  <Select value={method} onChange={(e) => setMethod(e.target.value as GiftCardMethod)}>
                    {(Object.keys(METHOD_LABEL) as GiftCardMethod[]).map((m) => (
                      <option key={m} value={m}>{METHOD_LABEL[m]}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <Label>Bought by (optional)</Label>
                  <Input value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Name, for your records" />
                </Field>
                <Field>
                  <Label>Date sold</Label>
                  <Input type="date" max={today} value={soldOn} onChange={(e) => setSoldOn(e.target.value)} />
                </Field>
              </div>
              <Button type="submit" disabled={busy}>{busy ? "Selling…" : "Sell card"}</Button>
            </form>
          )}
        </Card>

        {!isStaff && (
        <Card>
          <div className="text-sm font-medium mb-3">Find a card</div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              lookUp(codeInput);
            }}
            className="flex gap-2 mb-3"
          >
            <Input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="Code, e.g. ABCD-2345" className="font-mono" />
            <Button type="submit" variant="ghost">Find</Button>
          </form>
          {!card ? (
            <div className="text-xs text-muted">Type or scan the code the customer gives you to see what is left on it and use it.</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Left on the card" value={money(card.balance)} tone={card.balance > 0 ? "good" : "default"} />
                <Stat label="Sold for" value={money(card.soldAmount)} sub={`${card.issuedDate}${card.buyer ? ` · ${card.buyer}` : ""}`} />
              </div>
              {card.balance > 0.005 ? (
                <form onSubmit={useCard} className="space-y-3 rounded-lg border border-line p-3">
                  <div className="text-xs font-medium">Use it on an open invoice</div>
                  {openItems.length === 0 ? (
                    <div className="text-xs text-muted">Nothing is owed right now. Record a sale on credit first, then use the card on it.</div>
                  ) : (
                    <>
                      <Field>
                        <Label>Invoice</Label>
                        <Select required value={saleId} onChange={(e) => pickInvoice(e.target.value)}>
                          <option value="">Choose one</option>
                          {openItems.map((o) => (
                            <option key={o.saleId} value={o.saleId}>{`${o.label} · ${money(o.outstanding)} owed`}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field>
                        <Label>Amount to take off the card</Label>
                        <Input type="number" min="0" step="0.01" required value={useAmount} onChange={(e) => setUseAmount(e.target.value)} />
                      </Field>
                      <Button type="submit" disabled={busy || !chosen}>{busy ? "Applying…" : "Use card on this invoice"}</Button>
                    </>
                  )}
                </form>
              ) : (
                <Badge tone="default">Used up</Badge>
              )}
              {card.balance > 0.005 && (
                <div className="space-y-2 rounded-lg border border-line p-3">
                  <div className="text-xs font-medium">Or give the balance back in cash</div>
                  <div className="flex flex-wrap gap-2">
                    <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as GiftCardMethod)} className="w-auto">
                      {(Object.keys(METHOD_LABEL) as GiftCardMethod[]).map((m) => (
                        <option key={m} value={m}>{METHOD_LABEL[m]}</option>
                      ))}
                    </Select>
                    <Button variant="ghost" disabled={busy} onClick={refundBalance}>Refund {money(card.balance)}</Button>
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs font-medium mb-1">History</div>
                <div className="space-y-1 text-xs">
                  {card.history.map((h) => (
                    <div key={h.id} className="flex justify-between gap-2">
                      <span className="text-muted">{h.date} · {KIND_LABEL[h.kind]}</span>
                      <span>{money(h.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>
        )}
      </div>

      {!isStaff && (
      <Card className="mt-4">
        <div className="text-sm font-medium mb-3">All gift cards</div>
        {rows.length === 0 ? (
          <EmptyState title="No gift cards yet" body="Sell one above and it will be listed here with what is left on it." />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((r) => (
              <div key={r.code} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                <div className="min-w-0">
                  <div className="font-mono text-sm">{r.code}</div>
                  <div className="text-muted mt-0.5">
                    Sold {r.issuedDate} for {money(r.soldAmount)}{r.buyer ? ` · bought by ${r.buyer}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {r.balance > 0.005 ? <span className="text-sm">{money(r.balance)} left</span> : <Badge tone="default">Used up</Badge>}
                  <Button variant="ghost" className="text-xs" onClick={() => lookUp(r.code)}>Open</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      )}
    </>
  );
}
