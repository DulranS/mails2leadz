"use client";

// The next two weeks: rostered hours against booked hours for each day, with the days that need attention marked first.
import { Badge, Card, EmptyState } from "@/components/ui";
import { useCapacity } from "@/components/ops/useCapacity";
import { useData } from "@/contexts/DataContext";
import { eventClashes } from "@/lib/events";
import { todayIso } from "@/lib/format";
import { addIsoDays } from "@/lib/operations";
import type { CapacityFlag } from "@/lib/capacity";

const LABEL: Record<CapacityFlag, string> = {
  over: "more booked than rostered",
  unstaffed: "booked, nobody rostered",
  tight: "nearly full",
  spare: "spare capacity",
  ok: "balanced",
  none: "nothing booked",
};
const TONE: Record<CapacityFlag, "bad" | "amber" | "good" | "default"> = { over: "bad", unstaffed: "bad", tight: "amber", spare: "good", ok: "good", none: "default" };
const RANK: Record<CapacityFlag, number> = { unstaffed: 0, over: 1, tight: 2, spare: 3, ok: 4, none: 5 };

export default function CapacityPanel() {
  const days = useCapacity(14);
  const { events, bookings } = useData();
  const today = todayIso();
  const horizon = addIsoDays(today, 14);
  const venueClashes = events
    .filter((e) => e.status === "scheduled" && e.date >= today && e.date <= horizon)
    .map((e) => ({ event: e, with: eventClashes(e, bookings) }))
    .filter((x) => x.with.length > 0);
  const anything = days.some((d) => d.bookedHours > 0 || d.staffedHours > 0);
  if (!anything) {
    return <EmptyState title="Nothing rostered or booked in the next two weeks" body="Set the rota and take bookings, and this shows whether the team can cover them day by day." />;
  }
  const attention = days.filter((d) => d.flag === "over" || d.flag === "unstaffed").length;
  const sorted = [...days].sort((a, b) => RANK[a.flag] - RANK[b.flag] || a.date.localeCompare(b.date));
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted">
        {attention ? <span className="text-bad">{attention} day{attention === 1 ? "" : "s"} need more people or fewer bookings.</span> : "Every booked day is covered by the rota."} Hours are rostered shifts, less anyone on approved leave.
      </div>
      {venueClashes.length > 0 && (
        <Card className="p-3.5 border-bad">
          <div className="text-sm font-medium text-bad">Venue clashes: {venueClashes.length} event{venueClashes.length === 1 ? "" : "s"} share a room or time with a booking</div>
          {venueClashes.map((x) => (
            <div key={x.event.id} className="text-xs mt-1">{x.event.date} {x.event.startTime} · {x.event.name}{x.event.resource ? ` (${x.event.resource})` : ""} · clashes with {x.with.map((b) => b.customerName).join(", ")}</div>
          ))}
        </Card>
      )}
      {sorted.map((d) => (
        <Card key={d.date} className="p-3.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium num">{d.date}</span>
            <Badge tone={TONE[d.flag]}>{LABEL[d.flag]}</Badge>
          </div>
          <div className="text-xs text-muted mt-1">
            <span className="num">{d.bookedHours}</span> hours booked · <span className="num">{d.staffedHours}</span> hours rostered
            {d.utilizationPct !== null && <> · <span className="num">{d.utilizationPct}%</span> of rostered time</>}
          </div>
        </Card>
      ))}
    </div>
  );
}
