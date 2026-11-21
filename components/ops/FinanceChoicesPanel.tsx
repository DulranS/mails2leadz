"use client";

// Loan offers compared on what they really cost, and the choice to invest now or wait. Nothing is saved or agreed here.
import { useMemo, useState } from "react";
import { Badge, Card, Field, Input, Label, Textarea } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { formatMoney } from "@/lib/format";
import { compareLoans, waitingOption, type LoanOffer } from "@/lib/financeChoices";
import { stagedValue, estimateFromHistory } from "@/lib/decisionTree";

const DEFAULT_LOANS = "Bank A; 500000; 14; 36; 5000\nBank B; 500000; 15; 36; 0\nSupplier credit; 500000; 0; 12; 0";

function parseLoans(text: string): { offers: LoanOffer[]; errors: string[] } {
  const offers: LoanOffer[] = [], errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const p = line.split(";").map((s) => s.trim());
    const [name, amount, rate, term, fee] = [p[0], Number(p[1]), Number(p[2]), Number(p[3]), Number(p[4] ?? 0)];
    if (p.length < 4 || !name || ![amount, rate, term, fee].every(Number.isFinite) || amount <= 0 || term <= 0 || rate < 0 || fee < 0) {
      errors.push(`Line ${i + 1} is not "name; amount; annual rate %; months; upfront fee".`);
      return;
    }
    offers.push({ name, amount, annualRatePct: rate, termMonths: term, upfrontFee: fee });
  });
  return { offers, errors };
}

export default function FinanceChoicesPanel() {
  const { settings, monthlyPnL } = useData();
  const cur = settings.currency;
  const [loans, setLoans] = useState(DEFAULT_LOANS);
  const [surplus, setSurplus] = useState("");
  const [outlay, setOutlay] = useState("1000");
  const [npvNow, setNpvNow] = useState("200");
  const [pvUp, setPvUp] = useState("1600");
  const [pvDown, setPvDown] = useState("700");
  const [probUp, setProbUp] = useState("50");
  const [rate, setRate] = useState("10");
  const [stages, setStages] = useState("3");
  const [v0, setV0] = useState("1000");
  const [upF, setUpF] = useState("1.2");
  const [downF, setDownF] = useState("0.8");
  const [pUp, setPUp] = useState("50");
  const [dRate, setDRate] = useState("0");
  const [yieldPct, setYieldPct] = useState("10");
  const [stageCost, setStageCost] = useState("0");
  const [salvage, setSalvage] = useState("500");
  const staged = useMemo(() => stagedValue({
    stages: Math.max(1, Math.floor(Number(stages) || 1)), initialValue: Number(v0) || 0, up: Number(upF) || 1, down: Number(downF) || 1,
    probUp: Math.min(1, Math.max(0, (Number(pUp) || 0) / 100)), rate: (Number(dRate) || 0) / 100, cashYieldPct: Number(yieldPct) || 0,
    stageCost: Number(stageCost) || 0, salvage: Number(salvage) || 0,
  }), [stages, v0, upF, downF, pUp, dRate, yieldPct, stageCost, salvage]);
  const history = useMemo(() => estimateFromHistory(monthlyPnL.map((m) => m.totalRevenue)), [monthlyPnL]);
  const useHistory = () => {
    if (!history) return;
    setPUp(String(Math.round(history.probUp * 100)));
    setUpF(String(history.up));
    setDownF(String(history.down));
  };
  const parsed = useMemo(() => parseLoans(loans), [loans]);
  const results = useMemo(() => compareLoans(parsed.offers, surplus.trim() === "" ? undefined : Number(surplus)), [parsed, surplus]);
  const wait = useMemo(() => waitingOption({
    outlay: Number(outlay) || 0, npvNow: Number(npvNow) || 0, pvUp: Number(pvUp) || 0, pvDown: Number(pvDown) || 0,
    probUp: (Number(probUp) || 0) / 100, rate: (Number(rate) || 0) / 100,
  }), [outlay, npvNow, pvUp, pvDown, probUp, rate]);

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Loan offers, compared on what they cost</div>
        <div className="text-xs text-muted">One per line: name; amount; annual rate %; months; upfront fee. The cheapest on total cost is first; the real annual cost includes the fee.</div>
        <Textarea rows={4} value={loans} onChange={(e) => setLoans(e.target.value)} />
        {parsed.errors.map((e) => <div key={e} className="text-xs text-bad">{e}</div>)}
        <Field className="max-w-xs"><Label>Monthly money you can spare for repayments (optional)</Label><Input inputMode="decimal" value={surplus} onChange={(e) => setSurplus(e.target.value)} /></Field>
        <div className="space-y-2">
          {results.map((r) => (
            <div key={r.name} className="flex items-center gap-2 flex-wrap text-sm">
              <span className="font-medium">{r.name}</span>
              {r.affordable !== null && <Badge tone={r.affordable ? "good" : "bad"}>{r.affordable ? "fits" : "too high"}</Badge>}
              <span className="text-xs text-muted">repay <span className="num">{formatMoney(r.monthlyPayment, cur)}</span> a month · total cost <span className="num">{formatMoney(r.totalCost, cur)}</span> · real annual cost <span className="num">{r.effectiveAnnualPct === null ? "—" : `${r.effectiveAnnualPct}%`}</span></span>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Invest now, or wait a year?</div>
        <div className="text-xs text-muted">If we wait, the project either goes well (chance below) or badly, and in the bad case we do not invest. Waiting is worth something only for that choice.</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field><Label>Money out to invest</Label><Input inputMode="decimal" value={outlay} onChange={(e) => setOutlay(e.target.value)} /></Field>
          <Field><Label>Value if we invest now (NPV)</Label><Input inputMode="decimal" value={npvNow} onChange={(e) => setNpvNow(e.target.value)} /></Field>
          <Field><Label>Chance it goes well (%)</Label><Input inputMode="decimal" value={probUp} onChange={(e) => setProbUp(e.target.value)} /></Field>
          <Field><Label>Value if it goes well (in a year)</Label><Input inputMode="decimal" value={pvUp} onChange={(e) => setPvUp(e.target.value)} /></Field>
          <Field><Label>Value if it goes badly (in a year)</Label><Input inputMode="decimal" value={pvDown} onChange={(e) => setPvDown(e.target.value)} /></Field>
          <Field><Label>Discount rate (%)</Label><Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
        </div>
        <div className="text-sm">
          Waiting is worth <span className="num">{formatMoney(wait.waitValue, cur)}</span>; investing now is worth <span className="num">{formatMoney(wait.investNowValue, cur)}</span>. The option to wait adds <span className="num">{formatMoney(wait.optionValue, cur)}</span>.
          <Badge tone={wait.recommendation === "wait" ? "amber" : "good"}>{wait.recommendation}</Badge>
        </div>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">A staged project: can we stop part way?</div>
        <div className="text-xs text-muted">The asset&apos;s value moves up or down each stage with the chances you give. At each stage we either continue (take that stage&apos;s cash and pay its cost) or stop (take the salvage value). Nothing is saved.</div>
        <div className="text-xs text-muted">
          {history ? <>From your last {history.months} months of revenue: rose {Math.round(history.probUp * 100)}% of the time, on average by a factor of {history.up} when it rose and {history.down} when it fell.</> : "Not enough monthly revenue history to suggest the chances and factors yet (at least six months, with both rises and falls)."}
          {history && <button onClick={useHistory} className="ml-2 underline min-h-[32px]">Use these</button>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field><Label>Stages</Label><Input inputMode="numeric" value={stages} onChange={(e) => setStages(e.target.value)} /></Field>
          <Field><Label>Value today</Label><Input inputMode="decimal" value={v0} onChange={(e) => setV0(e.target.value)} /></Field>
          <Field><Label>Up factor (e.g. 1.2)</Label><Input inputMode="decimal" value={upF} onChange={(e) => setUpF(e.target.value)} /></Field>
          <Field><Label>Down factor (e.g. 0.8)</Label><Input inputMode="decimal" value={downF} onChange={(e) => setDownF(e.target.value)} /></Field>
          <Field><Label>Chance of up (%)</Label><Input inputMode="decimal" value={pUp} onChange={(e) => setPUp(e.target.value)} /></Field>
          <Field><Label>Discount rate per stage (%)</Label><Input inputMode="decimal" value={dRate} onChange={(e) => setDRate(e.target.value)} /></Field>
          <Field><Label>Cash each stage (% of value)</Label><Input inputMode="decimal" value={yieldPct} onChange={(e) => setYieldPct(e.target.value)} /></Field>
          <Field><Label>Cost to continue each stage</Label><Input inputMode="decimal" value={stageCost} onChange={(e) => setStageCost(e.target.value)} /></Field>
          <Field><Label>Salvage if we stop</Label><Input inputMode="decimal" value={salvage} onChange={(e) => setSalvage(e.target.value)} /></Field>
        </div>
        <div className="text-sm">
          Value with the choice to stop: <span className="num">{formatMoney(staged.withChoices, cur)}</span>. Committed to the end: <span className="num">{formatMoney(staged.committed, cur)}</span>. The choice to stop is worth <span className="num">{formatMoney(staged.flexibility, cur)}</span>.
          {staged.stopAtStartIsBetter && <Badge tone="amber">stop now</Badge>}
        </div>
      </Card>
    </div>
  );
}
