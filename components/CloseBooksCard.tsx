"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { todayIso } from "@/lib/format";
import { endOfMonthIso, endOfPreviousMonthIso, formatIsoLong, normalizeClosedThrough } from "@/lib/periodLock";
import { Badge, Button, Card, Field, Label, Select } from "@/components/ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The month-ends the owner can pick: the last 24 completed months, plus the
// currently saved lock if it is older than that (so it always shows).
function monthEndOptions(today: string, current: string | undefined): string[] {
  const options: string[] = [];
  let cursor = endOfPreviousMonthIso(today);
  for (let i = 0; i < 24; i++) {
    options.push(cursor);
    const [y, m] = cursor.split("-").map(Number);
    const prev = m === 1 ? `${y - 1}-12-01` : `${y}-${m - 1 < 10 ? "0" : ""}${m - 1}-01`;
    cursor = endOfMonthIso(prev);
  }
  if (current && !options.includes(current)) options.push(current);
  return options;
}

function optionLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y} — through ${formatIsoLong(iso)}`;
}

// Owner-only (rendered inside the owner-only Settings page). What "closed"
// means is documented in lib/periodLock.ts.
export default function CloseBooksCard() {
  const { settings, setBooksClosedThrough } = useData();
  const toast = useToast();
  const current = normalizeClosedThrough(settings.booksClosedThrough);
  const options = useMemo(() => monthEndOptions(todayIso(), current), [current]);
  const [choice, setChoice] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const selected = choice || options[0];

  async function apply(date: string | null) {
    setBusy(true);
    try {
      await setBooksClosedThrough(date);
      toast.success(date ? `Books closed through ${formatIsoLong(date)}` : "All periods reopened");
      setChoice("");
    } catch (err) {
      toast.error("Couldn't change the lock", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-md">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="text-sm font-medium">Close the books</div>
        {current ? <Badge tone="amber">Closed through {formatIsoLong(current)}</Badge> : <Badge>Nothing closed</Badge>}
      </div>
      <div className="text-xs text-muted mb-4">
        Once a month has been reviewed — or its statements printed for a bank or accountant — close it. After that,
        nobody (Staff, Managers, or you) can add, edit or delete a sale, purchase, one-off expense, payment,
        return, discount, stock adjustment, capital entry or tax payment dated in a closed month. You can reopen at
        any time; every change is recorded in the Activity log. Recurring schedules, payroll, loans and fixed assets
        are not frozen — to change one without touching closed months, end the old one and start a new one.
      </div>
      <Field>
        <Label>Close through</Label>
        <Select value={selected} onChange={(e) => setChoice(e.target.value)}>
          {options.map((iso) => (
            <option key={iso} value={iso}>
              {optionLabel(iso)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap items-center gap-3 pt-3">
        <Button type="button" disabled={busy || selected === current} onClick={() => apply(selected)}>
          {busy ? "Saving…" : current ? "Move the lock" : "Close the books"}
        </Button>
        {current && (
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (confirm(`Reopen all periods? Entries dated on or before ${formatIsoLong(current)} become editable again.`)) {
                void apply(null);
              }
            }}
          >
            Reopen all
          </Button>
        )}
      </div>
    </Card>
  );
}
