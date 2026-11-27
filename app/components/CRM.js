import React, { useState, useMemo, useEffect } from "react";
import { Card, CardHeader, CardContent } from "./ui/Card";
import { Button } from "./ui/Button";
import { DataTable } from "./ui/DataTable";
import { Modal } from "./ui/Modal";
import TagBox from "./TagBox";
import { ALL_STAGES, normalizeStage, PIPELINE_STAGES, pipelineOfStage } from "../../lib/deal-utils.js";
import { findPipeline, DEFAULT_PIPELINE_ID, DEFAULT_PIPELINE, stageOutcome, isOpenCustomStage } from "../../lib/pipelines.js";
import { stageLabel } from "../../lib/work-mode.js";
import { useWorkMode } from "./useWorkMode";
import { LEAD_SOURCES, REVIVABLE_REASONS, reviveCheck } from "../../lib/deal-utils.js";
import { NO_NAME_LABEL } from "../../lib/lead-name.js";
import { QUAL_FIELDS, qualificationSummary, COMMITTEE_ROLES, COMMITTEE_MAX, committeeGaps } from "../../lib/deal-extras.js";
import { findDuplicatesOf } from "../../lib/lead-merge.js";
import DraftModal from "./DraftModal";
import { planBulkStage, planBulkTags, selectedEmails, addView, removeView, parseViews, BULK_MAX } from "../../lib/crm-bulk.js";
import { OPEN_STAGES } from "../../lib/deal-utils.js";

// One stage vocabulary everywhere (same as the dashboard + Business Value page).
// With `stages` (a custom pipeline's stages), those are listed; otherwise the default pipeline's stages.
// Saved views live in this browser only (localStorage). Any failure reads as "no saved views" and never breaks the list.
const VIEWS_KEY = "autoleads.crmViews";
function readStoredViews() {
  try { return typeof window === "undefined" ? [] : parseViews(JSON.parse(window.localStorage.getItem(VIEWS_KEY) || "[]")); } catch { return []; }
}
function storeViews(list) {
  try { if (typeof window !== "undefined") window.localStorage.setItem(VIEWS_KEY, JSON.stringify(list)); } catch { /* private window or blocked storage: the view lasts this visit */ }
}

const StageOptions = ({ mode, stages }) =>
  stages
    ? stages.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))
    : ALL_STAGES.map((st) => (
      <option key={st} value={st}>
        {stageLabel(st, mode)}
      </option>
    ));

import { whatsappLink, smsLink } from "../../lib/channel-drafts.js";

// The stage board: one column per stage of the pipeline chosen (the default's fixed stages, or a custom pipeline's own stages).
// Read-only. A deal moves with its stage menu in the table below, or its pipeline in the deal window.
function PipelineBoard({ pipelines = [], dealPipelines = {}, dealStages = {}, dealValues = {}, leads = [] }) {
  const [pid, setPid] = useState(DEFAULT_PIPELINE_ID);
  const current = findPipeline(pipelines, pid) || DEFAULT_PIPELINE; // a pipeline deleted since it was picked falls back to the default
  const names = useMemo(() => new Map(leads.map((l) => [l.email, l.company || l.email])), [leads]);
  const byStage = useMemo(() => {
    const m = new Map();
    for (const email of Object.keys(dealStages)) {
      if ((dealPipelines[email] || DEFAULT_PIPELINE_ID) !== current.id) continue;
      m.set(dealStages[email], [...(m.get(dealStages[email]) || []), email]);
    }
    return m;
  }, [dealStages, dealPipelines, current.id]);
  const outcomeTag = (s) => (s.outcome === "won" ? "Won" : s.outcome === "lost" ? "Lost" : "Open");
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Board</h3>
          {pipelines.length > 0 && (
            <label className="text-sm text-gray-700 dark:text-gray-300">
              Pipeline{" "}
              <select
                aria-label="Pipeline shown on the board"
                value={current.id}
                onChange={(e) => setPid(e.target.value)}
                className="ml-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value={DEFAULT_PIPELINE_ID}>Default</option>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {current.stages.map((s) => {
            const emails = byStage.get(s.id) || [];
            const value = emails.reduce((a, e) => a + (Number(dealValues[e]) > 0 ? Number(dealValues[e]) : 0), 0);
            return (
              <div key={s.id} className="w-44 shrink-0 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-gray-900 dark:text-white" title={s.name}>{s.name}</span>
                  <span className="shrink-0 text-xs text-gray-600 dark:text-gray-300">{outcomeTag(s)}</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  {emails.length} {emails.length === 1 ? "deal" : "deals"}{value > 0 ? `, ${Math.round(value).toLocaleString()} in value` : ""}
                </p>
                <ul className="mt-2 space-y-1">
                  {emails.slice(0, 6).map((e) => (
                    <li key={e} title={e} className="truncate rounded bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-800 dark:text-gray-100">{names.get(e) || e}</li>
                  ))}
                  {emails.length > 6 ? <li className="text-xs text-gray-500 dark:text-gray-400">and {emails.length - 6} more</li> : null}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Read-only. To move a deal, change its stage in the table, or its pipeline in the deal window.</p>
      </CardContent>
    </Card>
  );
}

export const CRM = ({
  leads = [],
  contacts = {},
  repliedLeads = {},
  leadScores = {},
  dealStages = {},
  dealValues = {},
  dealCurrencies = {},
  currencyOptions = [],
  dealQual = {},
  dealOwners = {},
  dealLost = {},
  billingByEmail = {},
  team = [],
  defaultDealValue = 1000,
  onUpdateLead,
  onMergeLead,
  onAddNote,
  onScheduleFollowUp,
  onAddLead,
  onRename,
  onSaveTags,
  onBulkChanges,
  pipelines = [],
  dealPipelines = {},
}) => {
  const workMode = useWorkMode();
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [addForm, setAddForm] = useState({ email: "", businessName: "", stage: "qualified", value: "", source: "referral", country: "" });
  const [adding, setAdding] = useState(false);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [closing, setClosing] = useState({ busy: false, error: "", draft: null });
  // Pass 404: bulk actions on the list (lib/crm-bulk.js) and saved views (kept in this browser only).
  const [picked, setPicked] = useState([]);
  const [bulkStage, setBulkStage] = useState("");
  const [bulkTag, setBulkTag] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const [views, setViews] = useState(() => readStoredViews());
  const [activeView, setActiveView] = useState("");
  const [viewName, setViewName] = useState("");
  const [viewMsg, setViewMsg] = useState("");
  const tagsByEmail = useMemo(() => Object.fromEntries(leads.map((l) => [l.email, Array.isArray(l.tags) ? l.tags : []])), [leads]);
  const bulkStages = useMemo(() => {
    const first = picked[0];
    const pid = first ? dealPipelines[first] || DEFAULT_PIPELINE_ID : DEFAULT_PIPELINE_ID;
    const p = findPipeline(pipelines, pid);
    return !p || p.isDefault ? null : p.stages.filter((s) => !s.outcome);
  }, [picked, dealPipelines, pipelines]);
  const bulkStageChoices = bulkStages ? bulkStages.map((s) => ({ value: s.id, label: s.name })) : OPEN_STAGES.map((s) => ({ value: s, label: stageLabel(s, workMode) }));

  const applyBulkStage = async () => {
    const plan = planBulkStage({ emails: picked, stage: bulkStage, dealPipelines, dealStages, pipelines });
    if (!plan.ok) { setBulkMsg(plan.error); return; }
    if (plan.changes.length === 0) { setBulkMsg("Those deals are already in that stage."); return; }
    setBulkBusy(true);
    const r = await onBulkChanges?.(plan.changes, "stage");
    setBulkBusy(false);
    setBulkMsg(`${r?.done || 0} moved${r?.failed ? `, ${r.failed} could not be saved` : ""}${plan.unchanged ? `, ${plan.unchanged} already there` : ""}.`);
    if (r && r.failed === 0) setPicked([]);
  };

  const applyBulkTags = async (adding) => {
    const plan = planBulkTags({ emails: picked, add: adding ? bulkTag : [], remove: adding ? [] : bulkTag, currentTags: tagsByEmail });
    if (!plan.ok) { setBulkMsg(plan.error); return; }
    if (plan.changes.length === 0) { setBulkMsg("Nothing to change for those deals."); return; }
    setBulkBusy(true);
    const r = await onBulkChanges?.(plan.changes, "tags");
    setBulkBusy(false);
    setBulkMsg(`${r?.done || 0} updated${r?.failed ? `, ${r.failed} could not be saved` : ""}${plan.capped ? `, ${plan.capped} over the tag limit` : ""}${plan.unchanged ? `, ${plan.unchanged} unchanged` : ""}.`);
    if (r && r.failed === 0) setPicked([]);
  };

  const saveCurrentView = () => {
    const r = addView(views, { name: viewName, search: searchTerm, filter });
    if (!r.ok) { setViewMsg(r.error); return; }
    setViews(r.list);
    storeViews(r.list);
    setActiveView(viewName.trim());
    setViewName("");
    setViewMsg("View saved in this browser.");
  };

  const applyView = (name) => {
    const v = views.find((x) => x.name === name);
    if (!v) { setActiveView(""); return; }
    setSearchTerm(v.search);
    setFilter(v.filter);
    setActiveView(v.name);
    setViewMsg("");
  };

  const deleteActiveView = () => {
    const next = removeView(views, activeView);
    setViews(next);
    storeViews(next);
    setActiveView("");
    setViewMsg("View deleted.");
  };
  // The stages a deal can move to: its own pipeline's (undefined = the default pipeline's fixed stages).
  const stagesFor = (email) => {
    const pid = dealPipelines[email] || DEFAULT_PIPELINE_ID;
    const p = findPipeline(pipelines, pid);
    return !p || p.isDefault ? undefined : p.stages;
  };
  // The add form: the pipeline is the one its stage belongs to; picking a pipeline selects its first stage.
  const addPipeline = pipelineOfStage(addForm.stage) || DEFAULT_PIPELINE_ID;
  const addStages = addPipeline === DEFAULT_PIPELINE_ID ? undefined : findPipeline(pipelines, addPipeline)?.stages;

  // AI drafts for a deal (next-step email, proposal, or a re-engagement email for a lost deal). A draft only: it opens in the owner's own email app.
  const askDraft = async (kind, lead, titlePrefix) => {
    setClosing({ busy: true, error: "", draft: null });
    try {
      const res = await fetch("/api/ai-deal-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, email: lead.email }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) { setClosing({ busy: false, error: d.error || "Could not create a draft right now.", draft: null }); return; }
      setClosing({ busy: false, error: "", draft: { lead, to: lead.email, title: `${titlePrefix}: ${lead.company}`, subject: d.draft.subject, body: d.draft.body, source: d.source } });
    } catch { setClosing({ busy: false, error: "Could not reach the server.", draft: null }); }
  };
  const askClosingDraft = (lead) => askDraft("closing", lead, "Next step");
  // Short WhatsApp and SMS drafts, and call briefs. The owner opens each one in their own app and presses send.
  const [chat, setChat] = useState({ busy: false, error: "", kind: "", text: "", phone: "" });
  const askChatDraft = async (lead, kind) => {
    setChat({ busy: true, error: "", kind, text: "", phone: lead.phone || "" });
    try {
      const res = await fetch("/api/ai-channel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, email: lead.email, company: lead.company, stage: lead.stage, note: lead.note || lead.lastNote || "" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) { setChat({ busy: false, error: d.error || "Could not create the draft right now.", kind, text: "", phone: "" }); return; }
      setChat({ busy: false, error: "", kind, text: d.text, phone: lead.phone || "" });
    } catch { setChat({ busy: false, error: "Could not reach the server.", kind, text: "", phone: "" }); }
  };
  const chatLink = () => (chat.kind === "whatsapp" ? whatsappLink(chat.phone, chat.text) : chat.kind === "sms" ? smsLink(chat.phone, chat.text) : "");
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Enhanced lead data with CRM information (the page already merged notes / follow-ups / last contact).
  const crmLeads = useMemo(() => {
    return leads.map((lead) => ({
      ...lead,
      score: leadScores[lead.email] || 0,
      stage: dealStages[lead.email] || "new",
      qualification: dealQual[lead.email] || null,
      ownerId: dealOwners[lead.email] || "",
      replied: !!repliedLeads[lead.email] || lead.replied === true,
      company: lead.business || lead.company || "Unknown",
      // Real value if the user set one; otherwise the default, clearly marked as an estimate.
      value: dealValues[lead.email] || defaultDealValue,
      valueIsEstimate: !dealValues[lead.email],
    }));
  }, [leads, leadScores, dealStages, repliedLeads, dealValues, dealQual, dealOwners, defaultDealValue]);

  const selectedLead = useMemo(() => crmLeads.find((l) => l.email === selectedEmail) || null, [crmLeads, selectedEmail]);
  useEffect(() => { setRenaming(false); }, [selectedEmail]); // opening another lead closes the rename box

  // Filter leads
  const filteredLeads = useMemo(() => {
    let filtered = crmLeads;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (lead) =>
          lead.business?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          lead.company?.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    // Apply status filter
    switch (filter) {
      case "hot":
        filtered = filtered.filter((lead) => lead.score >= 75);
        break;
      case "replied":
        filtered = filtered.filter((lead) => lead.replied);
        break;
      case "followup":
        filtered = filtered.filter((lead) => lead.nextFollowUp);
        break;
      case "new":
        filtered = filtered.filter((lead) => normalizeStage(lead.stage) === "new");
        break;
      default:
        break;
    }

    return filtered;
  }, [crmLeads, filter, searchTerm]);

  const tableColumns = [
    {
      key: "select",
      label: "",
      render: (value, lead) => (
        <input
          type="checkbox"
          aria-label={`Select ${lead.email}`}
          checked={picked.includes(lead.email)}
          onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, lead.email] : prev.filter((x) => x !== lead.email)))}
        />
      ),
    },
    {
      key: "company",
      label: "Company",
      render: (value, lead) => (
        <div className="max-w-[6.5rem] md:max-w-none">
          <div className="font-medium text-gray-900 dark:text-white truncate md:whitespace-normal">
            {value}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 truncate md:whitespace-normal" title={lead.email}>
            {lead.email}
          </div>
        </div>
      ),
    },
    {
      key: "score",
      hideOnMobile: true,
      label: "Score",
      render: (value) => (
        <div className="flex items-center space-x-2">
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              value >= 75
                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                : value >= 50
                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                  : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
            }`}
          >
            {value}/100
          </span>
        </div>
      ),
    },
    {
      key: "stage",
      label: "Stage",
      render: (value, lead) => (
        <select
          value={normalizeStage(value)}
          onChange={(e) => onUpdateLead?.(lead.email, { stage: e.target.value })}
          className="text-xs md:text-sm max-w-[6.5rem] md:max-w-none border border-gray-300 dark:border-gray-600 rounded px-1 md:px-2 py-1 bg-white dark:bg-gray-700"
        >
          <StageOptions mode={workMode} stages={stagesFor(lead.email)} />
        </select>
      ),
    },
    {
      key: "lastContact",
      hideOnMobile: true, // below 1360px: keep Company, Stage and Actions on screen; the rest is in "View"
      label: "Last Contact",
      render: (value) =>
        value ? new Date(value).toLocaleDateString() : "Never",
    },
    {
      key: "nextFollowUp",
      hideOnMobile: true, // below 1360px: keep Company, Stage and Actions on screen; the rest is in "View"
      label: "Next Follow-up",
      render: (value) =>
        value ? new Date(value).toLocaleDateString() : "None",
    },
    {
      key: "value",
      hideOnMobile: true, // below 1360px: keep Company, Stage and Actions on screen; the rest is in "View"
      label: "Value",
      render: (value, lead) => (
        <label className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-200">
          $
          <input
            key={`${lead.email}-${lead.valueIsEstimate ? "est" : value}`}
            type="number"
            min="0"
            inputMode="decimal"
            aria-label={`Deal value for ${lead.email}`}
            defaultValue={lead.valueIsEstimate ? "" : value}
            placeholder={`${value} (est.)`}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== "" && Number(v) !== (lead.valueIsEstimate ? null : value)) onUpdateLead?.(lead.email, { value: v });
            }}
            className="w-24 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700"
          />
          {currencyOptions.length > 1 && (
            <select aria-label={`Charge currency for ${lead.email}`} value={dealCurrencies[lead.email] || ""} onChange={(e) => onUpdateLead?.(lead.email, { chargeCurrency: e.target.value })} className="border border-gray-300 dark:border-gray-600 rounded px-1 py-1 bg-white dark:bg-gray-700">
              {currencyOptions.map((c, i) => <option key={c.code} value={i === 0 ? "" : c.code}>{c.code}</option>)}
            </select>
          )}
        </label>
      ),
    },
    {
      key: "billing",
      hideOnMobile: true, // below 1360px the Billing column is hidden with the other detail columns
      label: "Billing",
      render: (value, lead) => {
        const b = billingByEmail[lead.email];
        if (!b) return <span className="text-xs text-gray-400 dark:text-gray-500">No invoice</span>;
        const tone = b.tone === "red" ? "text-red-600 dark:text-red-400" : b.tone === "amber" ? "text-amber-700 dark:text-amber-300" : "text-green-700 dark:text-green-400";
        return <span className={`text-xs font-medium ${tone}`}>{b.text}</span>;
      },
    },
    {
      key: "actions",
      label: "Actions",
      render: (value, lead) => (
        <div className="flex flex-col md:flex-row gap-2 md:gap-0 md:space-x-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedEmail(lead.email);
              setShowLeadModal(true);
            }}
          >
            View
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onScheduleFollowUp?.(lead.email)}
          >
            <span className="md:hidden">Remind 3d</span><span className="hidden md:inline">Remind me in 3 days</span>
          </Button>
        </div>
      ),
    },
  ];

  const stats = {
    total: crmLeads.length,
    hot: crmLeads.filter((l) => l.score >= 75).length,
    replied: crmLeads.filter((l) => l.replied).length,
    // In pipeline: the default qualified-to-negotiation stages, and any open custom stage. Won: a won stage of any pipeline.
    pipeline: crmLeads.filter((l) => PIPELINE_STAGES.includes(normalizeStage(l.stage)) || isOpenCustomStage(pipelines, l.stage)).length,
    won: crmLeads.filter((l) => stageOutcome(pipelines, l.stage) === "won").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            CRM Dashboard
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your leads and deals
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>Add Lead</Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {stats.total}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Total Leads
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {stats.hot}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Hot Leads
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.replied}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Replied</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {stats.pipeline}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              In Pipeline
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {stats.won}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Closed Won
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Board: one column per stage of the chosen pipeline */}
      <PipelineBoard pipelines={pipelines} dealPipelines={dealPipelines} dealStages={dealStages} dealValues={dealValues} leads={leads} />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search leads..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "all", label: "All" },
                { key: "hot", label: "Hot (score 75+)" },
                { key: "replied", label: "Replied" },
                { key: "followup", label: "Needs Follow-up" },
                { key: "new", label: "New" },
              ].map(({ key, label }) => (
                <Button
                  key={key}
                  variant={filter === key ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setFilter(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leads Table */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Leads
          </h3>
        </CardHeader>
        <CardContent>
          {crmLeads.length === 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              No leads yet. Leads appear here automatically when you send outreach from the dashboard, or add one yourself (a referral, an inbound enquiry) with Add Lead.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select aria-label="Saved views" value={activeView} onChange={(e) => applyView(e.target.value)} className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700">
              <option value="">Saved views</option>
              {views.map((v) => (<option key={v.name} value={v.name}>{v.name}</option>))}
            </select>
            {activeView && <Button size="sm" variant="secondary" onClick={deleteActiveView}>Delete view</Button>}
            <input aria-label="Name this view" value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Name this view" className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700" />
            <Button size="sm" variant="secondary" onClick={saveCurrentView} disabled={!viewName.trim()}>Save view</Button>
            <Button size="sm" variant="secondary" onClick={() => setPicked(selectedEmails(filteredLeads.map((l) => l.email)).slice(0, BULK_MAX))}>Select shown</Button>
            {viewMsg && <span role="status" className="text-xs text-gray-600 dark:text-gray-400">{viewMsg}</span>}
          </div>
          {picked.length > 0 && (
            <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30">
              <span className="text-sm font-medium text-gray-900 dark:text-white">{picked.length} selected</span>
              <select aria-label="Move selected to stage" value={bulkStage} onChange={(e) => setBulkStage(e.target.value)} className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700">
                <option value="">Move to stage</option>
                {bulkStageChoices.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
              </select>
              <Button size="sm" onClick={applyBulkStage} disabled={!bulkStage || bulkBusy}>Move</Button>
              <input aria-label="Tag for selected" value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} placeholder="Tag" className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 w-28" />
              <Button size="sm" variant="secondary" onClick={() => applyBulkTags(true)} disabled={!bulkTag.trim() || bulkBusy}>Add tag</Button>
              <Button size="sm" variant="secondary" onClick={() => applyBulkTags(false)} disabled={!bulkTag.trim() || bulkBusy}>Remove tag</Button>
              <Button size="sm" variant="secondary" onClick={() => setPicked([])}>Clear</Button>
              {bulkMsg && <span role="status" className="text-xs text-gray-700 dark:text-gray-300">{bulkMsg}</span>}
            </div>
          )}
          <DataTable
            data={filteredLeads}
            columns={tableColumns}
            searchable={false} // We have our own search
            pagination={true}
            pageSize={10}
          />
        </CardContent>
      </Card>

      {/* Lead Detail Modal */}
      <Modal
        isOpen={showLeadModal}
        onClose={() => setShowLeadModal(false)}
        title="Lead Details"
        size="lg"
      >
        {selectedLead && (
          <div className="space-y-6">
            {/* Lead Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Company
                </label>
                {renaming ? (
                  <form
                    className="mt-1 flex gap-2"
                    onSubmit={async (ev) => { ev.preventDefault(); const ok = await onRename?.(selectedLead.email, nameDraft); if (ok) setRenaming(false); }}
                  >
                    <input
                      autoFocus
                      value={nameDraft}
                      maxLength={120}
                      onChange={(ev) => setNameDraft(ev.target.value)}
                      aria-label="Business name"
                      className="min-h-[44px] w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm text-gray-900 dark:text-white"
                    />
                    <Button type="submit" size="sm">Save</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setRenaming(false)}>Cancel</Button>
                  </form>
                ) : (
                  <p className="mt-1 text-sm text-gray-900 dark:text-white">
                    {selectedLead.company}
                    {onRename && (
                      <button
                        type="button"
                        onClick={() => { setNameDraft(selectedLead.company === NO_NAME_LABEL ? "" : selectedLead.company); setRenaming(true); }}
                        className="ml-2 min-h-[44px] text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {selectedLead.company === NO_NAME_LABEL ? "Add a name" : "Rename"}
                      </button>
                    )}
                  </p>
                )}
              </div>
              {onSaveTags ? <TagBox value={selectedLead.tags || []} onSave={(tags) => onSaveTags(selectedLead.email, tags)} /> : null}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Email
                </label>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">
                  {selectedLead.email}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Phone
                </label>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">
                  {selectedLead.phone || "N/A"}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Lead Score
                </label>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">
                  {selectedLead.score}/100
                </p>
              </div>
            </div>

            {/* Pipeline: moving a deal to another pipeline puts it on that pipeline's first stage (logged on the deal) */}
            {pipelines.length > 0 && (
              <div>
                <label htmlFor="deal-pipeline" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Pipeline
                </label>
                <select
                  id="deal-pipeline"
                  value={dealPipelines[selectedLead.email] || DEFAULT_PIPELINE_ID}
                  onChange={(e) => onUpdateLead?.(selectedLead.email, { pipelineId: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value={DEFAULT_PIPELINE_ID}>Default</option>
                  {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Moving puts the deal on that pipeline&apos;s first stage. The move is logged on the deal.</p>
              </div>
            )}

            {/* Deal Stage */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Deal Stage
              </label>
              <select
                value={normalizeStage(selectedLead.stage)}
                onChange={(e) =>
                  onUpdateLead?.(selectedLead.email, { stage: e.target.value })
                }
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <StageOptions mode={workMode} stages={stagesFor(selectedLead.email)} />
              </select>
            </div>

            {/* Owner: who works this deal (a label from the Team list in Account; commission is worked out from it on the Business page) */}
            {team.length > 0 && (
              <div>
                <label htmlFor="deal-owner" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Owner</label>
                <select
                  id="deal-owner"
                  value={team.some((m) => m.id === selectedLead.ownerId) ? selectedLead.ownerId : ""}
                  onChange={(e) => onUpdateLead?.(selectedLead.email, { ownerId: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Nobody yet</option>
                  {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}

            {/* Qualification */}
            {(() => {
              const q = qualificationSummary(selectedLead.qualification);
              const tone = q.label === "Strong" ? "text-green-700 dark:text-green-300" : q.label === "Weak" ? "text-red-700 dark:text-red-300" : "text-gray-600 dark:text-gray-300";
              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Qualification</label>
                    <span className={`text-sm font-medium ${tone}`}>{q.label}{q.answered ? ` (${q.yes} yes, ${q.no} no)` : ""}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {QUAL_FIELDS.map((f) => (
                      <label key={f.id} className="block text-sm text-gray-700 dark:text-gray-300">
                        {f.label}
                        <select
                          value={q.answers[f.id]}
                          onChange={(e) => onUpdateLead?.(selectedLead.email, { qualification: { ...q.answers, [f.id]: e.target.value } })}
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          aria-label={`${f.label}: ${f.hint}`}
                        >
                          <option value="unknown">Not sure yet</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Four quick answers show which deals deserve your time. They do not change your forecast.</p>
                </div>
              );
            })()}

            {/* Possible duplicates: the same phone, website or business name under another email. Merging keeps one lead. */}
            {(() => {
              const dups = findDuplicatesOf(selectedLead, leads);
              if (!dups.length) return null;
              return (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Possible duplicates</label>
                  <ul className="space-y-2">
                    {dups.map(({ lead, reasons }) => (
                      <li key={lead.email} className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <span className="min-w-0 break-all">
                          {lead.email} <span className="text-xs text-gray-500 dark:text-gray-400">({reasons.join(", ")})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => onMergeLead?.(lead.email, selectedLead.email)}
                          className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 min-h-[36px]"
                        >
                          Merge into this lead
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            {/* Buying committee: who else decides. A B2B deal needs a champion and an economic buyer. */}
            {(() => {
              const q = qualificationSummary(selectedLead.qualification);
              const committee = q.answers.committee || [];
              const gaps = committeeGaps(committee);
              const save = (next) => onUpdateLead?.(selectedLead.email, { qualification: { ...q.answers, committee: next } });
              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Buying committee</label>
                    <span className={`text-xs ${gaps.length ? "text-amber-700 dark:text-amber-300" : "text-gray-600 dark:text-gray-300"}`}>
                      {gaps.length ? `Still to map: ${gaps.join(", ")}` : "Champion and economic buyer mapped"}
                    </span>
                  </div>
                  {committee.map((m, i) => (
                    <div key={i} className="flex flex-wrap gap-2 mb-2">
                      <input
                        value={m.name}
                        onChange={(e) => save(committee.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                        placeholder="Name"
                        aria-label="Committee member name"
                        className="flex-1 min-w-[10rem] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <select
                        value={m.role}
                        onChange={(e) => save(committee.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}
                        aria-label="Committee member role"
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        {COMMITTEE_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={() => save(committee.filter((_, j) => j !== i))}
                        className="px-3 py-2 text-sm text-red-700 dark:text-red-300"
                        aria-label="Remove committee member"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {committee.length < COMMITTEE_MAX && (
                    <button type="button" onClick={() => save([...committee, { name: "", role: "other" }])} className="text-sm text-blue-700 dark:text-blue-300 underline">
                      + Add a person
                    </button>
                  )}
                </div>
              );
            })()}

            {PIPELINE_STAGES.includes(normalizeStage(selectedLead.stage)) && (
              <div className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/20 p-3">
                <div className="text-sm font-medium text-gray-900 dark:text-white">Move this deal forward</div>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">The AI writes a short email for the current stage using your notes and qualification. You edit it and send it yourself.</p>
                {closing.error && <p role="alert" className="text-xs text-red-600 dark:text-red-300 mt-1">{closing.error}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" loading={closing.busy} disabled={closing.busy} onClick={() => askClosingDraft(selectedLead)}>Draft the next-step email</Button>
                  <Button size="sm" loading={chat.busy && chat.kind === "whatsapp"} disabled={chat.busy} onClick={() => askChatDraft(selectedLead, "whatsapp")}>Draft WhatsApp</Button>
                  <Button size="sm" loading={chat.busy && chat.kind === "sms"} disabled={chat.busy} onClick={() => askChatDraft(selectedLead, "sms")}>Draft SMS</Button>
                  <Button size="sm" loading={chat.busy && chat.kind === "call_brief"} disabled={chat.busy} onClick={() => askChatDraft(selectedLead, "call_brief")}>Call brief</Button>
                  {chat.error && <p className="text-xs text-red-600 dark:text-red-300" role="alert">{chat.error}</p>}
                  {chat.text && (
                    <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                      {chat.text}
                      {chat.kind !== "call_brief" && (
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          {chatLink()
                            ? <a href={chatLink()} target="_blank" rel="noopener noreferrer" className="text-xs underline text-blue-600 dark:text-blue-300">{chat.kind === "whatsapp" ? "Open in WhatsApp" : "Open in SMS"} (you press send)</a>
                            : <span className="text-xs text-gray-500 dark:text-gray-400">Add the phone number with its country code to open this in your app.</span>}
                        </div>
                      )}
                    </div>
                  )}
                  <Button size="sm" variant="outline" disabled={closing.busy} onClick={() => askDraft("proposal", selectedLead, "Proposal")}>Draft a proposal</Button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">A proposal uses only your notes, the qualification answers, what you sell and the deal value. With no real value set, it leaves [price to confirm] for you to fill in.</p>
              </div>
            )}

            {normalizeStage(selectedLead.stage) === "closed_lost" && REVIVABLE_REASONS.includes(dealLost[selectedLead.email]?.reason) && (() => {
              const lost = dealLost[selectedLead.email];
              const check = reviveCheck({ stage: "closed_lost", lostReason: lost.reason, quietDays: lost.quietDays });
              return (
                <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-3">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Worth another look</div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">This deal was lost for a reason that often changes with time. One light check-in costs almost nothing and is the cheapest lead you will ever work. You edit it and send it yourself.</p>
                  {closing.error && <p role="alert" className="text-xs text-red-600 dark:text-red-300 mt-1">{closing.error}</p>}
                  {!check.ok && <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{check.reason}</p>}
                  <Button size="sm" className="mt-2" loading={closing.busy} disabled={closing.busy || !check.ok} onClick={() => askDraft("revive", selectedLead, "Check-in")}>Draft a check-in email</Button>
                </div>
              );
            })()}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Notes
              </label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {selectedLead.notes?.length > 0 ? (
                  selectedLead.notes.map((note, index) => (
                    <div
                      key={index}
                      className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md"
                    >
                      <p className="text-sm text-gray-900 dark:text-white">
                        {note.text}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {new Date(note.timestamp).toLocaleString()}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No notes yet
                  </p>
                )}
              </div>
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={noteText}
                  placeholder="Add a note..."
                  aria-label="Add a note"
                  onChange={(e) => setNoteText(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && noteText.trim()) {
                      onAddNote?.(selectedLead.email, noteText);
                      setNoteText("");
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!noteText.trim()}
                  onClick={() => {
                    onAddNote?.(selectedLead.email, noteText);
                    setNoteText("");
                  }}
                >
                  Save note
                </Button>
                <Button size="sm" onClick={() => onScheduleFollowUp?.(selectedLead.email)}>
                  Remind me in 3 days
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
      <DraftModal
        draft={closing.draft}
        onClose={() => setClosing({ busy: false, error: "", draft: null })}
        onOpened={() => { const l = closing.draft?.lead; setClosing({ busy: false, error: "", draft: null }); if (l) onUpdateLead?.(l.email, { touch: true }); }}
      />
      {/* Add Lead Modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add a lead" size="md">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setAdding(true);
            const ok = await onAddLead?.(addForm);
            setAdding(false);
            if (ok) {
              setShowAdd(false);
              setAddForm({ email: "", businessName: "", stage: "qualified", value: "", source: "referral", country: "" });
            }
          }}
          className="space-y-4"
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">
            For people who did not come from your cold email: referrals, inbound enquiries, walk-ins. They count in your pipeline and forecast like any other deal.
          </p>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email
            <input type="email" required value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
          </label>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Business name (optional)
            <input type="text" value={addForm.businessName} onChange={(e) => setAddForm({ ...addForm, businessName: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {pipelines.length > 0 && (
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Pipeline
                <select value={addPipeline} onChange={(e) => setAddForm({ ...addForm, stage: e.target.value === DEFAULT_PIPELINE_ID ? "qualified" : findPipeline(pipelines, e.target.value).stages[0].id })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value={DEFAULT_PIPELINE_ID}>Default</option>
                  {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            )}
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Stage
              <select value={addForm.stage} onChange={(e) => setAddForm({ ...addForm, stage: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                <StageOptions mode={workMode} stages={addStages} />
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Deal value (optional, in your currency)
              <input type="number" min="0" inputMode="decimal" value={addForm.value} placeholder={`${defaultDealValue} (est.)`}
                onChange={(e) => setAddForm({ ...addForm, value: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </label>
          </div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Country code (optional, for example LK, GB or DE)
            <input type="text" maxLength={2} value={addForm.country} onChange={(e) => setAddForm({ ...addForm, country: e.target.value.replace(/[^a-z]/gi, "").toUpperCase() })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">Used for consent rules and routing. Leave blank to use the email's domain.</span>
          </label>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Where did they come from?
            <select value={addForm.source} onChange={(e) => setAddForm({ ...addForm, source: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              {LEAD_SOURCES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" disabled={adding || !addForm.email}>{adding ? "Adding…" : "Add lead"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default CRM;
