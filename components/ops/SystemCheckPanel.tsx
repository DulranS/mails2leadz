"use client";

// System check (owner only): how much of the database this session has been sent, which collections carry the most, and how long the first data took to
// arrive. Documents delivered are a close proxy for database reads. Read only; "Start a fresh count" clears this tab's figures and nothing else.
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { summary, resetStats } from "@/lib/loadStats";
import { windowingDue } from "@/lib/loadBudget";

export default function SystemCheckPanel() {
  const [tick, setTick] = useState(0);
  const s = summary();
  const due = windowingDue({ totalDocs: s.totalDocs, top: s.top.map((t) => ({ name: t.name, docs: t.docs })) });
  void tick;
  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">This session</div>
        <div className="text-xs text-muted">
          Documents delivered from the database since this tab opened (a close proxy for reads). The first load carries most of them; after that, only changes arrive.
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><div className="text-xs text-muted">Live listeners</div><div className="num font-medium">{s.listeners}</div></div>
          <div><div className="text-xs text-muted">Documents delivered</div><div className="num font-medium">{s.totalDocs.toLocaleString()}</div></div>
          <div><div className="text-xs text-muted">Deliveries</div><div className="num font-medium">{s.totalDeliveries.toLocaleString()}</div></div>
          <div><div className="text-xs text-muted">Slowest first data</div><div className="num font-medium">{s.slowestFirstMs} ms</div></div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setTick((t) => t + 1)}>Refresh</Button>
          <Button variant="ghost" onClick={() => { resetStats(); setTick((t) => t + 1); }}>Start a fresh count</Button>
        </div>
      </Card>
      {due.due && (
        <Card className="p-4 text-sm">
          <div className="font-medium">Windowing is due</div>
          <div className="text-xs text-muted mt-1">{due.reason} The data layer loads each collection whole; a business this size should have its older records loaded on request. Tell the person who looks after the system.</div>
        </Card>
      )}
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Where the documents come from (largest first)</div>
        {s.top.length === 0 && <div className="text-xs text-muted">Nothing has arrived yet.</div>}
        {s.top.map((t) => (
          <div key={t.name} className="flex items-center justify-between gap-3 text-xs border-t border-line pt-2">
            <span className="font-mono">{t.name}</span>
            <span className="num">{t.docs.toLocaleString()} docs · {t.deliveries} deliveries · first at {t.firstMs ?? 0} ms</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
