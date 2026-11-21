"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { todayIso } from "@/lib/format";
import type { JournalEntry } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Label,
  Modal,
  PageHeader,
  StatGridSkeleton,
  Stat,
  TableCardSkeleton,
  Textarea,
} from "@/components/ui";

// A few days short of a full week — a person writing this the day after
// their usual slot shouldn't get nagged, but a genuine lapse should still
// show. 6 days (not 7) so "logged last Monday, it's now the following
// Monday" still counts as on-track rather than flagged.
const WEEK_MS = 6 * 24 * 60 * 60 * 1000;

export default function JournalPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner"]);
  const { journalEntries, addJournalEntry, updateJournalEntry, deleteJournalEntry, loading } = useData();
  const toast = useToast();
  const [content, setContent] = useState("");
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);

  const sorted = useMemo(
    () => [...journalEntries].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [journalEntries]
  );

  // Genuinely new gap this fixes: there was no journal/reflection feature
  // in the app at all, so a stated "write lessons learned weekly" habit had
  // nowhere to live. This banner is the whole point — a passive list nobody
  // checks doesn't build a weekly habit, a nudge that shows up when you're
  // behind does.
  const mostRecent = sorted[0];
  const isBehind = !mostRecent || Date.now() - new Date(mostRecent.date).getTime() > WEEK_MS;

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Lessons journal" />
        <StatGridSkeleton count={2} className="lg:grid-cols-2" />
        <TableCardSkeleton rows={4} cols={2} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Lessons journal" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6">
        <Stat label="Entries logged" value={journalEntries.length.toString()} />
        <Stat
          label="Last entry"
          value={mostRecent ? mostRecent.date : "None yet"}
          tone={isBehind ? "bad" : "good"}
          sub={isBehind ? "no lesson logged this week yet" : "on track"}
        />
      </div>

      <Card className="mb-6">
        <div className="text-sm font-medium mb-0.5">Write this week&apos;s lesson</div>
        <div className="text-xs text-muted mb-4">
          One block of free text is enough — what went wrong, what worked, what you&apos;d do differently next
          time. No tags or categories to fill in; the point is that it&apos;s quick enough to actually keep doing.
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!content.trim()) return;
            setBusy(true);
            try {
              await addJournalEntry({ date, content: content.trim() });
              toast.success("Lesson logged");
              setContent("");
              setDate(todayIso());
            } catch (err) {
              toast.error("Couldn't save", toastableErrorMessage(err));
            }
            setBusy(false);
          }}
          className="space-y-3"
        >
          <Field>
            <Label>Date</Label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full min-h-[44px] sm:min-h-0 sm:w-48 bg-panel2 border border-line rounded-md px-3 py-2 text-base sm:text-sm text-fg focus:outline-none focus:border-amber-dim"
            />
          </Field>
          <Field>
            <Label>What did you learn this week?</Label>
            <Textarea
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. Skipped a pre-purchase inspection to save time and ate a hidden repair cost on the resale — never skip it again, even under time pressure."
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save lesson"}
            </Button>
          </div>
        </form>
      </Card>

      {sorted.length === 0 ? (
        <EmptyState title="No lessons logged yet" body="Write your first one above." />
      ) : (
        <div className="space-y-3">
          {sorted.map((entry) => (
            <Card key={entry.id}>
              <div className="flex items-start justify-between gap-3">
                <Badge tone="default">{entry.date}</Badge>
                <div className="flex gap-3 shrink-0">
                  <button
                    onClick={() => setEditing(entry)}
                    className="text-xs text-muted hover:text-fg"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm("Delete this entry? This can't be undone.")) return;
                      deleteJournalEntry(entry.id)
                        .then(() => toast.success("Deleted"))
                        .catch((err) => toast.error("Couldn't delete", toastableErrorMessage(err)));
                    }}
                    className="text-xs text-muted hover:text-bad"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="text-sm text-fg mt-2 whitespace-pre-wrap">{entry.content}</div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit lesson">
        {editing && (
          <JournalEditForm
            entry={editing}
            onCancel={() => setEditing(null)}
            onSave={async (values) => {
              try {
                await updateJournalEntry(editing.id, values);
                toast.success("Entry updated");
                setEditing(null);
              } catch (err) {
                toast.error("Couldn't save", toastableErrorMessage(err));
              }
            }}
          />
        )}
      </Modal>
    </>
  );
}

function JournalEditForm({
  entry,
  onSave,
  onCancel,
}: {
  entry: JournalEntry;
  onSave: (values: { date: string; content: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(entry.date);
  const [content, setContent] = useState(entry.content);
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({ date, content: content.trim() });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <Field>
        <Label>Date</Label>
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full min-h-[44px] sm:min-h-0 bg-panel2 border border-line rounded-md px-3 py-2 text-base sm:text-sm text-fg focus:outline-none focus:border-amber-dim"
        />
      </Field>
      <Field>
        <Label>Lesson</Label>
        <Textarea required value={content} onChange={(e) => setContent(e.target.value)} />
      </Field>
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
