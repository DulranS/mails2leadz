"use client";

// The management review agenda, built from the records as they stand. Owner and manager only (the tab). Copy it into a note or a message;
// Balancr sends nothing.
import { Button, Card, EmptyState } from "@/components/ui";
import { useToast } from "@/contexts/ToastContext";
import { useReviewSections } from "@/components/ops/useReviewSections";

export default function ReviewPackPanel() {
  const toast = useToast();
  const { sections, text } = useReviewSections();
  if (sections.length === 0) {
    return <EmptyState title="Nothing needs the review today" body="Nothing is overdue, off target, uncovered or waiting for a decision. The review is quick when the records are kept up to date." />;
  }
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted">Built from the records as they stand. For each item: decide, name the owner, and set the day.</div>
        <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(text).then(() => toast.success("Copied", "Paste it into a note or a message"))}>Copy the agenda</Button>
      </div>
      {sections.map((s) => (
        <Card key={s.key} className="p-4">
          <div className="text-sm font-medium">{s.title} <span className="text-muted font-normal">({s.items.length})</span></div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {s.items.map((item, i) => <li key={i} className="pl-3 border-l border-line">{item}</li>)}
          </ul>
        </Card>
      ))}
    </div>
  );
}
