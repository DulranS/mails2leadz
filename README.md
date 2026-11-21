# Balancr — bookkeeping for product, service, or hybrid SMEs

*by Syndicate Software Solutions*

Next.js 14 (App Router) + Firebase (Auth + Firestore). Tracks wholesale
orders through to receipt, purchases/service delivery costs, sales,
inventory, unit economics, EOQ reorder planning, employee payroll, recurring
revenue/expenses (incl. marketing/overhead), break-even & overhead coverage,
capital/ROI, and a growth forecast — for an owner running solo or with a
small team. Every business gets three roles out of the box: **Owner** (full
access), **Manager** (day-to-day operations, no delete/payroll/settings),
and **Staff** (log sales, count cash, record customer payments — nothing
else). The owner invites people from the Team page with a shareable link;
there's no shared login, and every permission is enforced server-side in
`firestore.rules`, not just hidden in the UI.

> **Launching this to customers?** Follow `DEPLOY-CHECKLIST.md` and run
> `node scripts/check-launch-readiness.mjs` first.

## What this demonstrates

A full bookkeeping and management-analytics system for owner-run product,
service, or mixed businesses, designed both for running the author's own
businesses and for selling to other small businesses. The accounting is the base; the point is the decision support
on top of it, which is where the business thinking shows.

| Area | What it computes | Where |
|---|---|---|
| Costing and unit economics | Weighted-average cost, COGS per sale, contribution margin, markup vs margin | `computeProductLedger`, `computeSaleEconomics` |
| Profit structure | Gross, contribution, operating and net margin as one waterfall; break-even and overhead coverage | `computeMonthlyPnL`, `computeBreakEven` |
| Profitability lenses | By product, by customer, by location, by project (quoted price vs actual cost, budget alerts) | `computeProductProfitability`, `computeCustomerProfitability`, `computeLocationProfitability`, `computeProjectFinancials` |
| Cash and liquidity | Cash runway, cash-flow forecast, working capital, Profit First allocation | `computeCashRunway`, `computeProfitFirstAllocation` |
| Financial health | Current and quick ratio, debt service coverage, return on assets, asset turnover, payroll-to-revenue | `computeFinancialHealthRatios` |
| Customers and growth | Growth metrics and levers, average order value, LTV, CAC, LTV:CAC and CAC payback, retention, lead conversion, revenue per employee, staff utilization | `computeGrowthMetrics`, `computeCustomerUnitEconomics` |
| Investment decisions | NPV, IRR, payback, WACC, future value, startup capital needed, opportunity scoring, base/strong/downside stress test, safe-to-commit cash after obligations and a buffer | `computeNPV`, `computeIRR`, `computeWACC`, `computeStartupCapitalNeeded`, `computeInvestmentScenarios`, `computeSafeToCommit` |
| Inventory | EOQ, reorder point, per-location stock and transfers | `computeEOQ`, `lib/stockTracking.ts` |
| Risk | Supplier and customer concentration, customer credit limits and exposure, receivables and payables aging | `computeSupplierConcentration`, `computeReceivablesAging` |
| Statements | Income statement, balance sheet, cash flow, period lock | `computeBalanceSheet` |
| Payroll and debt | EPF/ETF employer cost and net pay, loan amortization and portfolio summary | `employerCostPerPeriod`, `computeLoanSchedule` |

That is 80+ exported functions in `lib/calculations.ts`, all pure (no
database access), which is what makes them testable.

**How it's built to be trusted**

- 314 empirical scripts in `scripts/verify-*.ts` check the maths, the
  permission rules, the period lock and the backup coverage against
  constructed cases, alongside `tsc`, lint and a production build.
- Roles (Owner, Manager, Staff, and a read-only Accountant) are enforced server-side in `firestore.rules`,
  not only hidden in the UI.
- It won't show a number the data can't support. Overhead is never allocated
  to a branch by guesswork, and a monthly run-rate is never subtracted from a
  date-ranged total. `CHANGELOG.md` records what was deliberately left out and
  why, next to what was built.
- Nothing is filed with or verified against any tax authority. Statements
  carry that disclaimer on every printed page.

**Where to look first:** `lib/calculations.ts` for the maths,
`lib/stockTracking.ts` for per-location stock, `firestore.rules` for the
permission model, `scripts/` for how each claim is checked.

## Scope decisions

What this deliberately is, and is not. It is part of the design, not a gap:

- **For owner-run SMEs and personal businesses.** Management accounting: the business's own books, reports and decision support.
- **No outside systems.** No tax filing, bank feeds, payroll service or compliance-agency connection. Tax and payroll figures are computed from what the owner records, and the accountant stays in charge of filing.
- **AI suggests, the owner decides.** The assistant fills in entries and answers questions; nothing is saved until a person confirms, and every AI call is capped per business.
- **Manual, human-run accounts.** Every account is set up by hand, billing is bank transfer recorded by the owner, and nothing is ever charged, locked or deleted without a human action (see `DEPLOY-CHECKLIST.md`).
- **The business's own money, not other people's.** Balancr tracks what a business holds and earns on its own investments. It is not a fund manager's, broker's or insurer's back office: client money, regulatory capital, insurance reserves and actuarial valuations are out of scope.
- **Plans never gate features.** Plans differ by team size and support only.
- **Running it with no maintainer:** see `MAINTENANCE.md`.

## 1. Set up Firebase

1. Create a project at https://console.firebase.google.com
2. **Build → Authentication → Get started → Email/Password → Enable**
3. **Build → Firestore Database → Create database** (start in production mode)
4. **Build → Storage → Get started** (needed for the Settings → General logo
   upload — everything else works without this step).
5. Deploy the included security rules (or paste `firestore.rules` /
   `storage.rules` into their respective "Rules" tabs in console and
   publish):
   ```
   npm install -g firebase-tools
   firebase login
   firebase init firestore storage   # point it at this project, keep existing rules files
   firebase deploy --only firestore:rules,storage:rules
   ```
6. **Project settings → General → Your apps → Add app → Web**, copy the config.
7. `cp .env.local.example .env.local` and fill in the six `NEXT_PUBLIC_FIREBASE_*` values.
   (Optional: to enable the AI Assistant, also fill in `DEEPSEEK_API_KEY`
   and the `FIREBASE_*` service-account variables in the same file — see
   [§7 AI Assistant](#7-ai-assistant) for where to get them. Everything
   else works fine without them.)

## 2. Run it

```
npm install
npm run dev
```

Open http://localhost:3000, create an account (email/password — this is the
Firebase Auth user, not a shared login — you're the Owner by default), and
start adding products or services. Invite a Manager or Staff member later
from the Team page once you have data worth sharing.

## 3. Products vs. services

Every offering has a `type`: **product** (physical, wholesale-bought, held as
inventory) or **service** (labor/time-based, no physical stock). Both use the
same costing engine — for a service, "Purchases" becomes "cost entries": log
what it costs you to deliver one unit (labor hours × rate, contractor fee per
job, materials per job) the same way you'd log a wholesale buy. This means a
hybrid business (e.g. selling parts *and* billing labor) gets one unified P&L,
inventory view, and forecast instead of two separate systems. EOQ / reorder
planning only applies to `type: product` — services have nothing to reorder.

## 4. Wholesale orders vs. purchases

**Purchases** (the Purchases page) is the log of stock/cost you already have
in hand — it's what actually feeds the WAC/inventory ledger. **Orders** (the
Orders page) is a separate, optional layer on top of that for products:
place a wholesale order with a supplier, track it (ordered → in transit →
received/cancelled), and see committed spend before anything arrives. Marking
an order "received" — with the actual quantity and cost, which can differ
from what was ordered — automatically creates the matching Purchase entry, so
inventory updates at the moment stock actually lands, not when you merely
placed the order. Units already on order are also subtracted from the
reorder-point check on the Products page, so a pending delivery doesn't get
double-flagged as "reorder now".

## 5. Employees & payroll

Adding an employee (Employees page) — name, role, gross pay, pay cadence, and
their own tax/withholding % — automatically books their pay as a recurring
expense (category "Payroll & labor"), the same mechanism as rent or a
subscription. That's the one and only source of truth: editing an employee's
pay or cadence updates the linked expense in the same batch write; marking
them inactive ends the recurring cost going forward without deleting the
historical record. The employee's tax % is purely a take-home reference (est.
net pay = gross × (1 − tax%)) — it does not change what the business pays
out, since the full gross pay is the actual cash cost regardless of how it
later splits between the employee and the tax authority. This is separate
from the business's own corporate tax rate in Settings.

## 6. How the numbers are calculated

**Inventory costing — Weighted Average Cost (WAC).** Every purchase/cost entry
re-averages the offering's cost: `newWAC = (qtyOnHand*oldWAC + boughtQty*unitCost) / (qtyOnHand+boughtQty)`.
Every sale draws down `qty` at the *current* WAC as its cost of goods sold.
This was chosen over FIFO/LIFO because those require lot-level batch tracking
(which purchase a given sale's units came from) — real bookkeeping overhead
that isn't worth it for a solo-entered ledger. WAC is what most small-business
accounting tools default to for this reason, and it's fully auditable from a
flat purchases + sales list, which is what's stored.

**Optional: each batch's own cost (Settings → "How cost of goods is worked out").**
WAC stays the default. Switching to "Each batch's own cost" costs every sale at the batch(es) it drew from: the batch
picked on the sale form (`Sale.batchPurchaseId`), otherwise the batch expiring soonest, otherwise the oldest delivery.
It is derived from the same flat purchases + sales list (`lib/batchLedger.ts`, `computeProductLedgerByBatch`), so nothing new is
stored apart from the optional pick. Returns go back at the cost the units left at, goods sent to a supplier leave at their own batch's
cost, write-offs take the first-expiring batch, and every unit of cost is conserved (tested over thousands of random histories). Because
costs are derived, switching restates all past profit and stock value: it is refused while the books are closed and is audit-logged.

**Unit economics per sale:**
- `COGS = qty × WAC at time of sale`
- `Variable cost = per-unit fees (packaging, payment, delivery, subcontractor cut) + % of sale price`, configurable globally or per-offering
- `Gross profit = revenue − COGS`
- `Contribution margin = gross profit − variable cost`

**Economic Order Quantity (EOQ)** — product-type offerings only:
`EOQ = sqrt(2 × D × S / H)` where `D` = annual demand (estimated from the last
90 days of sales, annualized), `S` = ordering cost (fixed cost to place one
order), `H` = annual holding cost per unit (`holdingCostPct% × WAC`).
`Reorder point = daily demand × (lead time + safety buffer days)` — when stock on hand
(plus anything already on order) falls to or below this, the Products page flags
"reorder now". The safety buffer is a single optional Settings value (default 0 = no
cushion) and moves only the flag, never the EOQ. Ordering cost, holding %, and lead
time can be set per-product or fall back to Settings defaults.

**Selling by the pack.** The sale forms take quantity and price per pack and convert to
single units before saving (`lib/units.ts`, shared with purchases), so a 5-carton sale is
stored as the same 60-piece sale and nothing downstream can tell them apart. Pack names and
sizes are mirrored onto the cost-stripped staff catalogue. Estimates and repeating invoices
stay in single units.

**Delivery charge line.** `Settings.deliveryProductId` names a service item; when set, the sale
forms offer a delivery amount that is saved as a second Sale (qty 1) of that item sharing the
goods' `invoiceId`, date, customer, payment method and credit terms, in one batch
(`DataContext.addSales`). No engine change: it is service revenue with no COGS, taxed like any
other line, one receivable with the goods (`lib/delivery.ts`, `scripts/verify-delivery.ts`).

**Stock-out (lost sale) log.** `users/{id}/stockOuts`: qty wanted, a price snapshot and a cost
snapshot. Lost revenue = qty × price, lost margin = qty × (price − cost). A memo that no
calculation reads: it never touches stock, revenue, cash or a statement
(`lib/stockOuts.ts`, `scripts/verify-stock-outs.ts`). Owner/Manager only.

**Supplier credit.** An asset (`BalanceSheet.supplierCredit`). Balance per supplier = returns
settled `hold_credit` (goods + tax, read from the SupplierReturn, never copied) + deposits −
credit applied to bills − credit refunded (`users/{id}/supplierCredits`, kinds `deposit`,
`applied`, `refunded`). Deposits and refunds move cash (`MonthlyPnL.supplierDeposits`,
`supplierCreditRefunds`, inside `purchaseCash`); applying credit to a bill moves none and comes
off `PayableLine.amountCredited` and the asset together, so the balance sheet balances.
Balances may never go negative on any date (`lib/supplierCredit.ts` checks every save and
delete against the whole timeline). `scripts/verify-supplier-credit.ts` has hand-worked cases and
500 seeded random businesses balanced to the cent.

**Break-even & overhead coverage** blends the contribution margin ratio over
your last 3 months of sales and divides this month's fixed operating costs
(rent, salaries, marketing, subscriptions, etc.) by it to get the break-even
revenue, margin of safety, and an overhead coverage ratio (gross profit ÷
operating expenses — above 1× means overhead is actually being covered).

**Capital & ROI** tracks initial investment, reinvestment, and owner
withdrawals separately from operating P&L, so payback progress and net cash
position are visible alongside month-to-month profit.

**Payroll** is booked as a normal recurring Expense (see §5) so its cost
already flows through MRR / monthly P&L / spend-by-category untouched — the
Employees page just adds the staff-facing view (net pay estimate, total
monthly payroll run-rate for active staff).

**Monthly P&L:**
`Net profit (pre-tax) = gross profit − operating expenses (incl. recurring, monthly-normalized)`
`Tax = max(net pre-tax, 0) × tax rate` → `Net profit (after tax) = pre-tax − tax`

**Recurring revenue/expenses** (rent, subscriptions, marketing retainers,
retainer clients, etc.) carry a cadence (weekly/monthly/yearly) and are
normalized to a monthly figure for MRR and expanded into the specific months
they're active for period P&L. Expense categories (Marketing, Rent & utilities,
Payroll & labor, etc.) roll up into a spend-by-category view on the Expenses
page. Tax rate, currency, forecast horizon, and EOQ defaults are editable in
Settings.

**Forecasting:** least-squares linear regression over monthly revenue, plus a
trailing 3-month moving average, projected forward N months (Settings).
Projected months also carry a best-case/downside range, computed as the
trend line ± one standard deviation of that same line's own residuals
against actual history — a real measure of how wrong the trend has been on
your own data, not an assumed ±X%. The range is deliberately constant-width
rather than widening further into the horizon, and historical months carry
no range (they're facts, not scenarios). ARIMA/Prophet-style models need
many clean periodic points to beat a trend line — a solo ledger has few,
noisy months, so a transparent, hand-verifiable trend (with an honest
range around it) is the better choice here.

**Item-level profitability** (Profitability page) aggregates every sale by
product/service over a chosen window (last 30/90 days, this month, or all
time): units sold, average selling price vs. average unit cost, revenue,
COGS, gross profit, gross margin %, and — for physical products — units still
on hand and their inventory value. Ranked by gross profit so the best and
worst performers surface immediately. Margin is also bucketed into a rough
pricing-power signal (thin/moderate/healthy/strong) — thin margins usually
mean a commoditized, price-competitive item with easy substitutes; strong
margins usually mean real differentiation or low price-sensitivity. It's a
prompt to investigate, not a verdict.

**Loans & debt** (Loans page) model a standard fixed-payment monthly
amortizing loan: `payment = P·r(1+r)^n / ((1+r)^n − 1)`, `r` = monthly rate,
`n` = term in months, first payment one month after disbursement. Each
month's split between principal and interest is computed from this schedule
and flows automatically into the Income Statement (interest expense) and
Cash Flow Statement (principal repayment, plus loan proceeds in the
disbursement month) — nothing about a loan needs to be hand-entered as a
separate expense.

**Financial statements** (Statements page) — the three standard reports,
built entirely from data already in the ledger:
- **Income Statement**: revenue, COGS, variable costs, gross profit,
  operating expenses, interest expense, tax, net profit — for one month,
  accrual basis (same numbers as the dashboard's monthly P&L, just formally
  laid out with subtotals).
- **Cash Flow Statement**: actual cash in/out for one month, direct method.
  This differs from the Income Statement in one important way: inventory
  purchases hit cash when *bought*, not when the stock is later sold (COGS
  timing) — so a month with heavy restocking can show strong accrual profit
  and weak cash flow, which is exactly the kind of thing an SME needs to see
  coming. Operating activities cover sales cash, inventory cash paid,
  variable costs, opex, interest, and tax; financing activities cover loan
  proceeds/repayments and owner capital in/out. Investing activities aren't
  tracked in this build (no fixed-asset/equipment ledger yet).
- **Balance Sheet**: always as of today (this build doesn't replay historical
  WAC/cash state for an arbitrary past date). Assets = cash (the cumulative
  net cash flow across every month to date) + inventory value. Liabilities =
  outstanding loan balances. Equity = owner's capital (net of withdrawals) +
  retained earnings (cumulative net profit after tax). Cash is *derived*,
  never hand-entered, which is what keeps Assets = Liabilities + Equity true
  by construction rather than something that can drift out of balance.

**Printing statements**: each statement tab (not Budget) has a "Print / save as
PDF" button (`lib/statementPrint.ts`). It clones the statement as rendered on
screen, strips controls, re-themes it for paper and prints it through the same
browser print dialog as invoices — so the paper copy can't disagree with the
screen, since no figure is recomputed. Letterhead comes from Settings; a
disclaimer (unaudited, not filed with any tax authority or other body) repeats
in the footer of every page. Nothing is submitted anywhere.

Both the Income Statement's monthly figures and the Cash Flow/Balance Sheet
derivation depend on the monthly P&L covering *every* calendar month from
first activity to today — not just months that happen to contain a sale —
so a recurring rent or loan payment in a quiet month doesn't silently vanish
from either statement.

**Profit by location** (`computeLocationProfitability`, shown on Profitability
once a second location exists). Same shape as the customer profitability
view, grouped by branch. It sums the existing per-sale economics rather than
re-costing anything, so there's no second costing engine and the totals tie
out to the consolidated P&L (including variable costs tagged as part of COGS).
Records with no location (anything from before Locations existed) resolve to
the default location. Every active location is listed, including one with no
sales in the period. Costs tagged to a location are kept apart from the
ranged totals on purpose: a one-off cost is a real dated sum and is netted
into "after direct costs", but a recurring cost is a monthly run-rate
snapshot (like MRR), and subtracting a monthly figure from a 90-day or
all-time total would silently misstate any period that isn't exactly one
month, so it's shown as its own number. Shared overhead with no location is
never allocated across branches, since an invented allocation key would look
just as precise as a real one. `scripts/verify-location-profitability.ts`
covers each of these rules.

## 6b. Closing the books (period lock)

Statements can be printed and handed to a bank or accountant, so a closed month
shouldn't be quietly changeable afterwards. **Settings → Operations → Close the
books** (owner only) locks every finished month through a chosen month-end.
From then on nobody — Staff, Managers, or the owner — can add, edit or delete a
dated record in it: sales, purchases and received orders, one-off expenses,
customer/supplier/bill payments, write-offs, returns, discounts, stock
adjustments, capital entries and tax payments. Moving a record *into* a closed
month is refused too, and deleting an open-month sale is refused if a linked
payment is dated in a closed month (the delete cascades to it). Collecting cash
**today** against an old invoice is fine — that lands in the open month.
The owner can move the date or reopen everything at any time; each change is
written to the Activity log.

- **Not frozen, on purpose:** recurring schedules (rent, subscriptions),
  employees/payroll, loans and fixed assets. They project across many months,
  so freezing them would stop you giving a raise or ending a lease. To change
  one without restating closed months, end the old schedule and start a new one.
- **Only whole, finished months** can be closed (month-end dates up to the end
  of last month).
- **Where it's enforced:** in the app layer — every write in
  `contexts/DataContext.tsx` goes through `lib/periodGuards.ts`, and the AI
  Assistant's server-side path (`lib/aiAutoConfirm.ts`) re-checks it against
  a fresh read of settings. It is **not** enforced in `firestore.rules`: a rule
  can only read the setting with `get()`, and Firestore allows ~20 such reads
  per batched write, so every bulk CSV import and multi-line invoice would be
  capped at ~10 rows. That means it stops mistakes and casual back-dating
  through the app, but a technically capable Manager talking to Firestore
  directly could bypass it — the same trust level as the audit log. If you
  want tamper-resistance, do rules enforcement with smaller batches and test
  it in the Firebase emulator first.
- `scripts/verify-period-lock.ts` checks all of the above, including that
  every add/update/delete method in DataContext is either locked or listed as
  knowingly exempt.

## 6c. Customer credit limits

An optional per-customer ceiling on what they can owe you (Customers → Add /
Edit → **Credit limit**; blank or 0 = no limit). It is a **warning, never a
block** — the same trust level as the period lock, enforced in the app layer.

- **Where it shows:** the Customers page flags anyone who owes more than their
  limit ("Rs X over limit"); the credit-sale form, the multi-item invoice form
  and the recurring-invoice form warn *before* you save ("With this sale Acme
  would owe Rs 70,000 in total — Rs 20,000 over their limit"). Editing an
  existing credit sale replaces its balance rather than adding to it
  (`projectCreditExposure` in `lib/calculations.ts`).
- **Names, not IDs:** sales match customers by name (trim + case-insensitive),
  the same way the aging report does. Two directory entries with one name are
  treated as one customer and the **stricter** limit applies.
- **Who sees what:** Owner/Manager set limits and see balances. Staff load only
  their own sales and payments, so a balance built from them would be wrong in
  both directions; they get **no balance-based numbers at all**, only a note
  that a limit exists ("check with a manager"). Staff also can't set a limit
  or CAC (the Add-customer form hides both, and `firestore.rules` rejects a
  Staff-created customer that carries either).
- **Clearing works:** emptying the box removes the limit (Firestore ignores
  `undefined`, so `updateCustomer`/`updateSupplier` convert blanks to
  `deleteField()` via `lib/firestorePatch.ts`).
- **Included in** the customers CSV and the full backup.
- `scripts/verify-credit-limit.ts` covers the maths end to end.

## 7. AI Assistant

Owner/Manager only (same trust boundary as Reports/Profitability). Five
things, all built around one idea: **the model never becomes a second
source of truth for your numbers or a second way to write to the ledger —
it's a UI layer over data that's already correct, and every entry it
proposes still goes through the same human-confirmed form as everything
else in this app.** In every case below, the model only ever picks *which*
tool answers the question — the actual numbers come from plain
TypeScript run server-side against your real Firestore data, never from
the model itself.

- **Ask questions in plain English** ("how much did I spend on packaging
  last quarter") — the model only picks *which* question is being asked
  (metric + date range + filter); the actual arithmetic runs in
  `lib/aiReport.ts` against your real Firestore data, so a phrased answer
  can never contain a hallucinated figure.
- **Log things by describing them** — "sold 3 bags of cement to Kamal for
  4500 each, cash" becomes a pre-filled `QuickSaleForm`, not a direct
  write. `/api/ai/chat` never writes to the ledger: every proposal comes
  back pending and you review and Save it. Two explicit, human-triggered
  shortcuts exist and both go through `/api/ai/auto-confirm`: **Confirm
  all** on the Assistant page (after you've seen the cards) and the Quick
  Entry modal's **Save without reviewing** checkbox, which is **off by
  default**. That route refuses entries that are incomplete, whose date
  isn't a real calendar date, or that fall in a closed period (see
  "Closing the books" below). Dates from the model are validated; anything
  that isn't a real `YYYY-MM-DD` date falls back to today for review. A
  **credit sale that would put a customer over their credit limit** (section
  6c) is held back the same way: it stays pending so you see the warning on
  the review form. The reply the route sends and the way the browser reads it
  are defined together in `lib/aiAutoConfirmShared.ts`
  (`scripts/verify-ai-auto-confirm.ts` round-trips it).
- **Ask about unusual spending** ("anything look off this month?") — calls
  `lib/aiAnomalyDetection.ts` over the last 12 months of expenses/purchases
  (category/supplier average + standard deviation), same
  plain-arithmetic-not-a-model-call approach as the Dashboard's anomaly
  flagging below, just reachable conversationally and phrased by the model.
- **Ask about cash flow** ("what's my cash flow looking like the next few
  months?") — calls `lib/aiCashFlowPrediction.ts`, which projects forward
  from your trailing 12-month average revenue/expenses; a real trend
  extrapolation, not a model guess.
- **Ask what needs following up** ("what's overdue?") — calls
  `lib/aiSmartReminders.ts` against every open receivable/payable
  (unbounded on purpose — an invoice from eight months ago is still
  overdue today), the same data `/api/aging/report` already reads in full.
- **Anomaly flagging** on the Dashboard (`lib/anomaly.ts`) — a one-off
  expense or purchase noticeably higher than your own recent median for
  that category/product. Deliberately plain arithmetic, not a model call:
  advisory only, nothing here edits or blocks anything. (A separate,
  simpler check from the conversational one above — this one runs
  unconditionally on every Dashboard load, no chat turn needed.)

**Setup**: alongside the Firebase web config, you'll need
`DEEPSEEK_API_KEY` (platform.deepseek.com → API Keys) and a Firebase Admin
service account (Project settings → Service accounts → Generate new
private key) for `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` /
`FIREBASE_PRIVATE_KEY` — see the comments in `.env.local.example`. All
three are server-side only; without them, every other page works normally
and only `/assistant` (and the "✨ Tell me what happened" quick action)
shows a clear error instead of a silent failure.

**Model**: DeepSeek Flash (`deepseek-flash`, overridable via `AI_MODEL`), called through
DeepSeek's Anthropic-compatible endpoint — every call this feature makes
is a bounded, mechanical task (classify a request, phrase an
already-computed number), not open-ended reasoning, so a budget-tier
model's accuracy is more than sufficient at a fraction of a larger model's
per-token cost (DeepSeek's price page, checked 3 Oct 2026: Flash is $0.30 / $1.20
per million input / output tokens at peak and half that off-peak, with cache-hit input at
$0.006 — against $1/$5 for the Claude Haiku 4.5 this replaced).
The system prompt (persona + product catalog + categories + memory notes)
still carries Anthropic-style prompt-caching hints for portability, though
DeepSeek's endpoint ignores them in favor of its own automatic prefix
caching — a multi-turn conversation still only pays full price for that
block once, it's just DeepSeek's cache doing the work now. Text-only: no
receipt/photo scanning.

**What it costs you, per customer.** Every finished turn adds its message and token counts to
that business's `meta/aiUsage` document for the current UTC month (`recordAiUsage` in
`lib/aiUsageLimit.ts`; best-effort, it can never fail a customer's answer). Admin → Manage
accounts shows "AI this month: N messages · ~$X" on each card and in the accounts CSV. The
dollar figure is deliberately an overestimate (peak list price). If the provider's price changes,
set `AI_PRICE_INPUT`, `AI_PRICE_OUTPUT`, `AI_PRICE_CACHED` (USD per million tokens) rather than
editing code. Check it against what each plan charges before you raise anyone's daily cap.
`scripts/verify-ai-usage-metering.ts` covers it.

**App help**: beyond logging entries and reporting numbers, the assistant
can also answer "how do I…" / "where is…" / "what does X mean" questions
about the app itself, grounded in a condensed, hand-written summary of
every page (`APP_HELP_KNOWLEDGE` in `lib/aiPrompts.ts`) — not general
knowledge, so it won't invent a feature that doesn't exist. It's told
explicitly to say it's not sure rather than guess for anything outside
that summary. Keep that block in sync with USER-MANUAL.md/this file when
a page's core workflow changes.

**Daily usage cap**: each business can send up to 100 AI Assistant messages
per UTC day (`lib/aiUsageLimit.ts`) before `/api/ai/chat` refuses further
turns with a clear in-app message until the next day — a backstop against
runaway or abusive usage racking up model cost, not a metering product.
100/day is well above genuine heavy use (a full day of quick-entry logging
plus questions). Every other page keeps working normally while a business
is at its cap. A turn that fails because the model provider failed (outage,
rate limit, unusable answer) is given back (`refundAiDailyTurn`), so retrying
through an outage doesn't burn the allowance; the customer sees a plain
"assistant unavailable, nothing was saved" message and the provider's raw
error goes to the server log only (`lib/apiError.ts`). Override per business by setting `aiDailyMessageLimit` on
that business's `users/{businessId}/meta/settings` doc directly in
Firestore (0 or negative = unlimited) — there's no UI for this, it's an
account-management knob for whoever operates the deployment, not a
customer-facing setting.

**History & memory**: every conversation is a
`users/{businessId}/aiChatSessions/{sessionId}` doc with a `messages`
subcollection, written server-side only (a client can never fabricate a
message from "the assistant") and read live via Firestore listeners, so a
transcript survives a refresh or a switch to another device. A small,
capped (`aiMemory`, 40 notes max), fully visible/deletable list of durable
facts — a regular supplier, a category the owner always uses for a
certain cost — gets included in the system prompt on future turns; the
model adds to it sparingly via a `remember_note` tool call, and the owner
can see and delete anything in it from the Memory panel on `/assistant`.

## 8. Architecture notes

- **Data model**: `users/{uid}/{products|purchases|purchaseOrders|sales|expenses|variableCosts|capitalEntries|employees|loans}`
  subcollections + a `users/{uid}/meta/settings` doc. Firestore security rules
  restrict every subtree to its owner (`firestore.rules`).
- **Caching / memory strategy**: Firestore is initialized once with
  `persistentLocalCache` (IndexedDB-backed), so data survives reloads and
  works read-only offline. A single `DataProvider` (React context) owns the
  only set of `onSnapshot` listeners for the whole app — every page reads
  from the same in-memory store instead of opening duplicate listeners.
  Derived numbers (WAC ledgers, per-sale economics, monthly P&L, forecast)
  are computed with `useMemo` keyed on the raw arrays, so switching pages
  never re-runs the math unless the underlying data actually changed.
- **CSV import/export** (`lib/csv.ts`, papaparse): export is per-entity
  (products/purchases/sales/expenses) since the schemas don't share columns.
  Import validates every row up front and rejects the whole file with a
  row-by-row error list on any bad data, rather than silently skipping rows —
  this is financial data, partial imports would be worse than a blocked one.
  Bulk writes are chunked into Firestore batches of ≤400 to stay under the
  500-write batch limit.
- **Team & roles**: `users/{businessId}/members/{uid}` holds one doc per
  person with access (role, active/removed) — the single source of truth
  both the client (`lib/permissions.ts`) and `firestore.rules` read for
  every permission decision. `memberships/{uid}` is a top-level pointer,
  written once at signup or invite-acceptance, so a signed-in client can
  find its own business with one doc read. Owners invite from the Team
  page; the link (`/join?biz=...&invite=...`) is shared out-of-band
  (WhatsApp, in person) and the invitee creates their own login — nothing
  is ever created on their behalf, since the client SDK only holds one
  session at a time. See the role matrix at the top of `firestore.rules`
  and in `lib/permissions.ts` (kept in sync manually — if you add a
  permission, update both).

### API route guards

Every handler under `app/api` must authenticate (admin passcode or a signed-in
business member) except two deliberately public POSTs — the trial request and
the in-app feedback note — which must stay rate limited and honeypotted, since
each writes a document and emails the admin, plus the signed-token endpoints
(`/api/start`, and `/api/trial-requests/verify` behind the "confirm your email"
link), which must verify their token and be rate limited. `scripts/verify-api-route-guards.ts`
scans every route and fails if a new one ships open or a public one loses its
throttle, so this can't regress silently.

## 9. CSV formats

| File | Columns |
|---|---|
| products.csv | `name, sku, category, type (product/service), active, orderingCost, holdingCostPct, leadTimeDays` |
| purchases.csv | `product` (name or SKU) or `productId`, `qty, unitCost, date, supplier, notes` |
| purchase_orders.csv | export-only — `product, qtyOrdered, unitCost, orderDate, expectedDate, supplier, status, receivedDate, qtyReceived, receivedUnitCost, notes` |
| sales.csv | `product` (name or SKU) or `productId`, `qty, unitPrice, date, customer, notes` |
| expenses.csv | `name, amount, category, kind (expense/revenue), isRecurring (true/false), recurrence (weekly/monthly/yearly), startDate, endDate` |
| capital_entries.csv | `kind (investment/reinvestment/withdrawal), amount, date, notes` |
| tax_payments.csv | `amount, date, notes` — payments you've made to your tax authority, netted against the Balance Sheet's sales-tax-payable liability. Self-reported only; this app doesn't file or verify anything with any tax authority. |
| employees.csv | `name, role, payRate, payFrequency (weekly/monthly/yearly), taxPct, startDate, endDate, active, notes` — importing books each row's pay as a recurring expense automatically |
| loans.csv | `name, lender, principal, annualInterestRatePct, termMonths, startDate, active, notes` |
| variable_costs.csv | export-only — `product, category, perUnitFee, pctOfSalePrice, notes` |
| customers.csv | export-only — `name, contact, leadSource, cac, creditLimit, notes` |
| projects.csv | export-only — `name, client, quotedPrice, status, startDate, targetEndDate, completedDate, notes`; cost segments and milestones aren't included (each is its own sub-collection) |
| time_entries.csv | export-only — `memberName, jobLabel, project, billable, hourlyRate, clockIn, clockOut, hours, notes` |
| opportunities.csv | export-only — the eight 1-10 scored factors plus notes |
| fixed_assets.csv | export-only — `name, category, purchaseDate, cost, usefulLifeMonths, salvageValue, disposalDate, disposalAmount, notes` |

"Export-only" above means there's no matching importer on the Import/Export
page — each of these has real relational shape (a Project's cost segments,
a Customer's derived unit economics) that a flat re-import can't faithfully
recreate without a much bigger feature. The export exists so a business's
own data is never locked in with no way out, not as a restore path — see
`lib/csv.ts`'s comment on that trade-off.

The sales, purchases and expenses exports also carry a `location` column
(the branch's name; blank on an expense means shared overhead). It's
export-only, like `paymentMethod` and `dueDate` — the importers read just the
core fields listed above.

`date`/`startDate`/`endDate` are `YYYY-MM-DD`. Re-import your own export of
`products.csv` first if importing `purchases.csv`/`sales.csv` into a fresh
project, so product name/SKU lookups resolve. `purchase_orders.csv` is
export-only — orders are placed and received through the Orders page so the
resulting Purchase entry is created correctly.
