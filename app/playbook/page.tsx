"use client";

// Playbook: how things are done (procedures) and what has been agreed (contract dates), written down so the business does
// not live in one person's head. Plain text and dates only: it changes nothing in the books and drafts or checks no legal
// document. Entries that need a look (a procedure past its review date, a contract whose notice period has started) rise
// to the top. See lib/playbook.ts for the exact rules.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { todayIso } from "@/lib/format";
import { openPrintWindow } from "@/lib/print";
import { PLAYBOOK_KINDS, type PlaybookEntry, type PlaybookKind } from "@/lib/types";
import {
  buildPlaybookHtml,
  cleanPlaybookInput,
  contractStatus,
  reviewStatus,
  sortPlaybook,
  summarizePlaybook,
  validatePlaybookInput,
  attention,
  type PlaybookInput,
} from "@/lib/playbook";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Modal, PageHeader, Select, TableCardSkeleton, Textarea } from "@/components/ui";

type Tone = "default" | "good" | "bad" | "amber";

const KIND_LABEL = new Map(PLAYBOOK_KINDS.map((k) => [k.value, k.label]));

function toInput(e: PlaybookEntry): PlaybookInput {
  return {
    kind: e.kind,
    title: e.title,
    body: e.body,
    owner: e.owner,
    reviewEveryDays: e.reviewEveryDays,
    lastReviewed: e.lastReviewed,
    counterparty: e.counterparty,
    startDate: e.startDate,
    endDate: e.endDate,
    noticeDays: e.noticeDays,
  };
}

function statusBadges(e: PlaybookEntry, today: string): { tone: Tone; label: string }[] {
  const out: { tone: Tone; label: string }[] = [];
  const r = reviewStatus(e, today);
  if (r.state === "overdue") out.push({ tone: "bad", label: `Review overdue by ${r.daysOverdue} day${r.daysOverdue === 1 ? "" : "s"}` });
  else if (r.state === "due_soon") out.push({ tone: "amber", label: `Review due ${r.dueOn}` });
  const c = contractStatus(e, today);
  if (c.state === "act_now") out.push({ tone: "bad", label: c.decideBy === c.endsOn ? `Ends ${c.endsOn}: act now` : `Act now: decide by ${c.decideBy}` });
  else if (c.state === "ending_soon") out.push({ tone: "amber", label: `Decide by ${c.decideBy}` });
  else if (c.state === "ended") out.push({ tone: "default", label: `Ended ${c.endsOn}` });
  else if (c.state === "running") out.push({ tone: "good", label: `Until ${c.endsOn}` });
  return out;
}

export default function PlaybookPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { role } = useAuth();
  const { playbook, settings, loading, addPlaybookEntry, updatePlaybookEntry, deletePlaybookEntry } = useData();
  const toast = useToast();
  const canWrite = can(role, "manage:playbook");
  const canDelete = can(role, "delete:records");
  const today = todayIso();

  const [filter, setFilter] = useState<"all" | PlaybookKind>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PlaybookEntry | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const summary = useMemo(() => summarizePlaybook(playbook, today), [playbook, today]);
  const shown = useMemo(() => sortPlaybook(playbook.filter((e) => filter === "all" || e.kind === filter), today), [playbook, filter, today]);

  if (guardLoading || !allowed) return null;
  if (loading) {
    return (
      <>
        <PageHeader title="Playbook" />
        <TableCardSkeleton rows={4} cols={3} />
      </>
    );
  }

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save(input: PlaybookInput) {
    // Clean first, so fields hidden for this kind (a contract's dates on a procedure) are never checked or saved.
    const clean = cleanPlaybookInput(input);
    const problem = validatePlaybookInput(clean);
    if (problem) {
      toast.error("Can't save yet", problem);
      return false;
    }
    try {
      if (editing) await updatePlaybookEntry(editing.id, clean);
      else await addPlaybookEntry(clean);
      toast.success(editing ? "Saved" : "Added to the playbook", clean.title);
      setFormOpen(false);
      setEditing(null);
      return true;
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
      return false;
    }
  }

  async function markReviewed(e: PlaybookEntry) {
    try {
      await updatePlaybookEntry(e.id, cleanPlaybookInput({ ...toInput(e), lastReviewed: today }));
      toast.success("Marked as reviewed", e.title);
    } catch (err) {
      toast.error("Couldn't update", toastableErrorMessage(err));
    }
  }

  function print(e: PlaybookEntry) {
    if (!openPrintWindow(buildPlaybookHtml(e, settings, today))) toast.error("Pop-up blocked", "Allow pop-ups for this site to print.");
  }

  return (
    <>
      <PageHeader
        title="Playbook"
        action={
          canWrite ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              + New entry
            </Button>
          ) : undefined
        }
      />
      <p className="text-sm text-muted -mt-3 mb-5 max-w-2xl">
        Write down how the work is done and what has been agreed, so the business keeps running when you are away and nothing renews or lapses by surprise. This is
        your own reference: Balancr does not draft or check legal documents.
      </p>

      {playbook.length === 0 ? (
        <EmptyState
          title="Nothing written down yet"
          body="Start with the three things that live only in your head: how you open and close, how an order or job goes from request to paid, and every contract with an end date."
          action={
            canWrite ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Write the first one
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="text-sm">
              {summary.act === 0 && summary.watch === 0 ? (
                <span className="text-good font-medium">Nothing needs attention.</span>
              ) : (
                <>
                  {summary.act > 0 && <span className="text-bad font-medium">{summary.act} need{summary.act === 1 ? "s" : ""} action. </span>}
                  {summary.watch > 0 && <span className="text-amber-soft font-medium">{summary.watch} coming up. </span>}
                </>
              )}
              <span className="text-muted">
                {summary.procedures} procedure{summary.procedures === 1 ? "" : "s"}, {summary.contracts} contract{summary.contracts === 1 ? "" : "s"}
                {summary.other > 0 ? `, ${summary.other} other` : ""}.
              </span>
            </div>
            <div className="sm:w-48">
              <Select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value as "all" | PlaybookKind)}>
                <option value="all">Show everything</option>
                {PLAYBOOK_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}s
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {shown.length === 0 ? (
            <Card className="text-sm text-muted text-center py-8">Nothing of that kind yet.</Card>
          ) : (
            <div className="space-y-3">
              {shown.map((e) => {
                const badges = statusBadges(e, today);
                const att = attention(e, today);
                const expanded = open.has(e.id);
                const longBody = !!e.body && (e.body.split("\n").length > 3 || e.body.length > 220);
                const r = reviewStatus(e, today);
                const meta = [
                  e.owner ? `Owner: ${e.owner}` : "",
                  e.counterparty ? `With: ${e.counterparty}` : "",
                  r.dueOn && r.state === "ok" ? `Next review ${r.dueOn}` : "",
                  e.lastReviewed ? `Last reviewed ${e.lastReviewed}` : "",
                ].filter(Boolean);
                return (
                  <Card key={e.id} className={`!p-4 ${att === "act" ? "border-bad/40" : att === "watch" ? "border-amber/40" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium min-w-0 break-words">{e.title}</div>
                      <Badge>{KIND_LABEL.get(e.kind) ?? e.kind}</Badge>
                      {badges.map((b, i) => (
                        <Badge key={i} tone={b.tone}>
                          {b.label}
                        </Badge>
                      ))}
                    </div>
                    {meta.length > 0 && <div className="text-xs text-muted mt-1">{meta.join(" · ")}</div>}
                    {e.body && (
                      <div className={`text-sm mt-2 whitespace-pre-wrap break-words ${expanded ? "" : "line-clamp-3"}`}>{e.body}</div>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-0 mt-2">
                      {longBody && (
                        <button onClick={() => toggle(e.id)} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                          {expanded ? "Show less" : "Show all"}
                        </button>
                      )}
                      {canWrite && r.state !== "none" && (
                        <button onClick={() => markReviewed(e)} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                          Mark reviewed today
                        </button>
                      )}
                      <button onClick={() => print(e)} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                        Print
                      </button>
                      {canWrite && (
                        <button
                          onClick={() => {
                            setEditing(e);
                            setFormOpen(true);
                          }}
                          className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]"
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete "${e.title}"? This can't be undone.`)) return;
                            try {
                              await deletePlaybookEntry(e.id);
                              toast.success("Deleted", e.title);
                            } catch (err) {
                              toast.error("Couldn't delete", toastableErrorMessage(err));
                            }
                          }}
                          className="text-xs text-bad hover:underline min-h-[44px] sm:min-h-[32px]"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? "Edit entry" : "New playbook entry"}
      >
        {formOpen && (
          <PlaybookForm
            key={editing?.id ?? "new"}
            initial={editing}
            onSave={save}
            onCancel={() => {
              setFormOpen(false);
              setEditing(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}

function PlaybookForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: PlaybookEntry | null;
  onSave: (i: PlaybookInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<PlaybookKind>(initial?.kind ?? "procedure");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [owner, setOwner] = useState(initial?.owner ?? "");
  const [reviewEvery, setReviewEvery] = useState(initial?.reviewEveryDays?.toString() ?? "");
  const [counterparty, setCounterparty] = useState(initial?.counterparty ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [noticeDays, setNoticeDays] = useState(initial?.noticeDays?.toString() ?? "");
  const [busy, setBusy] = useState(false);

  const isContract = kind === "contract";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({
          kind,
          title,
          body,
          owner: owner || undefined,
          reviewEveryDays: reviewEvery.trim() === "" ? undefined : Number(reviewEvery),
          lastReviewed: initial?.lastReviewed,
          counterparty: counterparty || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          noticeDays: noticeDays.trim() === "" ? undefined : Number(noticeDays),
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <Field>
        <Label>What is it?</Label>
        <Select value={kind} onChange={(e) => setKind(e.target.value as PlaybookKind)}>
          {PLAYBOOK_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field>
        <Label>Title</Label>
        <Input
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isContract ? "e.g. Shop lease, main supplier agreement" : "e.g. Opening the shop, Handling a return"}
        />
      </Field>
      <Field>
        <Label>{isContract ? "Key terms, in your own words" : kind === "procedure" ? "The steps, one per line" : "Text"}</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          placeholder={isContract ? "What was agreed, what it costs, how to end it, who to call. Keep the signed copy safe elsewhere." : "1. Unlock and switch on the till\n2. Count the float and record it\n3. …"}
        />
      </Field>
      {isContract && (
        <>
          <Field>
            <Label>Who is it with? (optional)</Label>
            <Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="e.g. the landlord, a supplier, a client" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field>
              <Label>Starts (optional)</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field>
              <Label>Ends or renews</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
            <Field>
              <Label>Notice needed (days)</Label>
              <Input type="number" min="0" step="1" inputMode="numeric" value={noticeDays} onChange={(e) => setNoticeDays(e.target.value)} placeholder="e.g. 60" />
            </Field>
          </div>
          <div className="text-xs text-muted -mt-2">
            With an end date, the entry is flagged as the notice period starts, so you can renew, renegotiate or end it before you are locked in.
          </div>
        </>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Who is responsible? (optional)</Label>
          <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. Nimal, the shop manager" />
        </Field>
        <Field>
          <Label>Re-read and update every (days, optional)</Label>
          <Input type="number" min="1" step="1" inputMode="numeric" value={reviewEvery} onChange={(e) => setReviewEvery(e.target.value)} placeholder={isContract ? "usually blank" : "e.g. 90"} />
        </Field>
      </div>
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
