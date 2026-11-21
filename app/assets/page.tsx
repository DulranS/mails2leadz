"use client";

import { useState } from "react";
import { writeDownAsset } from "@/lib/impairment";
import { useData } from "@/contexts/DataContext";
import { useRequireRole } from "@/lib/roleGuard";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import { computeFixedAssetStatus } from "@/lib/calculations";
import { computeAssetOutlook } from "@/lib/assetOutlook";
import type { FixedAsset } from "@/lib/types";
import {
  Badge,
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
  EmptyState,
} from "@/components/ui";

const ASSET_CATEGORIES = [
  "Machinery & equipment",
  "Vehicles",
  "Furniture & fixtures",
  "Computers & electronics",
  "Buildings & leasehold improvements",
  "Other",
];

export default function AssetsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { fixedAssets, addFixedAsset, updateFixedAsset, deleteFixedAsset, settings, loading } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const asOf = todayIso();
  const [modalOpen, setModalOpen] = useState(false);
  const [writeDownFor, setWriteDownFor] = useState<string | null>(null);
  const [writeDownAmount, setWriteDownAmount] = useState("");
  const [writeDownReason, setWriteDownReason] = useState("");
  const [writeDownDate, setWriteDownDate] = useState(todayIso());
  async function saveWriteDown(a: FixedAsset) {
    const result = writeDownAsset(a, { date: writeDownDate, amount: Number(writeDownAmount.replace(/,/g, "")), reason: writeDownReason.trim() || undefined }, todayIso());
    if (!result.ok) return toast.error("Check the write-down", result.error);
    try {
      await updateFixedAsset(a.id, { impairments: result.impairments });
      setWriteDownFor(null); setWriteDownAmount(""); setWriteDownReason("");
      toast.success("Write-down recorded", "It is charged in the month it is dated, and reduces the asset's value");
    } catch (err) {
      toast.error("Couldn't record it", toastableErrorMessage(err));
    }
  }
  const [editing, setEditing] = useState<FixedAsset | null>(null);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(a: FixedAsset) {
    setEditing(a);
    setModalOpen(true);
  }

  const statuses = fixedAssets.map((a) => computeFixedAssetStatus(a, asOf));
  const outlook = computeAssetOutlook(fixedAssets, asOf);
  const held = statuses.filter((s) => !s.disposed);
  const totalNetBookValue = held.reduce((sum, s) => sum + s.netBookValue, 0);
  const totalCost = held.reduce((sum, s) => sum + s.asset.cost, 0);
  const monthlyDepreciation = held.reduce((sum, s) => sum + (s.fullyDepreciated ? 0 : s.monthlyDepreciation), 0);

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Fixed assets" action={<Button disabled>+ Add asset</Button>} />
        <StatGridSkeleton count={4} />
        <TableCardSkeleton rows={5} cols={5} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Fixed assets" action={<Button onClick={openNew}>+ Add asset</Button>} />

      {fixedAssets.length === 0 ? (
        <EmptyState
          title="No fixed assets on record"
          body="Machinery, vehicles, equipment, or fixtures the business owns and uses over time — not inventory held for resale, not a one-off expense. Depreciated straight-line over its useful life; the monthly charge flows into your Income Statement automatically, and net book value shows up on your Balance Sheet."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <Stat label="Net book value" value={formatMoney(totalNetBookValue, currency)} tone="good" />
            <Stat label="Original cost (held)" value={formatMoney(totalCost, currency)} />
            <Stat label="Depreciation / month" value={formatMoney(monthlyDepreciation, currency)} sub="non-cash expense" />
            <Stat label="Assets held" value={String(held.length)} />
          </div>

          {outlook.heldCount > 0 && (
            <Card className="mb-6">
              <div className="font-medium mb-1">What your equipment will be worth later</div>
              <div className="text-xs text-muted mb-3">
                Book value is cost less the depreciation charged so far. This assumes you buy and sell nothing. It is an accounting figure, not what the equipment would fetch if sold.
                {outlook.lifeUsedPct !== null && <> So far {outlook.lifeUsedPct.toFixed(0)}% of what can be depreciated has been charged.</>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><div className="text-[11px] uppercase tracking-wider text-muted">Today</div><div className="num font-medium">{formatMoney(outlook.netBookValue, currency)}</div></div>
                {outlook.points.map((p) => (
                  <div key={p.months}>
                    <div className="text-[11px] uppercase tracking-wider text-muted">{p.label}</div>
                    <div className="num font-medium">{formatMoney(p.netBookValue, currency)}</div>
                  </div>
                ))}
              </div>
              <div className="text-sm mt-3">
                Another <span className="num font-medium">{formatMoney(outlook.chargeNext12Months, currency)}</span> of depreciation will be charged against profit over the next 12 months (not cash, so it does not leave your bank).
              </div>
              {outlook.usedUpWithin12Months.length > 0 && (
                <div className="mt-3 rounded-md border border-amber/30 bg-amber/5 px-3 py-2.5 text-sm">
                  Fully depreciated within a year: {outlook.usedUpWithin12Months.slice(0, 4).map((x, i) => (
                    <span key={x.name + x.date}>{i > 0 ? ", " : ""}<span className="font-medium">{x.name}</span> ({formatDate(x.date)})</span>
                  ))}
                  {outlook.usedUpWithin12Months.length > 4 ? ` and ${outlook.usedUpWithin12Months.length - 4} more` : ""}. That does not mean it stops working, but it is a good time to plan whether and when to replace it, and to set that cash aside.
                </div>
              )}
            </Card>
          )}

          {outlook.appreciation && (
            <Card className="mb-6">
              <div className="font-medium mb-1">Land and property: what it could be worth</div>
              <div className="text-xs text-muted mb-3">
                Based on the yearly rise in value you set on {outlook.appreciation.count === 1 ? "1 asset" : `${outlook.appreciation.count} assets`}, compounding from the purchase date. It is your own estimate, not a valuation, and your books and tax figures are not changed by it.
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><div className="text-[11px] uppercase tracking-wider text-muted">Today</div><div className="num font-medium">{formatMoney(outlook.appreciation.estimatedNow, currency)}</div></div>
                {outlook.appreciation.points.map((p) => (
                  <div key={p.months}>
                    <div className="text-[11px] uppercase tracking-wider text-muted">{p.label}</div>
                    <div className="num font-medium">{formatMoney(p.estimated, currency)}</div>
                  </div>
                ))}
              </div>
              <div className="text-sm mt-3">
                Cost <span className="num font-medium">{formatMoney(outlook.appreciation.cost, currency)}</span>, carried in the books at <span className="num font-medium">{formatMoney(outlook.appreciation.bookValue, currency)}</span>. Today&apos;s estimate is <span className="num font-medium">{formatMoney(outlook.appreciation.gainOverBook, currency)}</span> above the books. That gain is not booked until you sell.
              </div>
            </Card>
          )}

          {/* Mobile: one card per asset. Same data as the table below, never
              rendered at the same time. */}
          <div className="sm:hidden space-y-2.5">
            {statuses.map((s) => (
              <Card key={s.asset.id} className="!p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{s.asset.name}</div>
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      {s.disposed && <Badge>disposed</Badge>}
                      {!s.disposed && s.fullyDepreciated && <Badge tone="amber">fully depreciated</Badge>}
                      <span className="text-xs text-muted">{s.asset.category}</span>
                    </div>
                  </div>
                  <div className="num font-medium shrink-0">{formatMoney(s.netBookValue, currency)}</div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                  <div>
                    <span className="text-muted">Cost </span>
                    <span className="num">{formatMoney(s.asset.cost, currency)}</span>
                  </div>
                  <div>
                    <span className="text-muted">Accum. deprec. </span>
                    <span className="num">{formatMoney(s.accumulatedDepreciation, currency)}</span>
                  </div>
                  <div>
                    <span className="text-muted">Monthly </span>
                    <span className="num">
                      {s.disposed || s.fullyDepreciated ? "—" : formatMoney(s.monthlyDepreciation, currency)}
                    </span>
                  </div>
                </div>
                <div className="mt-2.5 pt-2.5 border-t border-line">
                  <div className="flex gap-4 flex-wrap">
                    <button onClick={() => openEdit(s.asset)} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                      Edit
                    </button>
                    <button onClick={() => setWriteDownFor(writeDownFor === s.asset.id ? null : s.asset.id)} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]">
                      Record a write-down
                    </button>
                  </div>
                  {writeDownFor === s.asset.id && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input type="date" value={writeDownDate} onChange={(e) => setWriteDownDate(e.target.value)} />
                      <Input inputMode="decimal" placeholder="Amount lost in value" value={writeDownAmount} onChange={(e) => setWriteDownAmount(e.target.value)} />
                      <Input placeholder="Why (e.g. damaged, obsolete)" value={writeDownReason} onChange={(e) => setWriteDownReason(e.target.value)} maxLength={200} />
                      <div className="sm:col-span-3"><Button onClick={() => saveWriteDown(s.asset)} disabled={!writeDownAmount.trim()}>Record the write-down</Button></div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop: the full table, unchanged. */}
          <Card className="hidden sm:block">
            <div className="table-container">
              <Table>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                    <th className="py-2 pr-3 font-medium">Asset</th>
                    <th className="py-2 px-3 font-medium text-right">Cost</th>
                    <th className="py-2 px-3 font-medium text-right">Accum. depreciation</th>
                    <th className="py-2 px-3 font-medium text-right">Net book value</th>
                    <th className="py-2 px-3 font-medium text-right">Monthly charge</th>
                    <th className="py-2 pl-3 font-medium text-right">·</th>
                  </tr>
                </thead>
                <tbody>
                  {statuses.map((s) => (
                    <tr key={s.asset.id} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium">{s.asset.name}</div>
                        <div className="flex gap-1 mt-0.5 items-center">
                          {s.disposed && <Badge>disposed</Badge>}
                          {!s.disposed && s.fullyDepreciated && <Badge tone="amber">fully depreciated</Badge>}
                          <span className="text-xs text-muted">{s.asset.category}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 num text-right text-muted">
                        {formatMoney(s.asset.cost, currency)}
                      </td>
                      <td className="py-2.5 px-3 num text-right text-muted">
                        {formatMoney(s.accumulatedDepreciation, currency)}
                      </td>
                      <td className="py-2.5 px-3 num text-right">{formatMoney(s.netBookValue, currency)}</td>
                      <td className="py-2.5 px-3 num text-right text-muted">
                        {s.disposed || s.fullyDepreciated ? "—" : formatMoney(s.monthlyDepreciation, currency)}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <button onClick={() => openEdit(s.asset)} className="text-xs text-muted hover:text-fg">
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="text-[11px] text-muted mt-3">
              Depreciation is straight-line ((cost − salvage value) ÷ useful life in months) or reducing balance (a
              yearly share of the value left; the Monthly figure is then this month&apos;s charge), starting the month of
              purchase. The monthly charge is a non-cash expense on the Income Statement — the actual cash cost
              hits Investing Cash Flow once, on the purchase date, on the{" "}
              <a href="/statements" className="text-amber-soft">
                Statements
              </a>{" "}
              page.
            </div>
          </Card>
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit asset" : "Add asset"}>
        <AssetForm
          initial={editing}
          onCancel={() => setModalOpen(false)}
          onSave={async (values) => {
            try {
              if (editing) await updateFixedAsset(editing.id, values);
              else await addFixedAsset(values);
              toast.success(editing ? "Asset updated" : "Asset added", values.name);
              setModalOpen(false);
            } catch (err) {
              toast.error("Couldn't save the asset", toastableErrorMessage(err));
            }
          }}
          onDelete={
            editing
              ? async () => {
                  if (!confirm(`Delete "${editing.name}"? This can't be undone.`)) return;
                  try {
                    await deleteFixedAsset(editing.id);
                    toast.success("Asset deleted", editing.name);
                    setModalOpen(false);
                  } catch (err) {
                    toast.error("Couldn't delete the asset", toastableErrorMessage(err));
                  }
                }
              : undefined
          }
        />
      </Modal>
    </>
  );
}

function AssetForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: FixedAsset | null;
  onSave: (values: Omit<FixedAsset, "id" | "createdAt">) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? ASSET_CATEGORIES[0]);
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchaseDate ?? todayIso());
  const [cost, setCost] = useState(initial?.cost?.toString() ?? "");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(initial?.usefulLifeMonths?.toString() ?? "60");
  const [method, setMethod] = useState<"straight_line" | "reducing_balance">(initial?.depreciationMethod ?? "straight_line");
  const [ratePct, setRatePct] = useState(initial?.reducingRatePct?.toString() ?? "25");
  const [salvageValue, setSalvageValue] = useState(initial?.salvageValue?.toString() ?? "");
  const [appreciation, setAppreciation] = useState(initial?.appreciationPct?.toString() ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [disposed, setDisposed] = useState(!!initial?.disposalDate);
  const [disposalDate, setDisposalDate] = useState(initial?.disposalDate ?? todayIso());
  const [disposalAmount, setDisposalAmount] = useState(initial?.disposalAmount?.toString() ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({
          name,
          category,
          purchaseDate,
          cost: Number(cost),
          usefulLifeMonths: method === "straight_line" ? Number(usefulLifeMonths) : Number(usefulLifeMonths) || 60,
          depreciationMethod: method,
          reducingRatePct: method === "reducing_balance" ? Math.min(100, Number(ratePct)) : undefined,
          salvageValue: salvageValue ? Number(salvageValue) : undefined,
          appreciationPct: Number(appreciation) > 0 ? Math.min(100, Number(appreciation)) : undefined,
          notes: notes || undefined,
          disposalDate: disposed ? disposalDate : undefined,
          disposalAmount: disposed && disposalAmount ? Number(disposalAmount) : undefined,
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <Field>
        <Label>Asset name</Label>
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. PP Spunbond fabric machine"
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Category</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {ASSET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>Purchase date</Label>
          <Input required type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>How it loses value</Label>
        <Select value={method} onChange={(e) => setMethod(e.target.value as "straight_line" | "reducing_balance")}>
          <option value="straight_line">Same amount every month (straight-line)</option>
          <option value="reducing_balance">Bigger early, smaller later (reducing balance)</option>
        </Select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field>
          <Label>Cost</Label>
          <Input required type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        {method === "straight_line" ? (
          <Field>
            <Label>Useful life (months)</Label>
            <Input
              required
              type="number"
              min="1"
              step="1"
              value={usefulLifeMonths}
              onChange={(e) => setUsefulLifeMonths(e.target.value)}
            />
          </Field>
        ) : (
          <Field>
            <Label>Loses (% a year)</Label>
            <Input
              required
              type="number"
              min="1"
              max="100"
              step="0.5"
              value={ratePct}
              onChange={(e) => setRatePct(e.target.value)}
            />
          </Field>
        )}
        <Field>
          <Label>Salvage value (optional)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={salvageValue}
            onChange={(e) => setSalvageValue(e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>
      <div className="text-[11px] text-muted -mt-2">
        {method === "straight_line"
          ? "Straight-line: (cost − salvage) ÷ useful life, expensed monthly starting the purchase month."
          : "Reducing balance: each year it loses this share of the value it has left, so the charge is biggest early and shrinks. It never goes below the salvage value."}
      </div>
      <Field>
        <Label>Expected yearly rise in value % (optional)</Label>
        <Input
          type="number"
          min="0"
          max="100"
          step="0.5"
          value={appreciation}
          onChange={(e) => setAppreciation(e.target.value)}
          placeholder="e.g. 8 for land; leave blank for equipment"
        />
      </Field>
      <div className="text-[11px] text-muted -mt-2">
        For land, buildings or anything you expect to gain value. Your own estimate, shown on this page as a rough market value. For land, set the salvage value equal to the cost so it is not depreciated. Your books stay at cost less depreciation.
      </div>
      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={disposed} onChange={(e) => setDisposed(e.target.checked)} className="accent-amber" />
        Sold or scrapped
      </label>
      {disposed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
          <Field>
            <Label>Disposal date</Label>
            <Input type="date" value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} />
          </Field>
          <Field>
            <Label>Amount received (optional)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={disposalAmount}
              onChange={(e) => setDisposalAmount(e.target.value)}
              placeholder="0 if scrapped"
            />
          </Field>
        </div>
      )}
      <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
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
