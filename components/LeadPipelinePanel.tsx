"use client";

// The pipeline summary above the Leads list: filter chips, response time, expected closes, the team's load and the lost
// leads due a second look. Everything shown is computed from the leads already loaded (lib/leadPipeline.ts); nothing is stored.
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { Card } from "@/components/ui";
import { formatMoney, todayIso } from "@/lib/format";
import {
  ACTIVITY_DAYS,
  CLOSE_BUCKET_LABEL,
  LEAD_FILTER_LABEL,
  UNTOUCHED_HOURS,
  closeTiming,
  ownerSummary,
  revisitDue,
  speedSummary,
  type CloseBucket,
  type LeadFilter,
} from "@/lib/leadPipeline";
import type { Lead } from "@/lib/types";

const FILTERS: LeadFilter[] = ["all", "mine", "unassigned", "due", "untouched"];

function fmtMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.round(m / 60)} h`;
  const days = Math.round(m / 1440);
  return days === 1 ? "1 day" : `${days} days`;
}

export default function LeadPipelinePanel({
  leads,
  filter,
  onFilter,
  canWrite,
  currency,
}: {
  leads: Lead[];
  filter: LeadFilter;
  onFilter: (f: LeadFilter) => void;
  canWrite: boolean; // Owner or Manager: sees the team, the close timing and the revisit list
  currency: string;
}) {
  const { updateLead } = useData();
  const toast = useToast();
  const today = todayIso();
  const now = Date.now();
  const speed = speedSummary(leads, now);
  const timing = closeTiming(leads, today);
  const owners = ownerSummary(leads, now, today);
  const revisits = revisitDue(leads, today);
  const anyOpen = leads.some((l) => l.stage !== "won" && l.stage !== "lost");
  const shownFilters = FILTERS.filter((f) => canWrite || f !== "unassigned");

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap gap-2">
        {shownFilters.map((f) => (
          <button
            key={f}
            onClick={() => onFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs min-h-[32px] ${
              filter === f ? "border-amber-soft text-fg" : "border-line text-muted hover:text-fg"
            }`}
          >
            {LEAD_FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      {canWrite && anyOpen && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="p-4">
            <div className="text-sm font-medium">Response time</div>
            <div className="text-xs text-muted mt-1">
              {speed.medianMinutes === null ? (
                "No contacts logged yet. Log a contact on a lead and its response time appears here."
              ) : (
                <>
                  Median time from enquiry to first contact:{" "}
                  <span className="num font-medium text-fg">{fmtMinutes(speed.medianMinutes)}</span> across {speed.measured}{" "}
                  lead{speed.measured === 1 ? "" : "s"}.
                </>
              )}
            </div>
            {speed.untouched > 0 && (
              <div className="text-xs text-bad mt-2">
                {speed.untouched} new lead{speed.untouched === 1 ? " has" : "s have"} had no contact for over {UNTOUCHED_HOURS} hours.
              </div>
            )}
          </Card>
          <Card className="p-4">
            <div className="text-sm font-medium">Expected closes</div>
            <div className="mt-2 space-y-1.5">
              {(Object.keys(CLOSE_BUCKET_LABEL) as CloseBucket[]).map((b) =>
                timing[b].count > 0 ? (
                  <div key={b} className="flex items-center justify-between text-xs gap-3">
                    <span className={b === "overdue" ? "text-bad" : "text-muted"}>{CLOSE_BUCKET_LABEL[b]}</span>
                    <span className="num shrink-0">
                      {timing[b].count}
                      {timing[b].value > 0 && <> · {formatMoney(timing[b].value, currency)}</>}
                    </span>
                  </div>
                ) : null,
              )}
            </div>
          </Card>
        </div>
      )}

      {canWrite && owners.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium">Team</div>
          <div className="text-xs text-muted">
            Open leads, follow-ups due today or earlier, and contacts logged in the last {ACTIVITY_DAYS} days.
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 font-medium">Person</th>
                  <th className="py-1 font-medium text-right">Open</th>
                  <th className="py-1 font-medium text-right">Due</th>
                  <th className="py-1 font-medium text-right">Contacts</th>
                </tr>
              </thead>
              <tbody>
                {owners.map((o) => (
                  <tr key={o.key || "unassigned"} className="border-t border-line">
                    <td className="py-1.5">{o.name}</td>
                    <td className="py-1.5 text-right num">{o.open}</td>
                    <td className="py-1.5 text-right num">{o.dueToday}</td>
                    <td className="py-1.5 text-right num">{o.contactsThisWeek}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {canWrite && revisits.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium">Lost leads to look at again ({revisits.length})</div>
          <div className="mt-2 space-y-2">
            {revisits.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0 truncate">
                  <span className="text-fg">{l.name}</span>
                  <span className="text-muted"> · revisit {l.revisitOn}{l.lostReason ? ` · lost: ${l.lostReason}` : ""}</span>
                </div>
                <button
                  onClick={() =>
                    updateLead(l.id, { revisitOn: "" }).catch((err) => toast.error("Couldn't update", toastableErrorMessage(err)))
                  }
                  className="text-amber-soft hover:underline shrink-0 min-h-[32px]"
                >
                  Looked at it
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
