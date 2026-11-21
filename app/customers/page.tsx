"use client";
import { isValidTin } from "@/lib/invoiceNumber";
import { cleanCustomFields } from "@/lib/customerFields";
import { localIsoDate } from "@/lib/localDate";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { CollectorSelect, useCollectorChoices } from "@/components/CollectorSelect";
import CustomerDepositPanel from "@/components/CustomerDepositPanel";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import { computeOrderRhythms, summarizeOrderFrequency } from "@/lib/orderFrequency";
import { computeRevenueDrivers } from "@/lib/revenueDrivers";
import { loyaltyStanding, type LoyaltyStanding } from "@/lib/loyalty";
import { printCustomerStatement } from "@/lib/print";
import MessageButton from "@/components/MessageButton";
import PortalLinkButton from "@/components/PortalLinkButton";
import CustomerHistory from "@/components/CustomerHistory";
import { computeAllCustomerUnitEconomics, creditLimitFor } from "@/lib/calculations";
import type { CustomerCreditStatus } from "@/lib/calculations";
import { CUSTOMER_LEAD_SOURCES, CUSTOMER_LEAD_SOURCE_GROUPS, CUSTOMER_LEAD_SOURCE_UNGROUPED } from "@/lib/types";
import type { Customer } from "@/lib/types";
import { Checkbox,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Label,
  Modal,
  PageHeader,
  Select,
  Stat,
  StatGridSkeleton,
  Table,
  TableCardSkeleton,
  EmptyState,
  ShowMoreBar,
  usePagedList,
} from "@/components/ui";

type CustomerStats = { revenue: number; count: number; lastDate: string; outstanding: number };
type CustomerEcon = ReturnType<typeof computeAllCustomerUnitEconomics>[number];

function EconRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

// Mobile card for one customer — same data as the desktop table below, just
// laid out for a phone instead of packed into 15 columns of a horizontally
// scrolling table (which, at a phone's width, made even the header text
// wrap mid-word and left almost nothing readable without scrolling). The
// core numbers (sales, revenue, what they owe) are always visible; the
// deeper unit-economics fields (CAC, LTV, payback, etc.) are real numbers
// this app already computes, so they stay one tap away behind "Show
// economics" rather than being dropped from mobile entirely.
function CustomerCard({
  customer,
  stats,
  loyalty,
  econ,
  creditStatus,
  showFinancials,
  staffCreditLimit,
  currency,
  canEdit,
  onEdit,
  onStatement,
  onHistory,
}: {
  customer: Customer;
  stats?: CustomerStats;
  // Loyalty points (lib/loyalty.ts), when loyalty is on in Settings. Shown only with the financial numbers.
  loyalty?: LoyaltyStanding | null;
  econ?: CustomerEcon;
  creditStatus?: CustomerCreditStatus;
  // Staff only load their own sales and no cost data, so revenue, balances and
  // unit economics computed for them would be partial or flat-out wrong (zero
  // cost => "100% margin"). They get the directory, not the numbers.
  showFinancials: boolean;
  staffCreditLimit?: number;
  currency: string;
  canEdit: boolean;
  onEdit: () => void;
  onStatement?: () => void;
  onHistory?: () => void;
}) {
  const [showEconomics, setShowEconomics] = useState(false);

  return (
    <Card className="!p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{customer.name}</div>
          <div className="text-xs text-muted mt-0.5 truncate">{customer.contact || "No contact on file"}</div>
          {(customer.leadSource || creditStatus || staffCreditLimit !== undefined || customer.collectorName) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {customer.leadSource && <Badge>{customer.leadSource}</Badge>}
              {Object.entries(customer.customFields ?? {}).map(([k, v]) => (
                <Badge key={k}>
                  {k}: {v}
                </Badge>
              ))}
              {customer.collectorName && <Badge>Collector: {customer.collectorName}</Badge>}
              {staffCreditLimit !== undefined && <Badge>Credit limit {formatMoney(staffCreditLimit, currency)}</Badge>}
              {creditStatus && (
                <Badge tone={creditStatus.overBy > 0 ? "bad" : "default"}>
                  {creditStatus.overBy > 0
                    ? `${formatMoney(creditStatus.overBy, currency)} over limit`
                    : `Limit ${formatMoney(creditStatus.creditLimit, currency)}`}
                </Badge>
              )}
            </div>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 shrink-0">
            <MessageButton audience="customer" name={customer.name} contact={customer.contact} suggested="thanks" />
            <PortalLinkButton kind="customer" id={customer.id} label="Account link" />
            <button onClick={onEdit} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px] px-1">
              Edit
            </button>
          </div>
        )}
      </div>

      {showFinancials && (
        <>
      {loyalty && (
        <div className="text-xs text-muted mt-2.5">
          <span className="font-medium text-fg">{loyalty.points} loyalty {loyalty.points === 1 ? "point" : "points"}</span> · {formatMoney(loyalty.toNext, currency)} more for the next one
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 mt-2.5 text-xs">
        <div>
          <div className="text-muted">Sales</div>
          <div className="num font-medium mt-0.5">{stats?.count ?? 0}</div>
        </div>
        <div>
          <div className="text-muted">Revenue</div>
          <div className="num font-medium mt-0.5">{formatMoney(stats?.revenue ?? 0, currency)}</div>
        </div>
        <div>
          <div className="text-muted">Owes you</div>
          <div className={clsx("num font-medium mt-0.5", stats?.outstanding && "text-amber-soft")}>
            {stats?.outstanding ? formatMoney(stats.outstanding, currency) : "—"}
          </div>
        </div>
      </div>

      {stats?.lastDate && <div className="text-[11px] text-muted mt-2.5">Last sale {stats.lastDate}</div>}

      {stats?.outstanding && onStatement ? (
        <button
          type="button"
          onClick={onStatement}
          className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]"
        >
          Print statement of account
        </button>
      ) : null}
      {onHistory ? (
        <button type="button" onClick={onHistory} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px] text-left">
          History
        </button>
      ) : null}

      {econ && (
        <div className="mt-2.5 pt-2.5 border-t border-line">
          <button
            type="button"
            onClick={() => setShowEconomics((v) => !v)}
            className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]"
          >
            {showEconomics ? "Hide economics" : "Show economics (CAC, LTV & more) ▾"}
          </button>
          {showEconomics && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2 text-xs">
              <EconRow label="CAC" value={econ.cac !== null && econ.cac !== undefined ? formatMoney(econ.cac, currency) : "—"} />
              <EconRow label="ARPU" value={formatMoney(econ.arpu, currency)} />
              <EconRow label="Lifetime (mo)" value={econ.customerLifetimeMonths.toString()} />
              <EconRow label="LTV" value={formatMoney(econ.ltv, currency)} />
              <EconRow
                label="LTV:CAC"
                value={econ.ltvCacRatio !== null && econ.ltvCacRatio !== undefined ? `${econ.ltvCacRatio.toFixed(1)}x` : "—"}
              />
              <EconRow
                label="Payback (mo)"
                value={
                  econ.cacPaybackPeriodMonths !== null && econ.cacPaybackPeriodMonths !== undefined
                    ? econ.cacPaybackPeriodMonths.toFixed(1)
                    : "—"
                }
              />
              <EconRow
                label="Break-even (mo)"
                value={econ.breakEvenMonths !== null && econ.breakEvenMonths !== undefined ? econ.breakEvenMonths.toFixed(1) : "—"}
              />
              <EconRow label="Pre-tax CF" value={formatMoney(econ.preTaxCashFlow, currency)} />
              <EconRow label="CM ratio" value={`${(econ.contributionMarginRatio * 100).toFixed(1)}%`} />
            </div>
          )}
        </div>
      )}
        </>
      )}
    </Card>
  );
}

// A lightweight directory, not a CRM: Sale.customer stays a free-text field
// (see the Customer type comment in lib/types.ts), so the per-customer
// numbers below are computed by matching this list's `name` against the
// existing sales/receivables data rather than a foreign key. That means a
// customer only shows revenue/outstanding once at least one sale has been
// logged under the exact same name — the sale form's autocomplete (backed
// by this same list) is what keeps names consistent going forward.
export default function CustomersPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "staff", "accountant"]);
  const {
    customers,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    sales,
    receivablesAging,
    customerCreditStatus,
    settings,
    role,
    loading,
    saleEconomics,
    customerDepositSummary,
  } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const canEdit = can(role, "manage:customers");
  const canManageDeposits = can(role, "manage:products");
  const canDelete = can(role, "delete:records");
  const showFinancials = role !== "staff";
  // How often each customer orders, and who is due or has gone quiet (lib/orderFrequency.ts).
  const rhythms = useMemo(() => computeOrderRhythms(sales, todayIso()), [sales]);
  const orderSummary = useMemo(() => summarizeOrderFrequency(sales, rhythms, todayIso()), [sales, rhythms]);
  const drivers = useMemo(() => computeRevenueDrivers(sales, todayIso()), [sales]);
  const needsAttention = rhythms.filter((r) => r.status === "slipping" || r.status === "due");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [depositFor, setDepositFor] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const depositRows = customerDepositSummary.byCustomer.filter((b) => Math.abs(b.balance) > 0.005 || b.received + b.applied + b.refunded > 0);

  const statsByName = useMemo(() => {
    const map = new Map<string, { revenue: number; count: number; lastDate: string; outstanding: number }>();
    const key = (name: string) => name.trim().toLowerCase();
    // Net of returns/discounts — the same revenue figure the lifetime-value numbers below are built on,
    // so one customer never shows two different "revenue" totals on the same row.
    const econBySaleId = new Map(saleEconomics.map((e) => [e.saleId, e]));
    for (const s of sales) {
      if (!s.customer) continue;
      const k = key(s.customer);
      const entry = map.get(k) ?? { revenue: 0, count: 0, lastDate: "", outstanding: 0 };
      entry.revenue += econBySaleId.get(s.id)?.revenue ?? s.unitPrice * s.qty;
      entry.count += 1;
      if (!entry.lastDate || s.date > entry.lastDate) entry.lastDate = s.date;
      map.set(k, entry);
    }
    for (const line of receivablesAging.lines) {
      const k = key(line.customer);
      const entry = map.get(k) ?? { revenue: 0, count: 0, lastDate: "", outstanding: 0 };
      entry.outstanding += line.amountOutstanding;
      map.set(k, entry);
    }
    return map;
  }, [sales, receivablesAging, saleEconomics]);

  // One-page statement of everything this customer still owes (print / save as PDF). Built from the
  // same aging lines as the Receivables screen, matched by name the same way the Owes-you column is.
  const printStatement = (c: Customer) => {
    const k = c.name.trim().toLowerCase();
    const lines = receivablesAging.lines.filter((l) => l.customer.trim().toLowerCase() === k);
    if (lines.length === 0) return;
    printCustomerStatement(c.name, c.contact || lines.find((l) => l.customerContact)?.customerContact, lines, settings);
  };

  const unitEconomics = useMemo(() => {
    const now = new Date();
    const asOfISO = localIsoDate(now);
    return computeAllCustomerUnitEconomics(customers, sales, saleEconomics, asOfISO);
  }, [customers, sales, saleEconomics]);

  const unitEconomicsByName = useMemo(() => {
    const map = new Map<string, typeof unitEconomics[0]>();
    const key = (name: string) => name.trim().toLowerCase();
    for (const econ of unitEconomics) {
      map.set(key(econ.customerName), econ);
    }
    return map;
  }, [unitEconomics]);

  const totalOutstanding = useMemo(
    () => customers.reduce((sum, c) => sum + (statsByName.get(c.name.trim().toLowerCase())?.outstanding ?? 0), 0),
    [customers, statsByName]
  );

  // Groups customers by how they were acquired so a "Referral" cohort's
  // revenue/CAC can be eyeballed against a "Wholesale outreach" cohort's —
  // the same statsByName/unitEconomicsByName numbers already computed
  // above, just rolled up one level. Customers with no leadSource set land
  // in "Not recorded" rather than being silently dropped, so this total
  // always reconciles with the customer count above it.
  const bySource = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number; cacTotal: number; cacCount: number }>();
    for (const c of customers) {
      const label = c.leadSource || "Not recorded";
      const entry = map.get(label) ?? { count: 0, revenue: 0, cacTotal: 0, cacCount: 0 };
      entry.count += 1;
      entry.revenue += statsByName.get(c.name.trim().toLowerCase())?.revenue ?? 0;
      if (c.cac !== undefined && c.cac !== null) {
        entry.cacTotal += c.cac;
        entry.cacCount += 1;
      }
      map.set(label, entry);
    }
    return [...map.entries()]
      .map(([label, v]) => ({
        label,
        count: v.count,
        revenue: v.revenue,
        avgCac: v.cacCount > 0 ? v.cacTotal / v.cacCount : null,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [customers, statsByName]);

  // Search + paging: a business with thousands of customers shouldn't draw them all at once.
  // The stats above (count, owed, by-source) still cover the whole directory.
  const [search, setSearch] = useState("");
  const matchingCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || (c.contact ?? "").toLowerCase().includes(q)
    );
  }, [customers, search]);
  const customerPage = usePagedList(matchingCustomers, search);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(c: Customer) {
    setEditing(c);
    setModalOpen(true);
  }

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Customers" action={<Button disabled>+ Add customer</Button>} />
        <StatGridSkeleton count={2} className="lg:grid-cols-3" />
        <TableCardSkeleton rows={6} cols={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Customers" action={<Button onClick={openNew}>+ Add customer</Button>} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <Stat label="Customers" value={customers.length.toString()} />
        {showFinancials && customerDepositSummary.total > 0.005 && (
          <Stat label="Held for customers" value={formatMoney(customerDepositSummary.total, currency)} tone="amber" sub="paid in advance, not income yet" />
        )}
        {showFinancials && (
          <>
            <Stat label="Owe you" value={formatMoney(totalOutstanding, currency)} tone={totalOutstanding > 0 ? "bad" : "good"} />
            <Stat label="With economics" value={unitEconomics.length.toString()} />
          </>
        )}
      </div>

      {showFinancials && drivers && (
        <Card className="mb-6">
          <div className="font-medium text-sm">What drives your revenue</div>
          <div className="text-xs text-muted mt-1 num">
            Last 12 months: {drivers.current.customers} customer{drivers.current.customers === 1 ? "" : "s"} × {drivers.current.ordersPerCustomer} orders each ×{" "}
            {formatMoney(drivers.current.avgOrder, currency)} average order = {formatMoney(drivers.current.revenue, currency)}
          </div>
          {drivers.change ? (
            <div className="text-xs mt-2">
              Against the 12 months before:{" "}
              <span className={drivers.change.customersPct >= 0 ? "text-good" : "text-bad"}>customers {drivers.change.customersPct > 0 ? "+" : ""}{drivers.change.customersPct}%</span>,{" "}
              <span className={drivers.change.ordersPerCustomerPct >= 0 ? "text-good" : "text-bad"}>orders each {drivers.change.ordersPerCustomerPct > 0 ? "+" : ""}{drivers.change.ordersPerCustomerPct}%</span>,{" "}
              <span className={drivers.change.avgOrderPct >= 0 ? "text-good" : "text-bad"}>order size {drivers.change.avgOrderPct > 0 ? "+" : ""}{drivers.change.avgOrderPct}%</span>
              {" "}= revenue {drivers.change.revenuePct > 0 ? "+" : ""}{drivers.change.revenuePct}%.
              {drivers.biggestLever && (
                <span className="text-muted">
                  {" "}The biggest mover was {drivers.biggestLever === "customers" ? "how many customers you have" : drivers.biggestLever === "ordersPerCustomer" ? "how often each customer orders" : "how much each order is worth"}.
                </span>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted mt-2">There is no earlier 12 months of sales to compare with yet.</div>
          )}
          {drivers.unattributedSharePct !== null && drivers.unattributedSharePct > 0 && (
            <div className="text-[11px] text-muted mt-2">
              {drivers.unattributedSharePct}% of revenue ({formatMoney(drivers.unattributedRevenue, currency)}) is from sales with no customer name, so it is not in the figures above.
            </div>
          )}
        </Card>
      )}

      {showFinancials && rhythms.length > 0 && (
        <Card className="mb-6">
          <div className="font-medium text-sm">Ordering rhythm</div>
          <div className="text-[11px] text-muted mt-0.5">
            {orderSummary.repeatRatePct !== null && <>{orderSummary.repeatRatePct}% of customers who ordered in the last year ordered on more than one day</>}
            {orderSummary.avgOrdersPerCustomer !== null && <> · {orderSummary.avgOrdersPerCustomer} orders each on average</>}
            {orderSummary.medianGapDays !== null && <> · typically every {orderSummary.medianGapDays} days</>}
          </div>
          {needsAttention.length === 0 ? (
            <div className="text-xs text-muted mt-3">Nobody is overdue for their usual reorder.</div>
          ) : (
            <div className="mt-3 divide-y divide-line">
              {needsAttention.slice(0, 8).map((r) => (
                <div key={r.key} className="py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.name}</div>
                    <div className="text-[11px] text-muted">
                      Usually orders every {r.typicalGapDays} days, last {r.daysSinceLast} days ago
                      {r.expectedNext ? ` (expected ${r.expectedNext})` : ""}
                      {r.lowConfidence ? ", based on two orders only" : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge tone={r.status === "slipping" ? "bad" : "amber"}>{r.status === "slipping" ? "Gone quiet" : "Due to reorder"}</Badge>
                    <div className="text-[11px] text-muted num mt-0.5">usual order {formatMoney(r.avgOrderValue, currency)}</div>
                  </div>
                </div>
              ))}
              {needsAttention.length > 8 && <div className="pt-2 text-[11px] text-muted">and {needsAttention.length - 8} more</div>}
            </div>
          )}
        </Card>
      )}

      {showFinancials && (depositRows.length > 0 || (canManageDeposits && customers.length > 0)) && (
        <Card className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium text-sm">Customer deposits</div>
              <div className="text-xs text-muted mt-0.5">
                Money customers paid you before you delivered. It is held as money you owe them (not income) until you use it on their invoice or refund it.
                {depositRows.length > 0 ? ` ${formatMoney(customerDepositSummary.total, currency)} in all.` : ""}
              </div>
            </div>
            {canManageDeposits && customers.length > 0 && (
              <select
                aria-label="Record a deposit from"
                className="text-xs bg-panel2 border border-line rounded-md px-2 py-1.5 max-w-[45%]"
                value=""
                onChange={(e) => e.target.value && setDepositFor(e.target.value)}
              >
                <option value="">Record a deposit…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
          {depositRows.length > 0 && (
            <div className="mt-3 space-y-1">
              {depositRows.map((b) => (
                <div key={b.key} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-line last:border-0">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{b.customer}</div>
                    {b.balance > 0.005 && b.oldestOpenDate && <div className="text-xs text-muted">held since {b.oldestOpenDate}</div>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="num">{formatMoney(Math.max(0, b.balance), currency)}</span>
                    <button onClick={() => setDepositFor(b.customer)} className="text-xs text-amber-soft font-medium min-h-[32px]">
                      {canManageDeposits ? "Manage" : "View"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {showFinancials && customers.length > 0 && bySource.length > 1 && (
        <Card className="mb-6">
          <div className="text-sm font-medium mb-0.5">Customers by how they found you</div>
          <div className="text-xs text-muted mb-3">
            Where your revenue and acquisition cost are actually coming from, by channel.
          </div>
          <div className="space-y-1.5">
            {bySource.map((s) => (
              <div key={s.label} className="flex flex-wrap items-center justify-between text-xs border-b border-line last:border-0 py-1.5 gap-x-3 gap-y-0.5">
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1 font-medium sm:font-normal">{s.label}</div>
                <div className="text-muted shrink-0">{s.count} customer{s.count === 1 ? "" : "s"}</div>
                <div className="num font-medium shrink-0 sm:w-24 text-right whitespace-nowrap">{formatMoney(s.revenue, currency)}</div>
                <div className="num text-muted shrink-0 sm:w-20 text-right whitespace-nowrap">
                  {s.avgCac !== null ? `${formatMoney(s.avgCac, currency)} CAC` : "—"}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {customers.length === 0 ? (
        <EmptyState
          title="No customers yet"
          body="Add regulars here so their name shows up as a pick on the sale form instead of getting retyped — and slightly misspelled — every visit. Every new name you type on a sale is also added here automatically."
        />
      ) : (
        <>
          {customers.length > 8 && (
            <div className="mb-3">
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customers by name or contact"
                aria-label="Search customers"
              />
              {search.trim() && matchingCustomers.length === 0 && (
                <div className="text-xs text-muted mt-2">No customer matches &quot;{search.trim()}&quot;.</div>
              )}
            </div>
          )}
          {/* Mobile: one card per customer, core numbers up front and the
              unit-economics fields behind a per-card disclosure. Same data
              as the table below — never rendered at the same time. */}
          <div className="sm:hidden space-y-2.5">
            {customers.map((c) => {
              const stats = statsByName.get(c.name.trim().toLowerCase());
              const econ = unitEconomicsByName.get(c.name.trim().toLowerCase());
              const creditStatus = customerCreditStatus.get(c.name.trim().toLowerCase());
              const loyalty = showFinancials ? loyaltyStanding(stats?.revenue ?? 0, settings.loyaltyEvery) : null;
              return (
                <CustomerCard
                  key={c.id}
                  customer={c}
                  stats={stats}
                  loyalty={loyalty}
                  econ={econ}
                  creditStatus={creditStatus}
                  showFinancials={showFinancials}
                  staffCreditLimit={showFinancials ? undefined : creditLimitFor(customers, c.name)}
                  currency={currency}
                  canEdit={canEdit}
                  onEdit={() => openEdit(c)}
                  onStatement={showFinancials ? () => printStatement(c) : undefined}
                  onHistory={showFinancials ? () => setHistoryFor(c.name) : undefined}
                />
              );
            })}
          </div>

          {/* Desktop: the full table, unchanged. */}
          <Card className="hidden sm:block">
          <Table>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="py-2 pr-3 font-medium whitespace-nowrap">Name</th>
                <th className="py-2 px-3 font-medium whitespace-nowrap">Contact</th>
                <th className="py-2 px-3 font-medium whitespace-nowrap">Source</th>
                {showFinancials ? (
                  <>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Sales</th>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Revenue</th>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Owes you</th>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">CAC</th>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">ARPU</th>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Lifetime (mo)</th>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">LTV</th>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">LTV:CAC</th>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Payback (mo)</th>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Break-Even (mo)</th>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Pre-Tax CF</th>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">CM Ratio</th>
                <th className="py-2 px-3 font-medium whitespace-nowrap">Last sale</th>
                  </>
                ) : (
                  <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Credit limit</th>
                )}
                {canEdit && <th className="py-2 pl-3 font-medium text-right">·</th>}
              </tr>
            </thead>
            <tbody>
              {customerPage.visible.map((c) => {
                const stats = statsByName.get(c.name.trim().toLowerCase());
                const econ = unitEconomicsByName.get(c.name.trim().toLowerCase());
                const creditStatus = customerCreditStatus.get(c.name.trim().toLowerCase());
                const loyalty = showFinancials ? loyaltyStanding(stats?.revenue ?? 0, settings.loyaltyEvery) : null;
                return (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 font-medium">
                      {c.name}
                      {c.collectorName && <div className="text-xs text-muted font-normal">Collector: {c.collectorName}</div>}
                      {loyalty && <div className="text-xs text-muted font-normal">{loyalty.points} loyalty {loyalty.points === 1 ? "point" : "points"}</div>}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-muted">{c.contact || "—"}</td>
                    <td className="py-2.5 px-3 text-muted">
                      {c.leadSource ? <Badge tone="default">{c.leadSource}</Badge> : "—"}
                    </td>
                    {showFinancials ? (
                      <>
                    <td className="py-2.5 px-3 whitespace-nowrap num text-right text-muted">{stats?.count ?? 0}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap num text-right">{formatMoney(stats?.revenue ?? 0, currency)}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap num text-right">
                      {stats?.outstanding ? (
                        <span className="text-amber-soft">{formatMoney(stats.outstanding, currency)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                      {creditStatus && creditStatus.overBy > 0 && (
                        <div className="mt-0.5">
                          <Badge tone="bad">{formatMoney(creditStatus.overBy, currency)} over limit</Badge>
                        </div>
                      )}
                      {stats?.outstanding ? (
                        <button type="button" onClick={() => printStatement(c)} className="mt-0.5 block ml-auto text-[11px] text-amber-soft hover:underline">
                          Statement
                        </button>
                      ) : null}
                      {showFinancials && (
                        <button type="button" onClick={() => setHistoryFor(c.name)} className="mt-0.5 block ml-auto text-[11px] text-amber-soft hover:underline">
                          History
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap num text-right">
                      {econ?.cac !== null && econ?.cac !== undefined ? (
                        <span className="text-muted">{formatMoney(econ.cac, currency)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap num text-right">
                      {econ ? <span className="text-muted">{formatMoney(econ.arpu, currency)}</span> : <span className="text-muted">—</span>}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap num text-right">
                      {econ ? <span className="text-muted">{econ.customerLifetimeMonths}</span> : <span className="text-muted">—</span>}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap num text-right">
                      {econ ? <span className="text-muted">{formatMoney(econ.ltv, currency)}</span> : <span className="text-muted">—</span>}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap num text-right">
                      {econ?.ltvCacRatio !== null && econ?.ltvCacRatio !== undefined ? (
                        <span className={econ.ltvCacRatio >= 3 ? "text-green-soft" : econ.ltvCacRatio >= 1 ? "text-amber-soft" : "text-red-soft"}>
                          {econ.ltvCacRatio.toFixed(1)}x
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap num text-right">
                      {econ?.cacPaybackPeriodMonths !== null && econ?.cacPaybackPeriodMonths !== undefined ? (
                        <span className="text-muted">{econ.cacPaybackPeriodMonths.toFixed(1)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap num text-right">
                      {econ?.breakEvenMonths !== null && econ?.breakEvenMonths !== undefined ? (
                        <span className="text-muted">{econ.breakEvenMonths.toFixed(1)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap num text-right">
                      {econ ? <span className={econ.preTaxCashFlow >= 0 ? "text-green-soft" : "text-red-soft"}>{formatMoney(econ.preTaxCashFlow, currency)}</span> : <span className="text-muted">—</span>}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap num text-right">
                      {econ ? <span className="text-muted">{(econ.contributionMarginRatio * 100).toFixed(1)}%</span> : <span className="text-muted">—</span>}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-muted">{stats?.lastDate || "—"}</td>
                      </>
                    ) : (
                    <td className="py-2.5 px-3 whitespace-nowrap num text-right text-muted">
                      {(() => {
                        const lim = creditLimitFor(customers, c.name);
                        return lim !== undefined ? formatMoney(lim, currency) : "—";
                      })()}
                    </td>
                    )}
                    {canEdit && (
                      <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                        <MessageButton audience="customer" name={c.name} contact={c.contact} suggested="thanks" className="text-xs text-amber-soft hover:underline mr-3" />
                        <button onClick={() => openEdit(c)} className="text-xs text-muted hover:text-fg">
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
          </Card>
          <ShowMoreBar shown={customerPage.shown} total={customerPage.total} remaining={customerPage.remaining} onShowMore={customerPage.showMore} onShowAll={customerPage.showAll} noun="customers" />
        </>
      )}

      <Modal open={historyFor !== null} onClose={() => setHistoryFor(null)} title={historyFor ? `History · ${historyFor}` : "History"}>
        {historyFor !== null && <CustomerHistory name={historyFor} />}
      </Modal>
      <Modal open={depositFor !== null} onClose={() => setDepositFor(null)} title={depositFor ? `Deposit held · ${depositFor}` : "Deposit held"}>
        {depositFor !== null && <CustomerDepositPanel key={depositFor} customer={depositFor} onDone={() => setDepositFor(null)} />}
      </Modal>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit customer" : "Add customer"}>
        <CustomerForm
          initial={editing}
          showFinancialFields={canEdit}
          onCancel={() => setModalOpen(false)}
          onSave={async (values) => {
            try {
              if (editing) await updateCustomer(editing.id, values);
              else await addCustomer(values);
              toast.success(editing ? "Customer updated" : "Customer added", values.name);
              setModalOpen(false);
            } catch (err) {
              toast.error("Couldn't save", toastableErrorMessage(err));
            }
          }}
          onDelete={
            editing && canDelete
              ? async () => {
                  if (!confirm(`Remove "${editing.name}" from the directory? Their past sales aren't affected.`)) return;
                  try {
                    await deleteCustomer(editing.id);
                    toast.success("Customer removed", editing.name);
                    setModalOpen(false);
                  } catch (err) {
                    toast.error("Couldn't remove customer", toastableErrorMessage(err));
                  }
                }
              : undefined
          }
        />
      </Modal>
    </>
  );
}

function CustomerForm({
  initial,
  showFinancialFields,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Customer | null;
  // CAC and credit limit are owner/manager decisions. Staff can add a customer
  // (meeting a new one shouldn't need a manager) but not set either.
  showFinancialFields: boolean;
  onSave: (values: Omit<Customer, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const { settings: customerSettings } = useData();
  const customerLabels = customerSettings.customerFieldLabels ?? [];
  const [customValues, setCustomValues] = useState<Record<string, string>>(initial?.customFields ?? {});
  const [wholesale, setWholesale] = useState(initial?.wholesale ?? false);
  const [taxExempt, setTaxExempt] = useState(initial?.taxExempt ?? false);
  const [relatedParty, setRelatedParty] = useState(initial?.relatedParty ?? false);
  const [tin, setTin] = useState(initial?.tin ?? "");
  const [tinError, setTinError] = useState<string | null>(null);
  // The borrower / debtor record: where to find them, who they are, who stands behind them, who chases them.
  const [address, setAddress] = useState(initial?.address ?? "");
  const [idReference, setIdReference] = useState(initial?.idReference ?? "");
  const [guarantorName, setGuarantorName] = useState(initial?.guarantorName ?? "");
  const [guarantorContact, setGuarantorContact] = useState(initial?.guarantorContact ?? "");
  const { role } = useAuth();
  const collectorChoices = useCollectorChoices(initial?.collectorUid, initial?.collectorName);
  const canAssignCollector = role === "owner" && collectorChoices.length > 0;
  const [collectorUid, setCollectorUid] = useState(initial?.collectorUid ?? "");
  const [collectorName, setCollectorName] = useState(initial?.collectorName ?? "");
  const [cac, setCac] = useState(initial?.cac?.toString() ?? "");
  const [creditLimit, setCreditLimit] = useState(initial?.creditLimit?.toString() ?? "");
  const [leadSource, setLeadSource] = useState(initial?.leadSource ?? "");
  const [customSource, setCustomSource] = useState(
    initial?.leadSource && !CUSTOMER_LEAD_SOURCES.includes(initial.leadSource) ? initial.leadSource : ""
  );
  const [busy, setBusy] = useState(false);

  const isCustomSource = leadSource === "__custom__";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (tin.trim() && !isValidTin(tin)) {
          setTinError("A Sri Lankan TIN is nine digits. Fix it or clear it, then save.");
          return;
        }
        setTinError(null);
        setBusy(true);
        await onSave({
          name,
          tin: tin.trim() || undefined,
          contact: contact || undefined,
          notes: notes || undefined,
          wholesale: wholesale || undefined,
          taxExempt: taxExempt || undefined,
          relatedParty: relatedParty || undefined,
          address: address.trim() || undefined,
          idReference: idReference.trim() || undefined,
          guarantorName: guarantorName.trim() || undefined,
          guarantorContact: guarantorContact.trim() || undefined,
          // Only the Owner picks who chases a customer. For anyone else the keys are left out of the save
          // altogether (not sent as blank), so editing a customer never wipes the assignment.
          ...(canAssignCollector ? { collectorUid: collectorUid || undefined, collectorName: collectorUid ? collectorName || undefined : undefined } : {}),
          cac: showFinancialFields && cac ? parseFloat(cac) : undefined,
          // 0 or blank both mean "no limit" — stored as cleared, never as a 0 limit.
          creditLimit: showFinancialFields && parseFloat(creditLimit) > 0 ? parseFloat(creditLimit) : undefined,
          leadSource: isCustomSource ? customSource || undefined : leadSource || undefined,
          customFields: cleanCustomFields(customerLabels, customValues),
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <Field>
        <Label>Name</Label>
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nimal Fernando" />
      </Field>
      <Field>
        <Label>Phone or email (optional)</Label>
        <Input value={contact} onChange={(e) => setContact(e.target.value)} />
      </Field>
      <Field>
        <Label>How did they find you? (optional)</Label>
        <Select
          value={
            leadSource && !CUSTOMER_LEAD_SOURCES.includes(leadSource) ? "__custom__" : leadSource
          }
          onChange={(e) => setLeadSource(e.target.value)}
        >
          <option value="">— not set —</option>
          {CUSTOMER_LEAD_SOURCE_UNGROUPED.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          {CUSTOMER_LEAD_SOURCE_GROUPS.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.options.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="__custom__">Other (type below)</option>
        </Select>
        {isCustomSource && (
          <Input
            className="mt-2"
            value={customSource}
            onChange={(e) => setCustomSource(e.target.value)}
            placeholder="e.g. Trade show, cold call"
          />
        )}
      </Field>
      {customerLabels.map((label) => (
        <Field key={label}>
          <Label>{label} (optional)</Label>
          <Input value={customValues[label] ?? ""} onChange={(e) => setCustomValues((m) => ({ ...m, [label]: e.target.value }))} />
        </Field>
      ))}
      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <Checkbox checked={wholesale} onCheckedChange={setWholesale} className="mt-0.5" />
        <span>
          Wholesale customer
          <span className="block text-xs text-muted">On a sale to them, an item&apos;s wholesale price is offered as a one-tap suggestion. Nothing changes by itself.</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <Checkbox checked={relatedParty} onCheckedChange={setRelatedParty} className="mt-0.5" />
        <span>
          Related party
          <span className="block text-xs text-muted">A family member, a company you control or a director. Sales to them count in the related-party red flag.</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <Checkbox checked={taxExempt} onCheckedChange={setTaxExempt} className="mt-0.5" />
        <span>
          Tax-exempt customer
          <span className="block text-xs text-muted">No sales tax is charged on sales to them from now on. Sales already recorded keep the tax they had.</span>
        </span>
      </label>
      <Field>
        <Label>Buyer&apos;s TIN (VAT-registered buyers only)</Label>
        <Input value={tin} onChange={(e) => setTin(e.target.value)} placeholder="Nine digits" maxLength={20} />
        {tinError ? <div className="text-[11px] mt-1 text-bad">{tinError}</div> : <div className="text-[11px] mt-1 text-muted">Printed on their tax invoices. Leave blank if they are not VAT-registered.</div>}
      </Field>
      <div className="rounded-md border border-line bg-panel2/40 px-3 py-3 space-y-3">
        <div>
          <div className="text-sm font-medium">If they ever owe you money (optional)</div>
          <div className="text-xs text-muted mt-0.5">Whatever helps you find them and chase it. Notes for your own records; nothing is checked against any register.</div>
        </div>
        <Field>
          <Label>Address</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Where to find them" />
        </Field>
        <Field>
          <Label>ID or registration no.</Label>
          <Input value={idReference} onChange={(e) => setIdReference(e.target.value)} placeholder="Only to tell two people with the same name apart" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <Label>Guarantor</Label>
            <Input value={guarantorName} onChange={(e) => setGuarantorName(e.target.value)} placeholder="Who stands behind them" />
          </Field>
          <Field>
            <Label>Guarantor phone</Label>
            <Input value={guarantorContact} onChange={(e) => setGuarantorContact(e.target.value)} />
          </Field>
        </div>
        {canAssignCollector && (
          <Field>
            <Label>Who chases their late payments</Label>
            <CollectorSelect value={collectorUid} onChange={(uid, name) => { setCollectorUid(uid); setCollectorName(name); }} choices={collectorChoices} emptyLabel="Nobody assigned" />
          </Field>
        )}
      </div>
      {showFinancialFields && (
        <>
      <Field>
        <Label>CAC - Customer Acquisition Cost (optional)</Label>
        <Input type="number" step="0.01" value={cac} onChange={(e) => setCac(e.target.value)} placeholder="e.g. 50.00" />
      </Field>
      <Field>
        <Label>Credit limit (optional)</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={creditLimit}
          onChange={(e) => setCreditLimit(e.target.value)}
          placeholder="e.g. 50000"
          inputMode="decimal"
        />
        <div className="text-xs text-muted mt-1">
          Leave blank for no limit. It&apos;s a warning only — flagged here and on the credit-sale form when they&apos;re over it. Nothing is blocked.
        </div>
      </Field>
        </>
      )}
      <div className="flex items-center justify-between pt-2">
        <div>
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
