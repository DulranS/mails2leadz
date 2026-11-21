"use client";

// Consignment: goods left with a partner who sells them and pays a share back. Owner and Manager record; Accountant reads.
// Each record is a button press. The page shows, per partner, what is with them, what they reported selling, and what is owed.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import {
  MAX_CONSIGNMENT_NOTE,
  MAX_PARTNER_NAME,
  onConsignmentQty,
  summarizeConsignments,
  validateConsignment,
  type ConsignmentEntry,
  type ConsignmentKind,
} from "@/lib/consignment";
import { Button, Card, EmptyState, Field, Input, Label, PageHeader, Select, TableCardSkeleton, Textarea } from "@/components/ui";

const KIND_LABEL: Record<ConsignmentKind, string> = {
  placed: "Goods left with partner",
  sold: "Partner sales report",
  returned: "Goods came back",
  settled: "Paid the partner",
};

export default function ConsignmentPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { role } = useAuth();
  const { consignments, settings, loading, addConsignmentEntry, deleteConsignmentEntry } = useData();
  const toast = useToast();
  const money = (n: number) => formatMoney(n, settings.currency);
  const canWrite = can(role, "manage:products");
  const canDelete = can(role, "delete:records");

  const [kind, setKind] = useState<ConsignmentKind>("placed");
  const [partner, setPartner] = useState("");
  const [date, setDate] = useState(todayIso());
  const [productName, setProductName] = useState("");
  const [qty, setQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [share, setShare] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => summarizeConsignments(consignments), [consignments]);
  const recent = useMemo(() => [...consignments].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 30), [consignments]);
  const partners = rows.map((r) => r.partner);

  function buildInput() {
    const base = { kind, partner: partner.trim(), date, note: note.trim() || undefined };
    if (kind === "settled") return { ...base, amount: Number(amount) };
    if (kind === "sold") return { ...base, productName: productName.trim(), qty: Number(qty), unitPrice: Number(unitPrice), partnerSharePct: Number(share) };
    return { ...base, productName: productName.trim(), qty: Number(qty) };
  }

  async function save() {
    const input = buildInput();
    const problem = validateConsignment(input, consignments as ConsignmentEntry[]);
    if (problem) {
      toast.error("Check this entry", problem);
      return;
    }
    setBusy(true);
    try {
      await addConsignmentEntry(input);
      toast.success(KIND_LABEL[kind], kind === "settled" ? money(Number(amount)) : `${qty} × ${productName.trim()}`);
      setQty("");
      setUnitPrice("");
      setAmount("");
      setNote("");
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: ConsignmentEntry) {
    if (!window.confirm(`Delete this ${KIND_LABEL[e.kind].toLowerCase()} for ${e.partner}? Balances change.`)) return;
    try {
      await deleteConsignmentEntry(e.id);
      toast.info("Entry deleted");
    } catch (err) {
      toast.error("Couldn't delete", toastableErrorMessage(err));
    }
  }

  if (guardLoading || !allowed) return null;
  if (loading) return <><PageHeader title="Consignment" /><TableCardSkeleton rows={4} cols={4} /></>;

  const withPartnerHint = kind !== "settled" && partner.trim() && productName.trim()
    ? `${onConsignmentQty(consignments as ConsignmentEntry[], partner, productName)} unit(s) of ${productName.trim()} are with ${partner.trim()} now.`
    : null;

  return (
    <>
      <PageHeader title="Consignment" />
      <div className="text-xs text-muted mb-4 max-w-2xl">
        Goods you leave with a partner who sells them and pays you a share. The goods are still yours until they sell. Record each
        handover, the partner&apos;s sales report and each payment. Balances here are a record of what is owed, not a posting to expenses or sales.
      </div>

      {consignments.length === 0 ? (
        <EmptyState title="No consignment yet" body="Record the first handover to a partner, and their sales reports and payments will follow here." />
      ) : (
        <Card className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted text-xs">
              <tr>
                <th className="py-2 pr-3">Partner</th>
                <th className="py-2 pr-3 text-right">With them</th>
                <th className="py-2 pr-3 text-right">Sold</th>
                <th className="py-2 pr-3 text-right">Their reported sales</th>
                <th className="py-2 pr-3 text-right">Owed to them</th>
                <th className="py-2 pr-3 text-right">Paid</th>
                <th className="py-2 pr-3 text-right">Still owed</th>
                <th className="py-2 pr-3 text-right">Your share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.partner} className="border-t border-line">
                  <td className="py-2 pr-3">{r.partner}</td>
                  <td className="py-2 pr-3 text-right num">{r.withPartnerQty}</td>
                  <td className="py-2 pr-3 text-right num">{r.soldQty}</td>
                  <td className="py-2 pr-3 text-right num">{money(r.reportedSales)}</td>
                  <td className="py-2 pr-3 text-right num">{money(r.owedToPartner)}</td>
                  <td className="py-2 pr-3 text-right num">{money(r.settled)}</td>
                  <td className={`py-2 pr-3 text-right num ${r.balance > 0 ? "text-bad" : ""}`}>{money(r.balance)}</td>
                  <td className="py-2 pr-3 text-right num">{money(r.yourShareOfSales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {canWrite && (
        <Card className="mb-4 max-w-2xl">
          <div className="text-sm font-medium mb-3">Record</div>
          <div className="grid gap-3">
            <Field>
              <Label>What happened</Label>
              <Select value={kind} onChange={(e) => setKind(e.target.value as ConsignmentKind)}>
                {(Object.keys(KIND_LABEL) as ConsignmentKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <Label>Partner</Label>
                <Input value={partner} onChange={(e) => setPartner(e.target.value)} maxLength={MAX_PARTNER_NAME} list="consignment-partners" placeholder="Shop, stall or agent" />
                <datalist id="consignment-partners">
                  {partners.map((p) => (<option key={p} value={p} />))}
                </datalist>
              </Field>
              <Field>
                <Label>Date</Label>
                <Input type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            {kind !== "settled" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field>
                  <Label>Product</Label>
                  <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g. Mango jam 250g" />
                </Field>
                <Field>
                  <Label>Units</Label>
                  <Input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
                </Field>
              </div>
            )}
            {withPartnerHint && <div className="text-[11px] text-muted -mt-1">{withPartnerHint}</div>}
            {kind === "sold" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field>
                  <Label>Price per unit they sold at ({settings.currency})</Label>
                  <Input type="number" min="0" step="any" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
                </Field>
                <Field>
                  <Label>Partner share (%)</Label>
                  <Input type="number" min="0" max="100" step="0.1" value={share} onChange={(e) => setShare(e.target.value)} placeholder="As agreed" />
                </Field>
              </div>
            )}
            {kind === "settled" && (
              <Field>
                <Label>Amount paid ({settings.currency})</Label>
                <Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
            )}
            <Field>
              <Label>Note (optional)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_CONSIGNMENT_NOTE} rows={2} />
            </Field>
          </div>
          <div className="mt-4">
            <Button onClick={save} disabled={busy || !partner.trim()}>{busy ? "Saving…" : "Save entry"}</Button>
          </div>
        </Card>
      )}

      {recent.length > 0 && (
        <Card className="max-w-3xl">
          <div className="text-sm font-medium mb-3">Recent entries</div>
          <ul className="divide-y divide-line text-sm">
            {recent.map((e) => (
              <li key={e.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div>{KIND_LABEL[e.kind]} · {e.partner}</div>
                  <div className="text-[11px] text-muted num">
                    {e.date}
                    {e.productName ? ` · ${e.qty} × ${e.productName}` : ""}
                    {e.kind === "sold" ? ` · ${money((e.qty ?? 0) * (e.unitPrice ?? 0))}, partner ${e.partnerSharePct ?? 0}%` : ""}
                    {e.kind === "settled" ? ` · ${money(e.amount ?? 0)}` : ""}
                    {e.note ? ` · ${e.note}` : ""}
                  </div>
                </div>
                {canDelete && <Button variant="ghost" className="text-xs min-h-[44px]" onClick={() => remove(e)}>Delete</Button>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
