"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input, Label, Field } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { MAX_PARTNERS, partnerSharesProblem, royaltyDue, royaltyProblem, splitProfit, type PartnerShare } from "@/lib/partnerShare";

// Partners' share of the profit and a franchise royalty, for the period on this page. Worked out here only: nothing is saved,
// posted or sent, and the figures are for the owner to read. The profit is net profit before tax for the whole months in the period.
export default function SharesCard({ profit, revenue, currency }: { profit: number; revenue: number; currency: string }) {
  const [partners, setPartners] = useState<PartnerShare[]>([
    { name: "", sharePct: 50 },
    { name: "", sharePct: 50 },
  ]);
  const [rate, setRate] = useState("");
  const shareProblem = partnerSharesProblem(partners);
  const split = useMemo(() => (shareProblem ? null : splitProfit(profit, partners)), [shareProblem, profit, partners]);
  const rateNum = Number(rate);
  const rateProblem = rate.trim() === "" ? null : royaltyProblem(rateNum);
  const royalty = rate.trim() !== "" && !rateProblem ? royaltyDue(revenue, rateNum) : null;

  return (
    <Card className="mb-6">
      <div className="text-sm font-medium mb-0.5">Partners and franchise</div>
      <div className="text-xs text-muted mb-3">
        Split the profit for this period between partners, or work out a franchise royalty on its revenue. Nothing is saved or posted;
        these are figures to read.
      </div>

      <div className="space-y-2 mb-4">
        {partners.map((p, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-end">
            <Field>
              <Label>Partner {i + 1}</Label>
              <Input value={p.name} placeholder="Name" onChange={(e) => setPartners(partners.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            </Field>
            <Field>
              <Label>Share %</Label>
              <Input
                inputMode="decimal"
                value={String(p.sharePct)}
                onChange={(e) => setPartners(partners.map((x, j) => (j === i ? { ...x, sharePct: Number(e.target.value) } : x)))}
              />
            </Field>
            {partners.length > 2 && (
              <Button variant="ghost" onClick={() => setPartners(partners.filter((_, j) => j !== i))}>Remove</Button>
            )}
          </div>
        ))}
        {partners.length < MAX_PARTNERS && (
          <Button variant="ghost" onClick={() => setPartners([...partners, { name: "", sharePct: 0 }])}>Add partner</Button>
        )}
      </div>

      {shareProblem ? (
        <div className="text-xs text-muted mb-4">{shareProblem}</div>
      ) : (
        <div className="space-y-1 mb-4">
          {split?.map((s) => (
            <div key={s.name} className="text-sm flex justify-between">
              <span>{s.name}</span>
              <span className="num">{formatMoney(s.amount, currency)}</span>
            </div>
          ))}
          <div className="text-xs text-muted">Profit for the period: {formatMoney(profit, currency)}</div>
        </div>
      )}

      <div className="border-t border-line pt-3">
        <Field>
          <Label>Franchise royalty % of revenue (optional)</Label>
          <Input inputMode="decimal" value={rate} placeholder="e.g. 5" onChange={(e) => setRate(e.target.value)} />
        </Field>
        {rateProblem && <div className="text-xs text-bad mt-1">{rateProblem}</div>}
        {royalty !== null && (
          <div className="text-sm mt-2">
            Royalty on {formatMoney(revenue, currency)} of revenue: <span className="num font-medium">{formatMoney(royalty, currency)}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
