"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { computeOpportunityScore } from "@/lib/calculations";
import type { Opportunity } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Label,
  Modal,
  PageHeader,
  Table,
  TableCardSkeleton,
  Textarea,
} from "@/components/ui";

type FactorKey = "financialCeiling" | "optionality" | "longevity" | "capitalRequired" | "timeToProfit" | "passportFriction" | "risk";

const UPSIDE_FACTORS: { key: FactorKey; label: string; short: string; help: string }[] = [
  { key: "financialCeiling", label: "Financial ceiling", short: "FC", help: "How high the realistic upside goes" },
  { key: "optionality", label: "Optionality", short: "Opt", help: "How many future doors this keeps open" },
  { key: "longevity", label: "Longevity", short: "Long", help: "How long the opportunity stays viable" },
];

const COST_FACTORS: { key: FactorKey; label: string; short: string; help: string }[] = [
  { key: "capitalRequired", label: "Capital required", short: "Cap", help: "How much capital it eats before paying back" },
  { key: "timeToProfit", label: "Time to profit", short: "Time", help: "How long until it's actually profitable" },
  { key: "passportFriction", label: "Passport friction", short: "Pass", help: "Visa/relocation/travel friction involved" },
  { key: "risk", label: "Risk", short: "Risk", help: "Downside risk if it doesn't work out" },
];

const ALL_FACTORS = [...UPSIDE_FACTORS, ...COST_FACTORS];

export default function OpportunitiesPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner"]);
  const { opportunities, addOpportunity, updateOpportunity, deleteOpportunity, loading } = useData();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Opportunity | null>(null);

  const ranked = useMemo(() => {
    return opportunities
      .map((o) => ({ o, score: computeOpportunityScore(o) }))
      .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  }, [opportunities]);

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Opportunities" />
        <TableCardSkeleton rows={4} cols={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Opportunities"
        action={<Button onClick={() => { setEditing(null); setModalOpen(true); }}>+ Add opportunity</Button>}
      />

      <Card className="mb-6">
        <div className="text-sm font-medium mb-1">How this is scored</div>
        <div className="text-xs text-muted">
          Score = (Financial ceiling × Optionality × Longevity) ÷ (Capital required × Time to profit × Passport
          friction × Risk). Every factor is a 1-10 self-assessment you enter by hand — there&apos;s no ledger data
          to derive these from, so this is a ranking tool for comparing options against each other, not an
          absolute scale. Higher upside and lower cost/friction/risk both push the score up.
        </div>
      </Card>

      {ranked.length === 0 ? (
        <EmptyState
          title="No opportunities scored yet"
          body="Add a venture or opportunity to rank it against your others."
          action={<Button onClick={() => { setEditing(null); setModalOpen(true); }}>+ Add opportunity</Button>}
        />
      ) : (
        <>
          {/* Mobile: one card per opportunity. Same data as the table below,
              never rendered at the same time. */}
          <div className="sm:hidden space-y-2.5">
            {ranked.map(({ o, score }, i) => (
              <Card key={o.id} className="!p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {i === 0 && <Badge tone="good">Top ranked</Badge>}
                      <span className="font-medium text-sm">{o.name}</span>
                    </div>
                    {o.notes && <div className="text-xs text-muted mt-1">{o.notes}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="num font-medium">{score !== null ? score.toFixed(2) : "n/a"}</div>
                    <div className="text-[11px] text-muted">score</div>
                  </div>
                </div>
                <div className="text-[11px] text-muted mt-2 pt-2 border-t border-line">
                  {ALL_FACTORS.map((f) => `${f.short} ${o[f.key]}`).join(" · ")}
                </div>
                <div className="flex gap-3 mt-2.5 pt-2.5 border-t border-line">
                  <button
                    onClick={() => { setEditing(o); setModalOpen(true); }}
                    className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm("Delete this opportunity? This can't be undone.")) return;
                      deleteOpportunity(o.id)
                        .then(() => toast.success("Deleted"))
                        .catch((err) => toast.error("Couldn't delete", toastableErrorMessage(err)));
                    }}
                    className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]"
                  >
                    Delete
                  </button>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop: the full table, unchanged. */}
          <Card className="hidden sm:block">
            <Table>
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">Opportunity</th>
                  <th className="py-2 px-3 font-medium text-right">Score</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap">Inputs (1-10)</th>
                  <th className="py-2 pl-3 font-medium text-right">·</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ o, score }, i) => (
                  <tr key={o.id} className="border-b border-line last:border-0 align-top">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        {i === 0 && <Badge tone="good">Top ranked</Badge>}
                        <span className="font-medium">{o.name}</span>
                      </div>
                      {o.notes && <div className="text-xs text-muted mt-1">{o.notes}</div>}
                    </td>
                    <td className="py-2.5 px-3 num text-right font-medium">
                      {score !== null ? score.toFixed(2) : "n/a"}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-muted whitespace-nowrap">
                      {ALL_FACTORS.map((f) => `${f.short} ${o[f.key]}`).join(" · ")}
                    </td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => { setEditing(o); setModalOpen(true); }}
                        className="text-xs text-muted hover:text-fg mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm("Delete this opportunity? This can't be undone.")) return;
                          deleteOpportunity(o.id)
                            .then(() => toast.success("Deleted"))
                            .catch((err) => toast.error("Couldn't delete", toastableErrorMessage(err)));
                        }}
                        className="text-xs text-muted hover:text-bad"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit opportunity" : "Add opportunity"}
      >
        <OpportunityForm
          existing={editing ?? undefined}
          onCancel={() => setModalOpen(false)}
          onSave={async (values) => {
            try {
              if (editing) {
                await updateOpportunity(editing.id, values);
                toast.success("Opportunity updated");
              } else {
                await addOpportunity(values);
                toast.success("Opportunity added");
              }
              setModalOpen(false);
              setEditing(null);
            } catch (err) {
              toast.error("Couldn't save", toastableErrorMessage(err));
            }
          }}
        />
      </Modal>
    </>
  );
}

function OpportunityForm({
  existing,
  onSave,
  onCancel,
}: {
  existing?: Opportunity;
  onSave: (values: Omit<Opportunity, "id" | "createdAt">) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [values, setValues] = useState<Record<FactorKey, string>>({
    financialCeiling: existing?.financialCeiling?.toString() ?? "5",
    optionality: existing?.optionality?.toString() ?? "5",
    longevity: existing?.longevity?.toString() ?? "5",
    capitalRequired: existing?.capitalRequired?.toString() ?? "5",
    timeToProfit: existing?.timeToProfit?.toString() ?? "5",
    passportFriction: existing?.passportFriction?.toString() ?? "5",
    risk: existing?.risk?.toString() ?? "5",
  });
  const [busy, setBusy] = useState(false);

  function setFactor(key: FactorKey, v: string) {
    setValues((cur) => ({ ...cur, [key]: v }));
  }

  const previewScore = computeOpportunityScore({
    financialCeiling: Number(values.financialCeiling) || 0,
    optionality: Number(values.optionality) || 0,
    longevity: Number(values.longevity) || 0,
    capitalRequired: Number(values.capitalRequired) || 0,
    timeToProfit: Number(values.timeToProfit) || 0,
    passportFriction: Number(values.passportFriction) || 0,
    risk: Number(values.risk) || 0,
  });

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({
          name,
          notes: notes || undefined,
          financialCeiling: Number(values.financialCeiling) || 1,
          optionality: Number(values.optionality) || 1,
          longevity: Number(values.longevity) || 1,
          capitalRequired: Number(values.capitalRequired) || 1,
          timeToProfit: Number(values.timeToProfit) || 1,
          passportFriction: Number(values.passportFriction) || 1,
          risk: Number(values.risk) || 1,
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <Field>
        <Label>Name</Label>
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dubai automation contract" />
      </Field>

      <div>
        <div className="text-xs font-medium text-muted mb-2">Upside — higher is better</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {UPSIDE_FACTORS.map((f) => (
            <Field key={f.key}>
              <Label>{f.label}</Label>
              <Input
                type="number"
                min="1"
                max="10"
                step="1"
                value={values[f.key]}
                onChange={(e) => setFactor(f.key, e.target.value)}
              />
            </Field>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-muted mb-2">Cost of pursuing it — lower is better</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {COST_FACTORS.map((f) => (
            <Field key={f.key}>
              <Label>{f.label}</Label>
              <Input
                type="number"
                min="1"
                max="10"
                step="1"
                value={values[f.key]}
                onChange={(e) => setFactor(f.key, e.target.value)}
              />
            </Field>
          ))}
        </div>
      </div>

      <Field>
        <Label>Notes (optional)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering about this one" />
      </Field>

      <div className="flex items-center justify-between pt-2 border-t border-line">
        <div className="text-xs text-muted">
          Score preview: <span className="text-fg font-medium">{previewScore !== null ? previewScore.toFixed(2) : "n/a"}</span>
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
