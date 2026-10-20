import React, { useState, useMemo, useEffect } from "react";
import { Card, CardHeader, CardContent } from "./ui/Card";
import { Button } from "./ui/Button";
import { DataTable } from "./ui/DataTable";
import { Modal } from "./ui/Modal";
import { ALL_STAGES, STAGE_LABELS, normalizeStage, WON_STAGES, PIPELINE_STAGES } from "../../lib/deal-utils.js";
import { LEAD_SOURCES, REVIVABLE_REASONS, reviveCheck } from "../../lib/deal-utils.js";
import { NO_NAME_LABEL } from "../../lib/lead-name.js";
import { QUAL_FIELDS, qualificationSummary } from "../../lib/deal-extras.js";
import DraftModal from "./DraftModal";

// One stage vocabulary everywhere (same as the dashboard + Business Value page).
const StageOptions = () =>
  ALL_STAGES.map((st) => (
    <option key={st} value={st}>
      {STAGE_LABELS[st]}
    </option>
  ));

export const CRM = ({
  leads = [],
  contacts = {},
  repliedLeads = {},
  leadScores = {},
  dealStages = {},
  dealValues = {},
  dealQual = {},
  dealOwners = {},
  dealLost = {},
  team = [],
  defaultDealValue = 1000,
  onUpdateLead,
  onAddNote,
  onScheduleFollowUp,
  onAddLead,
  onRename,
}) => {
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [addForm, setAddForm] = useState({ email: "", businessName: "", stage: "qualified", value: "", source: "referral" });
  const [adding, setAdding] = useState(false);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [closing, setClosing] = useState({ busy: false, error: "", draft: null });

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
          <StageOptions />
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
        </label>
      ),
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
    pipeline: crmLeads.filter((l) => PIPELINE_STAGES.includes(normalizeStage(l.stage))).length,
    won: crmLeads.filter((l) => WON_STAGES.includes(normalizeStage(l.stage))).length,
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
                <StageOptions />
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

            {PIPELINE_STAGES.includes(normalizeStage(selectedLead.stage)) && (
              <div className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/20 p-3">
                <div className="text-sm font-medium text-gray-900 dark:text-white">Move this deal forward</div>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">The AI writes a short email for the current stage using your notes and qualification. You edit it and send it yourself.</p>
                {closing.error && <p role="alert" className="text-xs text-red-600 dark:text-red-300 mt-1">{closing.error}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" loading={closing.busy} disabled={closing.busy} onClick={() => askClosingDraft(selectedLead)}>Draft the next-step email</Button>
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
              setAddForm({ email: "", businessName: "", stage: "qualified", value: "", source: "referral" });
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Stage
              <select value={addForm.stage} onChange={(e) => setAddForm({ ...addForm, stage: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                <StageOptions />
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
