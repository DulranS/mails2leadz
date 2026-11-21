"use client";

// Customer feedback: the one question "how likely are you to recommend us, 0 to 10?", logged as the answers come in.
// Shows the score (NPS) over the last 90 days against the 90 before, the low scores nobody has got back to yet, the
// recent buyers who have not been asked, and the happy ones to ask for an introduction. Text and numbers only: it
// changes nothing in the books and sends nothing. See lib/feedback.ts for the exact rules.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { todayIso } from "@/lib/format";
import type { FeedbackChannel, FeedbackEntry } from "@/lib/types";
import {
  cleanFeedbackInput, customersToAsk, FEEDBACK_CHANNELS, MAX_FEEDBACK_COMMENT, npsGroup, npsVerdict, summarizeFeedback,
  validateFeedbackInput, type FeedbackInput,
} from "@/lib/feedback";
import MessageButton from "@/components/MessageButton";
import ReviewReplyDraft from "@/components/ReviewReplyDraft";
import TestimonialControl from "@/components/TestimonialControl";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Modal, PageHeader, Select, Stat, TableCardSkeleton, Textarea } from "@/components/ui";

const CHANNEL_LABEL = new Map(FEEDBACK_CHANNELS.map((c) => [c.value, c.label]));

function toInput(f: FeedbackEntry): FeedbackInput {
  return { customerName: f.customerName, contact: f.contact, score: f.score, comment: f.comment, receivedOn: f.receivedOn, channel: f.channel, followedUp: f.followedUp };
}

const groupTone = (score: number) => {
  const g = npsGroup(score);
  return g === "promoter" ? "good" : g === "passive" ? "default" : "bad";
};

export default function FeedbackPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { role } = useAuth();
  const { feedbackEntries, customers, sales, loading, addFeedbackEntry, updateFeedbackEntry, deleteFeedbackEntry } = useData();
  const toast = useToast();
  const canWrite = can(role, "manage:support");
  const canDelete = can(role, "delete:records");
  const today = todayIso();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FeedbackEntry | null>(null);
  const [prefill, setPrefill] = useState<{ name: string; contact?: string } | null>(null);

  const summary = useMemo(() => summarizeFeedback(feedbackEntries, today), [feedbackEntries, today]);
  const contactByName = useMemo(() => new Map(customers.map((c) => [c.name.trim().toLowerCase().replace(/\s+/g, " "), c.contact])), [customers]);
  const contactOf = (name: string) => contactByName.get(name.trim().toLowerCase().replace(/\s+/g, " "));
  const toAsk = useMemo(
    () => customersToAsk(sales.filter((s) => !!s.customer).map((s) => ({ customerName: s.customer as string, date: s.date })), feedbackEntries, today),
    [sales, feedbackEntries, today]
  );

  if (guardLoading || !allowed) return null;
  if (loading) {
    return (
      <>
        <PageHeader title="Customer feedback" />
        <TableCardSkeleton rows={4} cols={3} />
      </>
    );
  }

  async function save(input: FeedbackInput, existing: FeedbackEntry | null): Promise<boolean> {
    const clean = cleanFeedbackInput(input);
    const problem = validateFeedbackInput(clean);
    if (problem) {
      toast.error("Can't save yet", problem);
      return false;
    }
    try {
      if (existing) await updateFeedbackEntry(existing.id, clean);
      else await addFeedbackEntry(clean);
      toast.success(existing ? "Saved" : "Answer logged", `${clean.customerName}: ${clean.score}/10`);
      setFormOpen(false);
      setEditing(null);
      setPrefill(null);
      return true;
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
      return false;
    }
  }

  function openNew(p?: { name: string; contact?: string }) {
    setEditing(null);
    setPrefill(p ?? null);
    setFormOpen(true);
  }

  const newButton = canWrite ? <Button onClick={() => openNew()}>+ Log an answer</Button> : undefined;
  const sorted = [...feedbackEntries].sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.createdAt - a.createdAt);
  const npsTone = summary.nps === null || summary.tooFew ? "default" : summary.nps >= 30 ? "good" : summary.nps >= 0 ? "default" : "bad";

  return (
    <>
      <PageHeader title="Customer feedback" action={newButton} />
      <p className="text-sm text-muted -mt-3 mb-5 max-w-2xl">
        Ask customers one question: how likely are you to recommend us, from 0 to 10? Log each answer here. 9 and 10 are fans, 7 and 8 are neutral, 6 and below are
        unhappy. Balancr sends nothing: the Message link writes the question for you to send yourself.
      </p>

      {feedbackEntries.length === 0 && toAsk.length === 0 ? (
        <EmptyState
          title="No answers yet"
          body="A week or two after a sale, ask the customer the one question and log the number they give. Ten answers or more give a score worth trusting."
          action={canWrite ? <Button onClick={() => openNew()}>Log the first answer</Button> : undefined}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-3">
            <Stat label="Score (last 90 days)" value={summary.nps === null ? "—" : `${summary.nps > 0 ? "+" : ""}${summary.nps}`} sub={summary.nps === null ? "no answers yet" : `from ${summary.answers} answer${summary.answers === 1 ? "" : "s"}`} tone={npsTone} />
            <Stat
              label="Against the 90 days before"
              value={summary.trend === null ? "—" : `${summary.trend > 0 ? "+" : ""}${summary.trend}`}
              sub={summary.trend === null ? "needs answers in both periods" : summary.trend >= 0 ? "better or the same" : "slipping"}
              tone={summary.trend === null ? "default" : summary.trend >= 0 ? "good" : "bad"}
            />
            <Stat label="Average score" value={summary.average === null ? "—" : `${summary.average} / 10`} sub={summary.answers > 0 ? `${summary.promoters} fans · ${summary.passives} neutral · ${summary.detractors} unhappy` : undefined} />
            <Stat label="Low scores to follow up" value={summary.toFollowUp.length.toString()} tone={summary.toFollowUp.length > 0 ? "bad" : "good"} />
          </div>
          <p className="text-sm text-muted mb-5 max-w-2xl">{npsVerdict(summary)}</p>

          {summary.toFollowUp.length > 0 && (
            <Card className="!p-4 mb-5 border-bad/40">
              <div className="text-sm font-medium">Get back to these customers</div>
              <div className="text-xs text-muted mt-0.5 mb-2">Scores of 6 or less in the last 180 days that nobody has followed up. A call from the owner often saves the customer.</div>
              <div className="divide-y divide-line">
                {summary.toFollowUp.map((f) => (
                  <div key={f.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="min-w-0 break-words">
                      <span className="font-medium">{f.customerName}</span> <Badge tone="bad">{f.score}/10</Badge>
                      <div className="text-xs text-muted">{f.receivedOn}{f.comment ? ` · “${f.comment}”` : ""}</div>
                    </div>
                    {canWrite && (
                      <div className="flex gap-x-4 ml-auto">
                        <MessageButton audience="customer" name={f.customerName} contact={f.contact ?? contactOf(f.customerName)} suggested="feedback_followup" />
                        <button
                          onClick={() => save({ ...toInput(f), followedUp: true }, f)}
                          className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]"
                        >
                          Mark followed up
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {canWrite && toAsk.length > 0 && (
            <Card className="!p-4 mb-5">
              <div className="text-sm font-medium">Ask these customers next</div>
              <div className="text-xs text-muted mt-0.5 mb-2">Bought in the last 60 days and not asked in the last 6 months.</div>
              <div className="divide-y divide-line">
                {toAsk.map((c) => (
                  <div key={c.name} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="min-w-0 break-words">
                      <span className="font-medium">{c.name}</span>
                      <div className="text-xs text-muted">last bought {c.lastPurchase}</div>
                    </div>
                    <div className="flex gap-x-4 ml-auto">
                      <MessageButton audience="customer" name={c.name} contact={contactOf(c.name)} suggested="feedback_ask" label="Ask" />
                      <button onClick={() => openNew({ name: c.name, contact: contactOf(c.name) })} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                        Log their answer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {canWrite && summary.referralCandidates.length > 0 && (
            <Card className="!p-4 mb-5">
              <div className="text-sm font-medium">Happy customers: ask for an introduction</div>
              <div className="text-xs text-muted mt-0.5 mb-2">Scores of 9 or 10 in the last 90 days. Referred customers usually cost the least to win.</div>
              <div className="divide-y divide-line">
                {summary.referralCandidates.slice(0, 5).map((f) => (
                  <div key={f.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="min-w-0 break-words">
                      <span className="font-medium">{f.customerName}</span> <Badge tone="good">{f.score}/10</Badge>
                    </div>
                    <div className="ml-auto">
                      <MessageButton audience="customer" name={f.customerName} contact={f.contact ?? contactOf(f.customerName)} suggested="referral" />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="text-sm font-medium mb-2">All answers</div>
          {sorted.length === 0 ? (
            <Card className="text-sm text-muted text-center py-8">Nothing logged yet.</Card>
          ) : (
            <div className="space-y-3">
              {sorted.map((f) => (
                <Card key={f.id} className="!p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium min-w-0 break-words">{f.customerName}</div>
                    <Badge tone={groupTone(f.score)}>{f.score}/10</Badge>
                    {npsGroup(f.score) === "detractor" && (f.followedUp ? <Badge tone="good">Followed up</Badge> : <Badge tone="amber">Not followed up</Badge>)}
                  </div>
                  <div className="text-xs text-muted mt-1">
                    {f.receivedOn}
                    {f.channel ? ` · ${CHANNEL_LABEL.get(f.channel) ?? f.channel}` : ""}
                    {f.contact ? ` · ${f.contact}` : ""}
                  </div>
                  {f.comment && <div className="text-sm mt-2 whitespace-pre-wrap break-words">“{f.comment}”</div>}
                  {f.channel === "online_review" && <ReviewReplyDraft customerName={f.customerName} stars={(f as { reviewStars?: number }).reviewStars} comment={f.comment} />}
                  <TestimonialControl f={f} />
                  <div className="flex flex-wrap gap-x-4 mt-2">
                    {canWrite && (
                      <button
                        onClick={() => {
                          setEditing(f);
                          setPrefill(null);
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
                          if (!confirm(`Delete this answer from ${f.customerName}? This can't be undone.`)) return;
                          try {
                            await deleteFeedbackEntry(f.id);
                            toast.success("Deleted", f.customerName);
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
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setPrefill(null);
        }}
        title={editing ? "Edit answer" : "Log an answer"}
      >
        {formOpen && (
          <FeedbackForm
            key={editing?.id ?? `new-${prefill?.name ?? ""}`}
            initial={editing}
            prefill={prefill}
            customerNames={customers.map((c) => c.name)}
            onSave={(i) => save(i, editing)}
            onCancel={() => {
              setFormOpen(false);
              setEditing(null);
              setPrefill(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}

function FeedbackForm({
  initial,
  prefill,
  customerNames,
  onSave,
  onCancel,
}: {
  initial: FeedbackEntry | null;
  prefill: { name: string; contact?: string } | null;
  customerNames: string[];
  onSave: (i: FeedbackInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [customerName, setCustomerName] = useState(initial?.customerName ?? prefill?.name ?? "");
  const [contact, setContact] = useState(initial?.contact ?? prefill?.contact ?? "");
  const [score, setScore] = useState<string>(initial ? String(initial.score) : "");
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [receivedOn, setReceivedOn] = useState(initial?.receivedOn ?? todayIso());
  const [channel, setChannel] = useState<FeedbackChannel | "">(initial?.channel ?? "");
  const [followedUp, setFollowedUp] = useState(initial?.followedUp ?? false);
  const [busy, setBusy] = useState(false);
  const scoreNum = score.trim() === "" ? NaN : Number(score);
  const low = Number.isInteger(scoreNum) && scoreNum <= 6;

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({ customerName, contact, score: scoreNum, comment, receivedOn, channel: channel || undefined, followedUp });
        setBusy(false);
      }}
    >
      <Field>
        <Label>Customer</Label>
        <Input required list="feedback-customers" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={100} placeholder="Name" />
        <datalist id="feedback-customers">
          {customerNames.slice(0, 500).map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Score (0 to 10)</Label>
          <Input required type="number" inputMode="numeric" min="0" max="10" step="1" value={score} onChange={(e) => setScore(e.target.value)} placeholder="0 to 10" />
        </Field>
        <Field>
          <Label>Answered on</Label>
          <Input required type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>What they said (optional)</Label>
        <Textarea rows={3} maxLength={MAX_FEEDBACK_COMMENT} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="In their own words" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>How it came in (optional)</Label>
          <Select value={channel} onChange={(e) => setChannel(e.target.value as FeedbackChannel | "")}>
            <option value="">Not recorded</option>
            {FEEDBACK_CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>Phone or email (optional)</Label>
          <Input value={contact} maxLength={100} onChange={(e) => setContact(e.target.value)} />
        </Field>
      </div>
      {low && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={followedUp} onChange={(e) => setFollowedUp(e.target.checked)} />
          Someone has already got back to this customer
        </label>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
