"use client";

// The hero's one memorable moment: a small working version of the product's
// core loop, laid out as three numbered steps so a first-time visitor knows
// what to do without reading anything else:
//   1. Tap something a shop owner might say.
//   2. See the entry Balancr fills in (and what it will do to your profit).
//   3. Save it and watch the profit figure move.
// Nothing here talks to a server — it's a worked example the visitor can poke
// at, and every save is reversible, matching the real "Balancr suggests, you
// decide" rule. Wording is deliberately everyday ("what you keep", "running
// costs"), not accounting terms: the audience is a shop owner, not an accountant.
import { useState } from "react";
import TryDemoButton from "@/components/TryDemoButton";

// Sale = emerald, expense = sapphire: the same two colours appear in the
// "where your sales go" bar below (stock = gold, running costs = sapphire,
// profit = emerald), so the demo teaches its own colour key.
const TYPE_TONE = {
  Sale: { chip: "bg-good/10 border-good/30 text-good", pick: "border-good bg-good/[0.07]", dot: "border-good bg-good" },
  Expense: { chip: "bg-info/10 border-info/30 text-info", pick: "border-info bg-info/[0.07]", dot: "border-info bg-info" },
} as const;

const TYPE_LABEL = { Sale: "Sale — money in", Expense: "Expense — money out" } as const;

type Entry = {
  id: string;
  say: string;
  type: "Sale" | "Expense";
  what: string;
  amount: number;
  how: string;
  // One plain sentence on what saving this does to profit.
  effect: string;
  revenue: number;
  cogs: number;
  overhead: number;
};

const BASE = { revenue: 1842000, cogs: 986000, overhead: 312000 };

const ENTRIES: Entry[] = [
  {
    id: "cement",
    say: "sold 2 bags of cement, cash, rs 9000",
    type: "Sale",
    what: "2 × Cement (50 kg)",
    amount: 9000,
    how: "Cash",
    effect: "You sold it for Rs 9,000 and it cost you Rs 6,200, so you make Rs 2,800.",
    revenue: 9000,
    cogs: 6200,
    overhead: 0,
  },
  {
    id: "rent",
    say: "paid the shop rent 45000 from the bank",
    type: "Expense",
    what: "Shop rent",
    amount: 45000,
    how: "Bank transfer",
    effect: "Rent is a running cost, so all Rs 45,000 comes straight off your profit.",
    revenue: 0,
    cogs: 0,
    overhead: 45000,
  },
  {
    id: "tiles",
    say: "10 boxes of tiles to Nimal, on credit, rs 15000",
    type: "Sale",
    what: "10 × Floor tiles",
    amount: 15000,
    how: "On credit — Nimal owes you",
    effect: "Rs 15,000 sale minus Rs 9,800 cost: you make Rs 5,200. Nimal's Rs 15,000 shows under “Money owed” until he pays.",
    revenue: 15000,
    cogs: 9800,
    overhead: 0,
  },
];

const fmt = (n: number) => n.toLocaleString("en-US");
const profitChange = (e: Entry) => e.revenue - e.cogs - e.overhead;

export default function HeroLedger() {
  const [pick, setPick] = useState(0);
  const [saved, setSaved] = useState<string[]>([]);
  const [announce, setAnnounce] = useState("");

  const entry = ENTRIES[pick];
  const isSaved = saved.includes(entry.id);
  const allSaved = saved.length === ENTRIES.length;

  const totals = saved.reduce(
    (t, id) => {
      const e = ENTRIES.find((x) => x.id === id)!;
      return { revenue: t.revenue + e.revenue, cogs: t.cogs + e.cogs, overhead: t.overhead + e.overhead };
    },
    BASE
  );
  const margin = totals.revenue - totals.cogs;
  const net = margin - totals.overhead;
  // Same formula as the real income statement: running costs ÷ the share of each sale you keep
  // after the stock cost.
  const breakEven = Math.round(totals.overhead / (margin / totals.revenue));
  // The three shares are rounded together (largest remainder) so the percentages shown add up to exactly 100
  // instead of 101 when each is rounded on its own.
  const shares = (() => {
    const raw = [totals.cogs, totals.overhead, Math.max(0, net)].map((n) => (n / totals.revenue) * 100);
    const target = Math.round(raw.reduce((a, b) => a + b, 0));
    const floors = raw.map(Math.floor);
    let left = target - floors.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
    for (const { i } of order) {
      if (left <= 0) break;
      floors[i] += 1;
      left -= 1;
    }
    return floors;
  })();

  const change = profitChange(entry);
  const changeText = `${change >= 0 ? "+" : "−"}Rs ${fmt(Math.abs(change))}`;

  function save() {
    setSaved([...saved, entry.id]);
    setAnnounce(`Saved. Your profit is now Rs ${fmt(net + profitChange(entry))}.`);
  }
  function undo() {
    setSaved(saved.filter((id) => id !== entry.id));
    setAnnounce(`Removed. Your profit is now Rs ${fmt(net - profitChange(entry))}.`);
  }

  return (
    <div className="bg-panel border border-line rounded-lg overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <div className="text-sm font-medium text-fg">Try it — takes 10 seconds</div>
        <div className="text-xs text-muted">Sample shop, made-up numbers</div>
      </div>

      {/* Step 1 */}
      <div className="px-5 pb-4">
        <StepLabel n={1}>Tap something that happened today</StepLabel>
        <div role="radiogroup" aria-label="Choose something that happened today" className="mt-2.5 space-y-2">
          {ENTRIES.map((e, i) => {
            const on = i === pick;
            return (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPick(i)}
                className={`w-full text-left flex items-center gap-3 rounded-md border px-3.5 min-h-[48px] py-2.5 text-sm transition-colors ${
                  on ? TYPE_TONE[e.type].pick + " text-fg" : "border-line text-muted hover:text-fg hover:border-muted"
                }`}
              >
                <span
                  aria-hidden
                  className={`shrink-0 w-3.5 h-3.5 rounded-full border ${on ? TYPE_TONE[e.type].dot : "border-muted"}`}
                />
                <span>“{e.say}”</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">That&apos;s all you&apos;d type — just the way you&apos;d say it out loud.</p>
      </div>

      {/* Step 2 */}
      <div className="px-5 py-4 bg-panel2 border-y border-line">
        <StepLabel n={2}>Balancr fills in the form for you</StepLabel>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm">
          <dt className="text-muted">What happened</dt>
          <dd>
            <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${TYPE_TONE[entry.type].chip}`}>
              {TYPE_LABEL[entry.type]}
            </span>
          </dd>
          <dt className="text-muted">Item</dt>
          <dd className="text-fg">{entry.what}</dd>
          <dt className="text-muted">Amount</dt>
          <dd className="text-fg num">Rs {fmt(entry.amount)}</dd>
          <dt className="text-muted">How paid</dt>
          <dd className="text-fg">{entry.how}</dd>
        </dl>
        <p className="mt-3 text-xs text-muted leading-relaxed">{entry.effect}</p>
        <div className="mt-4 flex items-center gap-3 min-h-[44px] flex-wrap">
          {isSaved ? (
            <>
              <span className="text-sm text-good font-medium">Saved to your books ✓</span>
              <button
                type="button"
                onClick={undo}
                className="text-sm text-muted underline underline-offset-4 decoration-line hover:text-fg min-h-[44px] sm:min-h-0"
              >
                Undo
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={save}
                className="inline-flex items-center min-h-[44px] px-5 rounded-md text-sm font-semibold bg-amber text-ink hover:bg-amber-soft transition-colors active:translate-y-px"
              >
                Save to my books
              </button>
              <span className="text-xs text-muted">Nothing is saved until you tap this.</span>
            </>
          )}
        </div>
      </div>

      {/* Step 3 */}
      <div className="px-5 py-5">
        <StepLabel n={3}>Your profit updates by itself</StepLabel>
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted">Profit this month — what you keep</span>
          {isSaved && (
            <span className={`text-xs font-medium num ${change >= 0 ? "text-good" : "text-info"}`} aria-hidden>
              {changeText} from this
            </span>
          )}
        </div>
        <div className="mt-1 font-display text-4xl font-bold num text-good tracking-tight">Rs {fmt(net)}</div>

        <div className="mt-5 text-xs text-muted">Where this month&apos;s Rs {fmt(totals.revenue)} of sales goes</div>
        <div
          className="mt-2 flex h-2.5 rounded-full overflow-hidden bg-line"
          role="img"
          aria-label={`Stock you bought ${shares[0]}%, running costs ${shares[1]}%, profit you keep ${shares[2]}%`}
        >
          <div className="h-full bg-amber transition-[width] duration-500 ease-out" style={{ width: `${(totals.cogs / totals.revenue) * 100}%` }} />
          <div className="h-full bg-info transition-[width] duration-500 ease-out" style={{ width: `${(totals.overhead / totals.revenue) * 100}%` }} />
          <div className="h-full bg-good transition-[width] duration-500 ease-out" style={{ width: `${(Math.max(0, net) / totals.revenue) * 100}%` }} />
        </div>

        <dl className="mt-3 space-y-1.5 text-sm">
          {[
            { label: "Stock you bought to sell", value: totals.cogs, dot: "bg-amber" },
            { label: "Running costs (rent, wages, bills)", value: totals.overhead, dot: "bg-info" },
            { label: "Profit you keep", value: Math.max(0, net), dot: "bg-good" },
          ].map((r, idx) => (
            <div key={r.label} className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2 text-muted">
                <span aria-hidden className={`w-2 h-2 rounded-full shrink-0 ${r.dot}`} />
                {r.label}
              </dt>
              <dd className="num text-fg shrink-0">
                {fmt(r.value)} <span className="text-muted text-xs">{shares[idx]}%</span>
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-xs text-muted leading-relaxed">
          {totals.revenue >= breakEven ? (
            <>
              You only needed to sell Rs <span className="num">{fmt(breakEven)}</span> to cover your running costs. Everything
              sold above that is profit.
            </>
          ) : (
            <>
              You still need to sell Rs <span className="num">{fmt(breakEven - totals.revenue)}</span> more to cover your running
              costs.
            </>
          )}
        </p>

        <div className="mt-5 pt-4 border-t border-line text-sm">
          {allSaved ? (
            <p className="text-fg">That&apos;s the idea. Balancr keeps this up to date every time you add a sale or a cost.</p>
          ) : isSaved ? (
            <p className="text-muted">Nice. Tap another example above to see it change again.</p>
          ) : (
            <p className="text-muted">Tap “Save to my books” above and watch the profit move.</p>
          )}
          <TryDemoButton
            label="Want to try the real thing? Open the sample shop →"
            busyLabel="Opening the sample shop…"
            className="mt-2 text-sm font-medium text-amber-soft hover:text-amber underline underline-offset-4 decoration-amber/40 min-h-[44px] sm:min-h-0 text-left"
          />
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}

function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="shrink-0 w-5 h-5 rounded-full border border-amber/60 text-amber-soft text-[11px] num flex items-center justify-center"
      >
        {n}
      </span>
      <span className="text-sm font-medium text-fg">{children}</span>
    </div>
  );
}
