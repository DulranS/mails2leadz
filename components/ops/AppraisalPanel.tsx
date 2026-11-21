"use client";

// Investment appraisal: each project's net present value, IRR, payback, profitability index and equivalent annual annuity at the discount rate,
// capital rationing when there is a budget, and the post-investment review of one project against its forecast. Nothing is saved or spent here.
import { useMemo, useState } from "react";
import { Badge, Card, Field, Input, Label, Textarea } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { formatMoney } from "@/lib/format";
import { parseProjects, npv, irr, paybackYears, profitabilityIndex, equivalentAnnualAnnuity, capitalRationing, postInvestmentAudit, realRate } from "@/lib/capitalBudget";

const DEFAULT = "New delivery van; 2400; 800, 800, 800, 800\nSecond till; 300; 150, 150, 150\nShop extension; 5000; 1200, 1400, 1600, 1800, 2000";

export default function AppraisalPanel() {
  const { settings } = useData();
  const [text, setText] = useState(DEFAULT);
  const [rate, setRate] = useState("12");
  const [inflation, setInflation] = useState("");
  const [budget, setBudget] = useState("");
  const [forecast, setForecast] = useState("");
  const [actual, setActual] = useState("");
  const cur = settings.currency;
  const r = (Number(rate) || 0) / 100;
  const parsed = useMemo(() => parseProjects(text), [text]);
  const rows = useMemo(() => parsed.projects.map((p) => ({ p, npv: npv(p, r), irr: irr(p), payback: paybackYears(p), pi: profitabilityIndex(p, r), eaa: equivalentAnnualAnnuity(p, r) })), [parsed, r]);
  const ration = budget.trim() !== "" ? capitalRationing(parsed.projects, r, Number(budget)) : null;
  const audit = useMemo(() => {
    const f = forecast.split(/[,\s]+/).filter(Boolean).map(Number), a = actual.split(/[,\s]+/).filter(Boolean).map(Number);
    if (!f.length || !a.length || !f.every(Number.isFinite) || !a.every(Number.isFinite)) return null;
    return postInvestmentAudit(f, a);
  }, [forecast, actual]);
  const realR = inflation.trim() !== "" ? realRate(r, (Number(inflation) || 0) / 100) : null;

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Projects to appraise</div>
        <div className="text-xs text-muted">One per line: name; money out now; yearly cash in, after tax (year 1 first, separated by commas).</div>
        <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        {parsed.errors.map((e) => <div key={e} className="text-xs text-bad">{e}</div>)}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field><Label>Discount rate (% a year, risk-adjusted)</Label><Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
          <Field><Label>Expected inflation (% a year, optional)</Label><Input inputMode="decimal" value={inflation} onChange={(e) => setInflation(e.target.value)} /></Field>
          <Field><Label>Money available to invest (optional)</Label><Input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></Field>
        </div>
        {realR !== null && <div className="text-xs text-muted">The discount rate is {Number(rate)}% nominal, about {(realR * 100).toFixed(2)}% after inflation.</div>}
      </Card>
      <div className="space-y-2">
        {rows.map(({ p, npv: n, irr: i, payback, pi, eaa }) => (
          <Card key={p.name} className="p-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{p.name}</span>
              <Badge tone={n > 0 ? "good" : "bad"}>{n > 0 ? "creates value" : "destroys value"}</Badge>
            </div>
            <div className="text-xs text-muted mt-1">
              NPV <span className="num">{formatMoney(n, cur)}</span> · IRR <span className="num">{i === null ? "none" : `${(i * 100).toFixed(1)}%`}</span> · payback <span className="num">{payback === null ? "never" : `${payback} years`}</span> · profitability index <span className="num">{pi ?? "—"}</span> · equivalent yearly value <span className="num">{formatMoney(eaa, cur)}</span>
            </div>
          </Card>
        ))}
      </div>
      {ration && (
        <Card className="p-4 space-y-2">
          <div className="text-sm font-medium">With {formatMoney(Number(budget), cur)} available</div>
          <div className="text-xs text-muted">Projects are funded in order of profitability index while the money lasts. A project that no longer fits is skipped, not split.</div>
          <div className="text-xs">Fund: {ration.funded.map((p) => p.name).join(", ") || "nothing"}</div>
          <div className="text-xs">Skipped: {ration.skipped.map((p) => p.name).join(", ") || "none"}</div>
          <div className="text-xs">Value created: <span className="num">{formatMoney(ration.valueCreated, cur)}</span> · unspent <span className="num">{formatMoney(ration.unspent, cur)}</span></div>
        </Card>
      )}
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">After an investment: actual against the forecast</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Forecast cash each year</Label><Input value={forecast} onChange={(e) => setForecast(e.target.value)} placeholder="800, 800, 800" /></Field>
          <Field><Label>Actual cash each year</Label><Input value={actual} onChange={(e) => setActual(e.target.value)} placeholder="700, 650, 800" /></Field>
        </div>
        {audit && (
          <div className="text-xs space-y-1">
            <div>{audit.behindPlan ? <span className="text-bad">Behind the case that justified it by {formatMoney(Math.abs(audit.finalVariance), cur)}.</span> : <span className="text-good">On or ahead of the forecast.</span>}</div>
            {audit.rows.map((x) => <div key={x.year}>Year {x.year}: forecast <span className="num">{x.forecast}</span>, actual <span className="num">{x.actual}</span>, running difference <span className="num">{x.cumulativeVariance}</span></div>)}
          </div>
        )}
      </Card>
    </div>
  );
}
