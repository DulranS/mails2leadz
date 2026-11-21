"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import { expectedPipelineValue } from "@/lib/pipelineValue";
import DealFinder from "@/components/DealFinder";
import EnquiryLinkCard from "@/components/EnquiryLinkCard";
import { pipelineCoverage } from "@/lib/pipelineCoverage";
import {
  CUSTOMER_LEAD_SOURCES,
  CUSTOMER_LEAD_SOURCE_GROUPS,
  CUSTOMER_LEAD_SOURCE_UNGROUPED,
  LEAD_STAGES,
  type Customer,
  type Lead,
  type LeadStage,
} from "@/lib/types";
import ChannelEconomicsCard from "@/components/ChannelEconomicsCard";
import PostIdeasCard from "@/components/PostIdeasCard";
import ProspectFinder from "@/components/ProspectFinder";
import MessageButton from "@/components/MessageButton";
import { suggestedLeadTemplate } from "@/lib/messageTemplates";
import { LEAD_SALE_PAYMENTS, leadSaleDefaultPrice, leadSaleDraftFor, leadSaleOfferings, leadSaleProblem } from "@/lib/leadSales";
import { saleAmountProblem } from "@/lib/bookings";
import { SALE_CHANNEL_PRESETS } from "@/lib/salesChannels";
import { lostReasonCounts } from "@/lib/leadLosses";
import LogLeadContactDialog from "@/components/LogLeadContactDialog";
import LeadPipelinePanel from "@/components/LeadPipelinePanel";
import { LEAD_SEQUENCES, isOpenLead, matchesFilter, sequenceStatus, startSequencePlan, type LeadFilter } from "@/lib/leadPipeline";
import type { LeadContactChannel } from "@/lib/types";
import { leadScore } from "@/lib/leadScore";
import { defaultFollowUpFor, findPossibleDuplicates } from "@/lib/leadFollowUp";
import { daysOverdue } from "@/lib/aiDraft";
import { Button, Field, Input, Label, Select, Card, Modal, PageHeader, EmptyState, Badge, TableCardSkeleton, Textarea } from "@/components/ui";

const STAGE_TONE: Record<LeadStage, "default" | "good" | "bad" | "amber"> = {
  new: "default",
  contacted: "amber",
  qualified: "amber",
  follow_up: "amber",
  proposal_sent: "amber",
  won: "good",
  lost: "bad",
};

const STAGE_LABEL = new Map(LEAD_STAGES.map((s) => [s.value, s.label]));

export default function LeadsPage() {
  const { role, user } = useAuth();
  const { leads, customers, leadConversion, addCustomer, addLead, updateLead, deleteLead, recordLeadSale, products, settings, monthlyPnL, budgets, loading } = useData();
  const toast = useToast();
  const currency = settings.currency;
  // Same split as Estimates: Staff can log a new lead (they're usually the
  // ones doing the actual outreach/follow-up calls), but moving one
  // through stages — or deleting it — needs Owner/Manager.
  const canWrite = can(role, "manage:sales");
  const canCreate = canWrite || can(role, "create:sale");
  const canDelete = can(role, "delete:sales");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  // The chips above the pipeline (LeadPipelinePanel) narrow the open leads shown in the stage columns.
  const [filter, setFilter] = useState<LeadFilter>("all");
  // Local, immediate guard against a fast double-click converting the same
  // lead twice before the first write even reaches Firestore — the
  // persisted `convertedToCustomerAt` flag alone can't catch that, since
  // both clicks would fire before either one sees it come back through
  // the snapshot listener. See Lead.convertedToCustomerAt's doc comment.
  const [convertingIds, setConvertingIds] = useState<Set<string>>(new Set());

  // "Record as sale" on a Won lead: one sale, confirmed by the person, never posted by itself.
  const [saleLead, setSaleLead] = useState<Lead | null>(null);
  const [saleProduct, setSaleProduct] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [salePay, setSalePay] = useState<(typeof LEAD_SALE_PAYMENTS)[number]["value"]>("cash");
  const [saleChannel, setSaleChannel] = useState("");
  const [saleBusy, setSaleBusy] = useState(false);
  const saleOptions = useMemo(() => leadSaleOfferings(products), [products]);
  const canSell = canWrite || can(role, "create:sale");

  function openLeadSale(l: Lead) {
    const first = saleOptions[0];
    setSaleLead(l);
    setSaleProduct(first?.id ?? "");
    const price = leadSaleDefaultPrice(l.estValue, first?.defaultSellPrice);
    setSalePrice(price !== undefined ? String(price) : "");
    setSalePay("cash");
    setSaleChannel(l.source ?? "");
  }

  function pickLeadProduct(id: string) {
    setSaleProduct(id);
    const p = saleOptions.find((o) => o.id === id);
    const price = saleLead ? leadSaleDefaultPrice(saleLead.estValue, p?.defaultSellPrice) : p?.defaultSellPrice;
    setSalePrice(price !== undefined ? String(price) : "");
  }

  async function recordLeadSaleNow() {
    if (!saleLead) return;
    const price = Number(salePrice);
    const problem =
      leadSaleProblem(saleLead) ?? (saleProduct ? null : "Choose what was sold.") ?? saleAmountProblem(price);
    if (problem) {
      toast.error("Can't record the sale", problem);
      return;
    }
    setSaleBusy(true);
    try {
      await recordLeadSale(saleLead.id, leadSaleDraftFor(saleLead, saleProduct, price, salePay, todayIso(), saleChannel));
      toast.success("Sale recorded", `${saleLead.name}, ${formatMoney(price, currency)}`);
      setSaleLead(null);
    } catch (err) {
      toast.error("Couldn't record the sale", toastableErrorMessage(err));
    } finally {
      setSaleBusy(false);
    }
  }

  const active = useMemo(
    () =>
      [...leads]
        .filter((l) => l.stage !== "won" && l.stage !== "lost")
        .sort((a, b) => b.createdAt - a.createdAt),
    [leads]
  );
  const won = useMemo(() => [...leads].filter((l) => l.stage === "won").sort((a, b) => b.createdAt - a.createdAt), [leads]);
  const lost = useMemo(() => [...leads].filter((l) => l.stage === "lost").sort((a, b) => b.createdAt - a.createdAt), [leads]);
  const lostReasons = useMemo(() => lostReasonCounts(leads), [leads]);
  const pipelineValue = active.reduce((sum, l) => sum + (l.estValue ?? 0), 0);
  // What the open pipeline is likely to be worth at this business's own win rate (lib/pipelineValue.ts).
  const expectedPipeline = expectedPipelineValue(active.map((l) => l.estValue), leadConversion.winRatePct, leadConversion.wonLeads + leadConversion.lostLeads);
  // Does the open pipeline cover what is still needed to reach this month's revenue target (lib/pipelineCoverage.ts)?
  // Targets and revenue are financial figures, so only roles that can see reports get this line.
  const thisMonth = todayIso().slice(0, 7);
  const coverage = can(role, "view:reports")
    ? pipelineCoverage(active.map((l) => l.estValue), budgets[thisMonth]?.revenueTarget, monthlyPnL.find((m) => m.month === thisMonth)?.totalRevenue ?? 0)
    : null;
  // Grouped view of the active pipeline: same `active` list, same stage
  // values, just bucketed by stage so it reads like a pipeline (how many
  // are stuck at Proposal Sent) instead of one flat list you have to scan.
  const visibleActive = useMemo(
    () => active.filter((l) => matchesFilter(l, filter, user?.uid, todayIso())),
    [active, filter, user?.uid]
  );
  const activeStages = useMemo(() => LEAD_STAGES.filter((s) => s.value !== "won" && s.value !== "lost"), []);
  const activeByStage = useMemo(() => {
    const map = new Map<LeadStage, Lead[]>();
    for (const s of activeStages) map.set(s.value, []);
    for (const lead of visibleActive) map.get(lead.stage)?.push(lead);
    return map;
  }, [visibleActive, activeStages]);

  async function handleConvert(lead: Lead) {
    // Guards against the accidental-double-click path specifically — see
    // Lead.convertedToCustomerAt's doc comment in lib/types.ts for why
    // this exists (addCustomer itself has no duplicate-name detection,
    // same as the plain "+ Add customer" form). The persisted flag alone
    // can't catch two clicks fired before the first write lands, hence
    // the local convertingIds guard too.
    if (lead.convertedToCustomerAt || convertingIds.has(lead.id)) return;
    setConvertingIds((prev) => new Set(prev).add(lead.id));
    try {
      await addCustomer({ name: lead.name, contact: lead.contact, notes: lead.notes, leadSource: lead.source });
      await updateLead(lead.id, { convertedToCustomerAt: Date.now() });
      toast.success("Added to customers", `${lead.name} — now log their first sale or invoice whenever you're ready`);
    } catch (err) {
      toast.error("Couldn't add as a customer", toastableErrorMessage(err));
      // Only clear the local guard on failure — on success the persisted
      // convertedToCustomerAt flag takes over as the permanent guard, so
      // there's no need (and no lead.id left worth un-blocking) to reset it.
      setConvertingIds((prev) => {
        const next = new Set(prev);
        next.delete(lead.id);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Leads" />
        <TableCardSkeleton rows={5} cols={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Leads"
        action={
          canCreate ? (
            <div className="flex flex-wrap gap-2">
              <ProspectFinder />
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                + New lead
              </Button>
            </div>
          ) : undefined
        }
      />

      <DealFinder />

      {canCreate && <EnquiryLinkCard />}

      {(leadConversion.wonLeads > 0 || leadConversion.lostLeads > 0) && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div>
              <div className="text-sm font-medium">Win rate</div>
              <div className="text-xs text-muted">
                {leadConversion.wonLeads} won of {leadConversion.wonLeads + leadConversion.lostLeads} decided ·{" "}
                {leadConversion.conversionRatePct === null ? "—" : `${leadConversion.conversionRatePct.toFixed(0)}%`} of all leads logged,
                last {leadConversion.windowMonths}mo
              </div>
            </div>
            <div className="text-2xl font-semibold num shrink-0">
              {leadConversion.winRatePct === null ? "—" : `${leadConversion.winRatePct.toFixed(0)}%`}
            </div>
          </div>
          {leadConversion.bySource.length > 1 && (
            <div className="mt-3 pt-3 border-t border-line space-y-1.5">
              {leadConversion.bySource.map((s) => (
                <div key={s.source} className="flex items-center justify-between text-xs gap-3">
                  <div className="text-muted truncate">{s.source}</div>
                  <div className="num shrink-0">
                    {s.winRatePct === null ? "— decided" : `${s.winRatePct.toFixed(0)}% win`} ({s.totalLeads} lead{s.totalLeads === 1 ? "" : "s"})
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {leads.length === 0 && (
        <EmptyState
          title="No leads yet"
          body="Log anyone you've reached out to or who's reached out to you, before they're a paying customer — so a follow-up never quietly gets forgotten."
          action={
            canCreate ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                + New lead
              </Button>
            ) : undefined
          }
        />
      )}

      {leads.length > 0 && (
        <LeadPipelinePanel leads={leads} filter={filter} onFilter={setFilter} canWrite={canWrite} currency={currency} />
      )}
      {active.length > 0 && (
        <div className="flex items-center justify-between mb-3 mt-1">
          <div className="text-xs font-medium text-muted">Active pipeline ({active.length})</div>
          {pipelineValue > 0 && (
            <div className="text-xs text-muted">
              Worth ~<span className="num font-medium text-fg">{formatMoney(pipelineValue, currency)}</span> if it all closes
              {expectedPipeline && (
                <>
                  {" "}· about <span className="num font-medium text-fg">{formatMoney(expectedPipeline.expected, currency)}</span> at your {expectedPipeline.winRatePct}% win rate
                  <span className="text-muted"> ({expectedPipeline.decided} decided leads)</span>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {active.length > 0 && coverage && (
        <div className="text-xs text-muted mb-3 -mt-1">
          <Badge tone={coverage.level === "healthy" ? "good" : coverage.level === "thin" ? "amber" : "bad"}>{coverage.coverage}× cover</Badge>{" "}
          Open leads worth <span className="num font-medium text-fg">{formatMoney(coverage.pipeline, currency)}</span> against <span className="num font-medium text-fg">{formatMoney(coverage.stillNeeded, currency)}</span> still needed for this month&apos;s target of {formatMoney(coverage.target, currency)}.{" "}
          {coverage.level === "healthy"
            ? "Enough in the funnel: about 3× is the usual safe level, because most leads are not won."
            : coverage.level === "thin"
              ? "Thin: this only works if most of them close. About 3× is the usual safe level, because most leads are not won."
              : "Short: even if every lead closed you would miss the target. Add leads, or revisit the target."}
          <span className="block mt-0.5">Leads may carry an expected close date, but this compares every open lead with this month&apos;s gap. It is a funnel check, not a forecast.</span>
        </div>
      )}
      <div className="space-y-5">
        {activeStages.map((s) => {
          const stageLeads = activeByStage.get(s.value) ?? [];
          if (stageLeads.length === 0) return null;
          const stageValue = stageLeads.reduce((sum, l) => sum + (l.estValue ?? 0), 0);
          return (
            <div
              key={s.value}
              onDragOver={(e) => {
                if (canWrite) e.preventDefault();
              }}
              onDrop={(e) => {
                // Drag a lead onto a stage to move it there (the same change as its stage menu).
                if (!canWrite) return;
                e.preventDefault();
                const moved = active.find((l) => l.id === e.dataTransfer.getData("text/plain"));
                if (!moved || moved.stage === s.value) return;
                updateLead(moved.id, { stage: s.value }).catch((err) => toast.error("Couldn't update stage", toastableErrorMessage(err)));
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge tone={STAGE_TONE[s.value]}>{s.label}</Badge>
                  <span className="text-xs text-muted">{stageLeads.length}</span>
                </div>
                {stageValue > 0 && <div className="text-xs text-muted num">{formatMoney(stageValue, currency)}</div>}
              </div>
              <div className="space-y-2">
                {stageLeads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable={canWrite}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", lead.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                  >
                  <LeadCard
                    lead={lead}
                    currency={currency}
                    canWrite={canWrite}
                    canDelete={canDelete}
                    onStageChange={(stage) =>
                  updateLead(lead.id, { stage, nextFollowUpDate: defaultFollowUpFor(stage, lead.nextFollowUpDate, todayIso()) }).catch((err) =>
                    toast.error("Couldn't update stage", toastableErrorMessage(err))
                  )
                }
                    onEdit={() => {
                      setEditing(lead);
                      setFormOpen(true);
                    }}
                    onDelete={async () => {
                      if (!confirm(`Delete the lead "${lead.name}"? This can't be undone.`)) return;
                      try {
                        await deleteLead(lead.id);
                        toast.success("Lead deleted", lead.name);
                      } catch (err) {
                        toast.error("Couldn't delete", toastableErrorMessage(err));
                      }
                    }}
                  />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {won.length > 0 && (
        <>
          <div className="text-xs font-medium text-muted mb-2 mt-6">Won ({won.length})</div>
          <div className="space-y-2">
            {won.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                currency={currency}
                canWrite={canWrite}
                canDelete={canDelete}
                onStageChange={(stage) =>
                  updateLead(lead.id, { stage, nextFollowUpDate: defaultFollowUpFor(stage, lead.nextFollowUpDate, todayIso()) }).catch((err) =>
                    toast.error("Couldn't update stage", toastableErrorMessage(err))
                  )
                }
                onEdit={() => {
                  setEditing(lead);
                  setFormOpen(true);
                }}
                onDelete={async () => {
                  if (!confirm(`Delete the lead "${lead.name}"? This can't be undone.`)) return;
                  try {
                    await deleteLead(lead.id);
                    toast.success("Lead deleted", lead.name);
                  } catch (err) {
                    toast.error("Couldn't delete", toastableErrorMessage(err));
                  }
                }}
                onConvert={canWrite && !lead.convertedToCustomerAt ? () => handleConvert(lead) : undefined}
                onQuote={canWrite ? () => window.location.assign(`/estimates?lead=${encodeURIComponent(lead.id)}`) : undefined}
                converting={convertingIds.has(lead.id)}
                converted={!!lead.convertedToCustomerAt}
                onSell={canSell && lead.stage === "won" && !lead.saleId ? () => openLeadSale(lead) : undefined}
                sold={!!lead.saleId}
              />
            ))}
          </div>
        </>
      )}

      {lost.length > 0 && (
        <>
          <div className="text-xs font-medium text-muted mb-2 mt-6">Lost ({lost.length})</div>
          {lostReasons.length > 0 && (
            <div className="text-xs text-muted mb-2">
              Why: {lostReasons.map((r) => `${r.reason} (${r.count})`).join(" · ")}
            </div>
          )}
          <div className="space-y-2 opacity-70">
            {lost.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                currency={currency}
                canWrite={canWrite}
                canDelete={canDelete}
                onStageChange={(stage) =>
                  updateLead(lead.id, { stage, nextFollowUpDate: defaultFollowUpFor(stage, lead.nextFollowUpDate, todayIso()) }).catch((err) =>
                    toast.error("Couldn't update stage", toastableErrorMessage(err))
                  )
                }
                onEdit={() => {
                  setEditing(lead);
                  setFormOpen(true);
                }}
                onDelete={async () => {
                  if (!confirm(`Delete the lead "${lead.name}"? This can't be undone.`)) return;
                  try {
                    await deleteLead(lead.id);
                    toast.success("Lead deleted", lead.name);
                  } catch (err) {
                    toast.error("Couldn't delete", toastableErrorMessage(err));
                  }
                }}
              />
            ))}
          </div>
        </>
      )}

      {can(role, "view:reports") && <ChannelEconomicsCard />}
      <PostIdeasCard />

      <Modal open={saleLead !== null} onClose={() => setSaleLead(null)} title="Record as sale">
        {saleLead && (
          <div className="space-y-4">
            <div className="text-sm">
              {saleLead.name}
              {saleLead.contact ? <span className="text-muted"> · {saleLead.contact}</span> : null}
            </div>
            {saleOptions.length === 0 ? (
              <div className="text-sm text-muted">There is no active product or service to record this against. Add one in the catalogue first.</div>
            ) : (
              <>
                <Field>
                  <Label>What was sold</Label>
                  <Select value={saleProduct} onChange={(e) => pickLeadProduct(e.target.value)}>
                    {saleOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>Price charged ({currency})</Label>
                  <Input inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
                </Field>
                <Field>
                  <Label>Paid by</Label>
                  <Select value={salePay} onChange={(e) => setSalePay(e.target.value as typeof salePay)}>
                    {LEAD_SALE_PAYMENTS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>How they came in (optional)</Label>
                  <Input list="lead-sale-channels" maxLength={40} value={saleChannel} onChange={(e) => setSaleChannel(e.target.value)} placeholder="Walk-in, Online, Referral…" />
                  <datalist id="lead-sale-channels">
                    {SALE_CHANNEL_PRESETS.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Field>
                <div className="text-xs text-muted">
                  This records one sale for one unit at the price charged, dated today, paid in full. Credit is recorded on the Sales page. One sale per lead, and the lead stays Won.
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setSaleLead(null)}>Cancel</Button>
                  <Button onClick={recordLeadSaleNow} disabled={saleBusy}>{saleBusy ? "Recording…" : "Record sale"}</Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit lead" : "New lead"}>
        <LeadForm
          initial={editing}
          leads={leads}
          customers={customers}
          onCancel={() => setFormOpen(false)}
          onSave={async (values) => {
            try {
              if (editing) await updateLead(editing.id, values);
              else await addLead(values);
              toast.success(editing ? "Lead updated" : "Lead added", values.name);
              setFormOpen(false);
            } catch (err) {
              toast.error("Couldn't save", toastableErrorMessage(err));
            }
          }}
        />
      </Modal>
    </>
  );
}

function LeadCard({
  lead,
  currency,
  canWrite,
  canDelete,
  onStageChange,
  onEdit,
  onDelete,
  onConvert,
  onQuote,
  converting,
  converted,
  onSell,
  sold,
}: {
  lead: Lead;
  currency: string;
  canWrite: boolean;
  canDelete: boolean;
  onStageChange: (stage: LeadStage) => void;
  onEdit: () => void;
  onDelete: () => void;
  onConvert?: () => void;
  onQuote?: () => void;
  converting?: boolean;
  converted?: boolean;
  onSell?: () => void;
  sold?: boolean;
}) {
  const overdue = lead.nextFollowUpDate && lead.nextFollowUpDate < todayIso() && lead.stage !== "won" && lead.stage !== "lost";
  const { logLeadContact } = useData();
  const toast = useToast();
  const { role: myRole } = useAuth();
  const [logDefaults, setLogDefaults] = useState<{ channel?: LeadContactChannel; step: boolean } | null>(null);
  const today = todayIso();
  const canLog = can(myRole, "log:leadContact");
  const seq = sequenceStatus(lead, today);
  const daysSinceContact = typeof lead.lastContactedAt === "number" ? Math.floor((Date.now() - lead.lastContactedAt) / 86400000) : null;
  async function startSeq() {
    const plan = startSequencePlan(lead, LEAD_SEQUENCES[0].key, today);
    if (!plan.ok) {
      toast.error("Couldn't start the sequence", plan.error);
      return;
    }
    try {
      await logLeadContact(lead.id, plan.patch);
      toast.success("Sequence started", `${lead.name}: the first step is due today`);
    } catch (err) {
      toast.error("Couldn't start the sequence", toastableErrorMessage(err));
    }
  }
  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-fg truncate">{lead.name}</span>
            {canWrite ? (
              <Select
                value={lead.stage}
                onChange={(e) => onStageChange(e.target.value as LeadStage)}
                className="!py-0.5 !text-[11px] !w-auto"
              >
                {LEAD_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Badge tone={STAGE_TONE[lead.stage]}>{STAGE_LABEL.get(lead.stage)}</Badge>
            )}
            {lead.doNotContact && <Badge tone="bad">Do not contact</Badge>}
            {isOpenLead(lead) && (() => {
              const sc = leadScore(lead, todayIso(), Date.now());
              return (
                <span
                  className={`text-xs font-medium ${sc.score >= 60 ? "text-good" : sc.score >= 30 ? "text-amber-soft" : "text-muted"}`}
                  title={sc.reasons.join("\n")}
                >
                  score {sc.score}
                </span>
              );
            })()}
          </div>
          <div className="text-xs text-muted mt-1 flex items-center gap-2 flex-wrap">
            {lead.contact && <span>{lead.contact}</span>}
            {lead.source && <span>· {lead.source}</span>}
            {lead.campaign && <span>· via {lead.campaign}</span>}
            {lead.howHeard && <span>· heard: {lead.howHeard}</span>}
            {lead.ownerName && <span>· owner: {lead.ownerName}</span>}
            {lead.expectedCloseDate && <span>· expected {lead.expectedCloseDate}</span>}
            {typeof lead.estValue === "number" && lead.estValue > 0 && (
              <span className="num">· {formatMoney(lead.estValue, currency)}</span>
            )}
          </div>
          {lead.nextFollowUpDate && (
            <div className={`text-xs mt-1 ${overdue ? "text-bad font-medium" : "text-muted"}`}>
              {overdue ? "Follow up was due" : "Next follow-up"}: {lead.nextFollowUpDate}
            </div>
          )}
          {lead.stage !== "won" && lead.stage !== "lost" && (
            <div className="text-xs text-muted mt-1">
              {daysSinceContact === null
                ? "Not contacted yet"
                : `Last contact: ${daysSinceContact <= 0 ? "today" : daysSinceContact === 1 ? "yesterday" : `${daysSinceContact} days ago`}`}
            </div>
          )}
          {seq && (seq.state === "due" || seq.state === "upcoming") && (
            <div className={`text-xs mt-1 ${seq.state === "due" ? "text-bad" : "text-muted"}`}>
              Step {seq.stepNumber} of {seq.total}: {seq.step.label} ·{" "}
              {seq.state === "due"
                ? seq.daysLate > 0
                  ? `${seq.daysLate} day${seq.daysLate === 1 ? "" : "s"} late`
                  : "due today"
                : `due ${seq.dueDate}`}
            </div>
          )}
          {seq && seq.state === "finished" && <div className="text-xs text-muted mt-1">Follow-up sequence complete.</div>}
          {seq && seq.state === "stopped" && <div className="text-xs text-muted mt-1">Sequence stopped: {seq.reason}</div>}
          {lead.notes && <div className="text-xs text-muted mt-1">{lead.notes}</div>}
          {lead.stage === "lost" && lead.lostReason && <div className="text-xs text-muted mt-1 italic">Lost: {lead.lostReason}</div>}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
        {onConvert && (
          <button onClick={onConvert} disabled={converting} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px] disabled:opacity-50">
            {converting ? "Adding…" : "Convert to customer"}
          </button>
        )}
        {converted && <span className="text-xs text-muted min-h-[44px] sm:min-h-[32px] flex items-center">✓ Added to customers</span>}
        {onSell && (
          <button onClick={onSell} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
            Record as sale
          </button>
        )}
        {sold && <span className="text-xs text-muted min-h-[44px] sm:min-h-[32px] flex items-center">✓ Sale recorded</span>}
        {onQuote && (
          <button onClick={onQuote} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
            Make a quote
          </button>
        )}
        {canLog && (
          <button onClick={() => setLogDefaults({ step: false })} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
            Log contact
          </button>
        )}
        {canLog && seq && (seq.state === "due" || seq.state === "upcoming") && (
          <button
            onClick={() => setLogDefaults({ channel: seq.step.channel, step: true })}
            className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]"
          >
            Log this step
          </button>
        )}
        {canLog && isOpenLead(lead) && !lead.doNotContact && (!seq || seq.state === "finished") && (
          <button onClick={startSeq} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
            Start follow-up sequence
          </button>
        )}
        {canWrite && !lead.doNotContact && (
          <MessageButton
            audience="lead"
            name={lead.name}
            contact={lead.contact}
            suggested={suggestedLeadTemplate(lead.stage)}
            ai={
              lead.stage === "won" || lead.stage === "lost"
                ? undefined
                : {
                    kind: lead.stage === "new" ? "outreach" : "follow_up",
                    stage: lead.stage,
                    ...(lead.source ? { source: lead.source } : {}),
                    ...(lead.notes ? { notes: lead.notes } : {}),
                    ...(daysOverdue(lead.nextFollowUpDate, todayIso()) !== undefined ? { daysOverdue: daysOverdue(lead.nextFollowUpDate, todayIso()) } : {}),
                  }
            }
          />
        )}
        <button onClick={onEdit} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]">
          Edit
        </button>
        {canDelete && (
          <button onClick={onDelete} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]">
            Delete
          </button>
        )}
      </div>
      {logDefaults && (
        <LogLeadContactDialog
          lead={lead}
          open
          onClose={() => setLogDefaults(null)}
          initialChannel={logDefaults.channel}
          countsAsStep={logDefaults.step}
        />
      )}
    </Card>
  );
}

function LeadForm({
  initial,
  leads,
  customers,
  onSave,
  onCancel,
}: {
  initial?: Lead | null;
  leads: Lead[];
  customers: Customer[];
  onSave: (values: Omit<Lead, "id" | "createdAt" | "createdByUid" | "createdByName" | "stage">) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [customSource, setCustomSource] = useState(
    initial?.source && !CUSTOMER_LEAD_SOURCES.includes(initial.source) ? initial.source : ""
  );
  const [estValue, setEstValue] = useState(initial?.estValue?.toString() ?? "");
  const [nextFollowUpDate, setNextFollowUpDate] = useState(initial?.nextFollowUpDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lostReason, setLostReason] = useState(initial?.lostReason ?? "");
  const [busy, setBusy] = useState(false);
  // Ownership, close date, revisit and opt-out are for Owners and Managers (manage:sales), as stage changes are.
  const { members } = useData();
  const { role: formRole } = useAuth();
  const canOwn = can(formRole, "manage:sales");
  const [ownerUid, setOwnerUid] = useState(initial?.ownerUid ?? "");
  const [expectedClose, setExpectedClose] = useState(initial?.expectedCloseDate ?? "");
  const [revisitOn, setRevisitOn] = useState(initial?.revisitOn ?? "");
  const [dnc, setDnc] = useState(!!initial?.doNotContact);

  const isCustomSource = source === "__custom__";
  // A warning only: two people can share a name, so this never blocks the save.
  const duplicates = findPossibleDuplicates(name, contact, leads, customers, initial?.id);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({
          name,
          contact: contact || undefined,
          source: isCustomSource ? customSource || undefined : source || undefined,
          estValue: estValue ? Number(estValue) : undefined,
          nextFollowUpDate: nextFollowUpDate || undefined,
          notes: notes || undefined,
          lostReason: lostReason || undefined,
          ...(canOwn
            ? {
                ownerUid,
                ownerName: ownerUid ? (members.find((m) => m.id === ownerUid)?.name ?? "") : "",
                expectedCloseDate: expectedClose,
                revisitOn,
                doNotContact: dnc,
              }
            : {}),
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <Field>
        <Label>Name</Label>
        <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kamal Hardware" />
        {duplicates.length > 0 && (
          <div className="text-xs text-amber-soft mt-1">
            Possible duplicate: {duplicates.map((d) => `${d.name} (${d.kind === "customer" ? "customer" : "lead"}, same ${d.reason === "name" ? "name" : "phone or email"})`).join(", ")}. Save anyway if this is a different person.
          </div>
        )}
      </Field>
      <Field>
        <Label>Phone or email (optional)</Label>
        <Input value={contact} onChange={(e) => setContact(e.target.value)} />
      </Field>
      <Field>
        <Label>How did this come in? (optional)</Label>
        <Select value={source && !CUSTOMER_LEAD_SOURCES.includes(source) ? "__custom__" : source} onChange={(e) => setSource(e.target.value)}>
          <option value="">— not set —</option>
          {CUSTOMER_LEAD_SOURCE_UNGROUPED.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          {CUSTOMER_LEAD_SOURCE_GROUPS.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.options.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="__custom__">Other (type below)</option>
        </Select>
        {isCustomSource && (
          <Input className="mt-2" value={customSource} onChange={(e) => setCustomSource(e.target.value)} placeholder="e.g. Trade show, cold call" />
        )}
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Estimated deal value (optional)</Label>
          <Input type="number" min="0" step="0.01" value={estValue} onChange={(e) => setEstValue(e.target.value)} />
        </Field>
        <Field>
          <Label>Next follow-up date (optional)</Label>
          <Input type="date" value={nextFollowUpDate} onChange={(e) => setNextFollowUpDate(e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>Notes (optional)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
      {initial?.stage === "lost" && (
        <Field>
          <Label>Why was this lost? (optional)</Label>
          <Input value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="e.g. Went with a cheaper competitor" />
        </Field>
      )}
      {canOwn && (
        <>
          <Field>
            <Label>Who is working this lead?</Label>
            <Select value={ownerUid} onChange={(e) => setOwnerUid(e.target.value)}>
              <option value="">Unassigned</option>
              {members
                .filter((m) => m.active)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </Select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field>
              <Label>Expected close date (optional)</Label>
              <Input type="date" value={expectedClose} onChange={(e) => setExpectedClose(e.target.value)} />
            </Field>
            <Field>
              <Label>Look at it again on (optional)</Label>
              <Input type="date" value={revisitOn} onChange={(e) => setRevisitOn(e.target.value)} />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={dnc} onChange={(e) => setDnc(e.target.checked)} />
            <span>Do not contact: they asked us to stop. No message, sequence or contact attempt will be offered for this lead.</span>
          </label>
        </>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
