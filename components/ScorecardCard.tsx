"use client";
import { Badge, Card } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import type { ScorecardRow } from "@/lib/scorecard";

// The quick scorecard: nine checks on the trailing 12 months, against the targets in the reference sheet (pass 305).
function shown(r: ScorecardRow, currency: string): string {
  if (r.value === null) return "—";
  if (r.unit === "%") return `${r.value}%`;
  if (r.unit === "x") return r.value.toFixed(2);
  return formatMoney(r.value, currency);
}

export default function ScorecardCard({ rows, currency }: { rows: ScorecardRow[]; currency: string }) {
  const judged = rows.filter((r) => r.pass !== null).length;
  const passing = rows.filter((r) => r.pass === true).length;
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="text-sm font-medium">Quick scorecard, last 12 months</div>
        <div className="text-xs text-muted">{judged ? `${passing} of ${judged} pass` : "Not enough figures yet"}</div>
      </div>
      <div className="divide-y divide-line">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="text-fg truncate">{r.label}</div>
              <div className="text-[11px] text-muted">Target: {r.target}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="tabular-nums text-fg">{shown(r, currency)}</span>
              <Badge tone={r.pass === null ? "default" : r.pass ? "good" : "bad"}>
                {r.pass === null ? "—" : r.pass ? "Pass" : "Miss"}
              </Badge>
            </div>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-muted mt-3">
        R&amp;D is the expenses whose category says R&amp;D, research or development. SG&amp;A is selling and admin costs, less that R&amp;D. Debt-to-equity uses loans on the books.
      </div>
    </Card>
  );
}
