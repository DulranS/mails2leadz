import type {
  Notification,
  NotificationType,
  NotificationPriority,
  Product,
  Expense,
  Loan,
  Lead,
  Recurrence,
  Shipment,
  Rental,
} from "./types";
import type { ReceivableLine, PayableLine, BillPayableLine, ProductLedgerResult, ProjectBudgetAlert, MilestoneReminder, GrowthLevers } from "./calculations";
import { todayIso } from "./format";
import { SHIPMENT_STAGES, isOverdue } from "./shipments";
import { isRentalOverdue } from "./rentals";
import { recurrenceLandsOn, addDaysIso, computeLoanSummary } from "./calculations";
import type { LentLoanSummary } from "./lending";
import type { CustomerRhythm } from "./orderFrequency";

// Next calendar date on/after `fromIso` that a recurring item lands on,
// searching forward up to 45 days (enough to guarantee a hit for weekly/
// monthly/yearly recurrence regardless of anchor day). Returns null for
// "none" or if nothing lands in that window (shouldn't happen for the
// three real recurrences, but a bad anchor date shouldn't infinite-loop).
function nextOccurrenceOnOrAfter(anchorIso: string, recurrence: Recurrence, fromIso: string): string | null {
  if (recurrence === "none") return null;
  for (let i = 0; i <= 45; i++) {
    const candidate = addDaysIso(fromIso, i);
    if (recurrenceLandsOn(anchorIso, recurrence, candidate)) return candidate;
  }
  return null;
}

/**
 * Notification automation hooks for business events.
 * These functions generate notifications based on business state changes.
 * They're designed to be called from the frontend when data changes,
 * providing a pull-based notification system without requiring backend jobs.
 */

// Helper function to calculate days between two ISO dates
function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}


function getPriorityForDaysOverdue(daysOverdue: number): NotificationPriority {
  if (daysOverdue <= 0) return "low";
  if (daysOverdue <= 1) return "low";
  if (daysOverdue <= 7) return "medium";
  if (daysOverdue <= 14) return "medium";
  if (daysOverdue <= 30) return "high";
  return "high";
}

/**
 * Generate notifications for overdue receivables
 */
export function generateReceivableNotifications(
  receivables: ReceivableLine[]
): Omit<Notification, "id" | "createdAt">[] {
  const notifications: Omit<Notification, "id" | "createdAt">[] = [];
  const today = todayIso();

  for (const r of receivables) {
    const daysOverdue = daysBetween(r.dueDate, today);
    const priority = getPriorityForDaysOverdue(daysOverdue);

    // Only create notifications for items that are overdue or due soon
    if (daysOverdue <= -7) continue; // Not due for 7+ days

    const type: NotificationType = daysOverdue > 0 ? "receivable_overdue" : "receivable_due_soon";
    const title = daysOverdue > 0
      ? `Overdue payment from ${r.customer}`
      : `Payment due from ${r.customer}`;

    const message = daysOverdue > 0
      ? `${r.productName} - ${r.amountOutstanding.toLocaleString()} overdue by ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""}`
      : `${r.productName} - ${r.amountOutstanding.toLocaleString()} due in ${Math.abs(daysOverdue)} day${Math.abs(daysOverdue) !== 1 ? "s" : ""}`;

    notifications.push({
      type,
      priority,
      title,
      message,
      entityId: r.saleId,
      entityType: "sale",
      dueDate: r.dueDate,
      isRead: false,
    });
  }

  return notifications;
}

/**
 * Generate notifications for overdue payables
 */
export function generatePayableNotifications(
  payables: PayableLine[]
): Omit<Notification, "id" | "createdAt">[] {
  const notifications: Omit<Notification, "id" | "createdAt">[] = [];
  const today = todayIso();

  for (const p of payables) {
    const daysOverdue = daysBetween(p.dueDate, today);
    const priority = getPriorityForDaysOverdue(daysOverdue);

    // Only create notifications for items that are overdue or due soon
    if (daysOverdue <= -7) continue; // Not due for 7+ days

    const type: NotificationType = daysOverdue > 0 ? "payable_overdue" : "payable_due_soon";
    const title = daysOverdue > 0
      ? `Overdue payment to ${p.supplier}`
      : `Payment due to ${p.supplier}`;

    const message = daysOverdue > 0
      ? `${p.productName} - ${p.amountOutstanding.toLocaleString()} overdue by ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""}`
      : `${p.productName} - ${p.amountOutstanding.toLocaleString()} due in ${Math.abs(daysOverdue)} day${Math.abs(daysOverdue) !== 1 ? "s" : ""}`;

    notifications.push({
      type,
      priority,
      title,
      message,
      entityId: p.purchaseId,
      entityType: "purchase",
      dueDate: p.dueDate,
      isRead: false,
    });
  }

  return notifications;
}

/**
 * Generate notifications for one-off unpaid bills — a rent invoice, a
 * utility bill, a contractor invoice — anything entered as "owed, not
 * paid yet" rather than a supplier credit purchase. These already have a
 * full settlement flow (Record payment, with partial-payment tracking,
 * on the Receivables & Payables page) but previously had no reminder at
 * all pointing you there, unlike supplier payables above.
 */
export function generateBillNotifications(
  bills: BillPayableLine[]
): Omit<Notification, "id" | "createdAt">[] {
  const notifications: Omit<Notification, "id" | "createdAt">[] = [];
  const today = todayIso();

  for (const b of bills) {
    const daysOverdue = daysBetween(b.dueDate, today);
    const priority = getPriorityForDaysOverdue(daysOverdue);

    if (daysOverdue <= -7) continue; // not due for 7+ days

    const type: NotificationType = daysOverdue > 0 ? "payable_overdue" : "payable_due_soon";
    const title = daysOverdue > 0 ? `Overdue bill: ${b.payee}` : `Bill due: ${b.payee}`;
    const message = daysOverdue > 0
      ? `${b.category} - ${b.amountOutstanding.toLocaleString()} overdue by ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""}`
      : `${b.category} - ${b.amountOutstanding.toLocaleString()} due in ${Math.abs(daysOverdue)} day${Math.abs(daysOverdue) !== 1 ? "s" : ""}`;

    notifications.push({
      type,
      priority,
      title,
      message,
      entityId: b.expenseId,
      entityType: "bill",
      dueDate: b.dueDate,
      isRead: false,
    });
  }

  return notifications;
}

/**
 * Generate notifications for low stock items
 */
export function generateLowStockNotifications(
  products: Product[],
  ledgers: Map<string, ProductLedgerResult>,
  eoqByProduct: Map<string, { eoq: number }>,
  lowStockThreshold: number = 5
): Omit<Notification, "id" | "createdAt">[] {
  const notifications: Omit<Notification, "id" | "createdAt">[] = [];

  for (const product of products) {
    const ledger = ledgers.get(product.id);
    const qtyOnHand = ledger?.qtyOnHand || 0;

    if (qtyOnHand <= lowStockThreshold) {
      const eoq = eoqByProduct.get(product.id)?.eoq || 0;
      const priority = qtyOnHand === 0 ? "high" : "medium";

      notifications.push({
        type: "low_stock",
        priority,
        title: `Low stock: ${product.name}`,
        message: `Only ${qtyOnHand} unit${qtyOnHand !== 1 ? "s" : ""} remaining. Suggested reorder: ${eoq} units.`,
        entityId: product.id,
        entityType: "product",
        isRead: false,
      });
    }
  }

  return notifications;
}

/**
 * Generate notifications for due expenses
 */
export function generateExpenseNotifications(
  expenses: Expense[]
): Omit<Notification, "id" | "createdAt">[] {
  const notifications: Omit<Notification, "id" | "createdAt">[] = [];
  const today = todayIso();

  for (const expense of expenses) {
    if (!expense.isRecurring || expense.recurrence === "none") continue;
    if (expense.endDate && today > expense.endDate) continue;

    // Find the NEXT occurrence on/after today, not the original startDate —
    // a recurring expense (rent, payroll) keeps recurring for as long as
    // it's active, so the reminder has to keep finding a new due date each
    // period too, or it only ever fires once, the first week it exists,
    // and goes silent forever after (e.g. "pay the employee" would only
    // ever remind you the month you added them).
    const nextDue = nextOccurrenceOnOrAfter(expense.startDate, expense.recurrence, today);
    if (!nextDue || (expense.endDate && nextDue > expense.endDate)) continue;
    const daysUntilDue = daysBetween(today, nextDue);
    if (daysUntilDue > 7) continue;

    const priority = daysUntilDue <= 1 ? "high" : "medium";
    const payrollFor = expense.employeeId ? " (payroll)" : "";

    notifications.push({
      type: "expense_due",
      priority,
      title: `Expense due: ${expense.name}${payrollFor}`,
      message:
        daysUntilDue <= 0
          ? `${expense.amount.toLocaleString()} due today`
          : `${expense.amount.toLocaleString()} due in ${daysUntilDue} day${daysUntilDue !== 1 ? "s" : ""}`,
      entityId: expense.id,
      entityType: "expense",
      dueDate: nextDue,
      isRead: false,
    });
  }

  return notifications;
}

/**
 * Generate notifications for loan payments
 */
export function generateLoanNotifications(
  loans: Loan[]
): Omit<Notification, "id" | "createdAt">[] {
  const notifications: Omit<Notification, "id" | "createdAt">[] = [];
  const today = todayIso();

  for (const loan of loans) {
    if (!loan.active) continue;

    // The loan's real amortization schedule, not the raw startDate — a
    // loan has one payment per month for its whole term, so (like
    // recurring expenses above) this needs the next unpaid installment's
    // date, which shifts every month, not the date the loan was taken out.
    const { nextPaymentDate, nextPaymentAmount } = computeLoanSummary(loan, today);
    if (!nextPaymentDate) continue;
    const daysUntilDue = daysBetween(today, nextPaymentDate);
    if (daysUntilDue > 7 || daysUntilDue < 0) continue;

    const priority = daysUntilDue <= 1 ? "high" : "medium";

    notifications.push({
      type: "loan_payment_due",
      priority,
      title: `Loan payment due: ${loan.name}`,
      message:
        daysUntilDue <= 0
          ? `${(nextPaymentAmount ?? 0).toLocaleString()} due today`
          : `${(nextPaymentAmount ?? 0).toLocaleString()} due in ${daysUntilDue} day${daysUntilDue !== 1 ? "s" : ""}`,
      entityId: loan.id,
      entityType: "loan",
      dueDate: nextPaymentDate,
      isRead: false,
    });
  }

  return notifications;
}

/**
 * A borrower who is behind on money the business lent out. One alert per loan, keyed on the date of the oldest
 * payment still unpaid, so a loan that catches up and later slips again raises a fresh alert.
 */
export function generateLentLoanNotifications(
  loans: LentLoanSummary[]
): Omit<Notification, "id" | "createdAt">[] {
  const today = todayIso();
  return loans
    .filter((s) => s.status === "overdue" && s.overdueAmount > 0.5)
    .map((s) => ({
      type: "lent_loan_late" as NotificationType,
      priority: (s.daysOverdue >= 30 ? "high" : "medium") as NotificationPriority,
      title: `${s.loan.borrower} is late paying you`,
      message: `${Math.round(s.overdueAmount).toLocaleString()} is overdue by ${s.daysOverdue} day${s.daysOverdue === 1 ? "" : "s"}. Interest keeps building until they pay.`,
      entityId: s.loan.id,
      entityType: "lentLoan",
      dueDate: addDaysIso(today, -s.daysOverdue),
      isRead: false,
    }));
}

/**
 * Generate notifications for projects approaching or past their quoted
 * budget. `computeProjectBudgetAlerts` (lib/calculations.ts) already does
 * the filtering/threshold work — this just turns each alert into a
 * notification, medium priority while still under 100% (a heads-up) and
 * high once actual cost has passed the quote (already losing money).
 */
export function generateProjectBudgetNotifications(
  alerts: ProjectBudgetAlert[]
): Omit<Notification, "id" | "createdAt">[] {
  return alerts.map((a) => ({
    type: "project_over_budget" as NotificationType,
    priority: (a.isOverBudget ? "high" : "medium") as NotificationPriority,
    title: a.isOverBudget ? `Over budget: ${a.name}` : `Approaching budget: ${a.name}`,
    message: a.isOverBudget
      ? `Actual cost ${a.totalCost.toLocaleString()} has passed the quoted price of ${a.quotedPrice.toLocaleString()} (${a.budgetUsedPct.toFixed(0)}% used).`
      : `Actual cost ${a.totalCost.toLocaleString()} is at ${a.budgetUsedPct.toFixed(0)}% of the quoted price ${a.quotedPrice.toLocaleString()}.`,
    entityId: a.projectId,
    entityType: "project",
    isRead: false,
  }));
}

/**
 * Generate notifications for progress-billing milestones that are overdue
 * or due within the reminder window. `computeMilestoneReminders` (lib/
 * calculations.ts) does the filtering — this just turns each into a
 * notification, mirroring generateReceivableNotifications' overdue/upcoming
 * split.
 */
export function generateMilestoneNotifications(
  reminders: MilestoneReminder[]
): Omit<Notification, "id" | "createdAt">[] {
  return reminders.map((r) => ({
    type: "milestone_due" as NotificationType,
    priority: (r.isOverdue ? "high" : "medium") as NotificationPriority,
    title: r.isOverdue
      ? `Overdue: ${r.label} — ${r.projectName}`
      : `Due soon: ${r.label} — ${r.projectName}`,
    message: r.isOverdue
      ? `${r.amount.toLocaleString()} was due ${Math.abs(r.daysUntilDue)} day${Math.abs(r.daysUntilDue) === 1 ? "" : "s"} ago on ${r.dueDate}.`
      : r.daysUntilDue === 0
        ? `${r.amount.toLocaleString()} is due today.`
        : `${r.amount.toLocaleString()} is due in ${r.daysUntilDue} day${r.daysUntilDue === 1 ? "" : "s"} (${r.dueDate}).`,
    entityId: r.projectId,
    entityType: "project",
    isRead: false,
  }));
}

/**
 * Generate notifications for leads whose next-follow-up date has arrived
 * or passed — the proactive half of the "so a follow-up never quietly
 * gets forgotten" promise in the Lead doc comment (lib/types.ts): the
 * overdue flag on the Leads page card only helps if someone thinks to
 * open that page, so this surfaces the same thing on the bell icon/
 * Notifications page, same as every other "something needs your
 * attention" item in the app. Skips Won/Lost leads (nothing to follow up
 * on) and leads with no follow-up date set (nothing to be overdue
 * against) — same "only if there's an actual date to compare" gate
 * generateReceivableNotifications above uses.
 */
export function generateLeadNotifications(leads: Lead[]): Omit<Notification, "id" | "createdAt">[] {
  const notifications: Omit<Notification, "id" | "createdAt">[] = [];
  const today = todayIso();

  for (const l of leads) {
    if (l.stage === "won" || l.stage === "lost") continue;
    if (!l.nextFollowUpDate) continue;
    const daysOverdue = daysBetween(l.nextFollowUpDate, today);
    if (daysOverdue <= -7) continue; // Not due for 7+ days

    const priority = getPriorityForDaysOverdue(daysOverdue);
    const title = daysOverdue > 0 ? `Follow up with ${l.name}` : `Follow-up coming up: ${l.name}`;
    const message =
      daysOverdue > 0
        ? `Follow-up was due ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} ago (${l.nextFollowUpDate}).`
        : `Follow-up due in ${Math.abs(daysOverdue)} day${Math.abs(daysOverdue) !== 1 ? "s" : ""} (${l.nextFollowUpDate}).`;

    notifications.push({
      type: "lead_follow_up",
      priority,
      title,
      message,
      entityId: l.id,
      entityType: "lead",
      dueDate: l.nextFollowUpDate,
      isRead: false,
    });
  }

  return notifications;
}

/**
 * Generate all notifications based on current business state
 * This is the main entry point for notification automation
 */
/**
 * Generate advisory notifications when a growth lever (COGS, operating
 * costs, average selling price, average order value) has moved against the
 * business by more than `thresholdPct` over the trailing window vs. the
 * window before it. Deliberately just a nudge to go look at the Growth
 * levers panel on My Profit — no auto-action, no external system, nothing
 * this can get wrong that a human reviewing the numbers wouldn't catch.
 * One stable entityId per lever (not per period) so a lever that's still
 * trending the wrong way doesn't spawn a fresh notification every time the
 * window rolls forward — it just keeps existing until read/dismissed.
 */
export function generateGrowthLeverNotifications(
  growthLevers: GrowthLevers,
  thresholdPct = 10
): Omit<Notification, "id" | "createdAt">[] {
  const notifications: Omit<Notification, "id" | "createdAt">[] = [];
  const priorityFor = (pct: number): NotificationPriority => (Math.abs(pct) >= 25 ? "high" : "medium");

  const { cogsPctOfRevenue, operatingExpenses, avgSellingPrice, averageOrderValue } = growthLevers;

  if (cogsPctOfRevenue.changePct !== null && cogsPctOfRevenue.changePct >= thresholdPct) {
    notifications.push({
      type: "growth_lever",
      priority: priorityFor(cogsPctOfRevenue.changePct),
      title: "Cost of goods sold is creeping up",
      message: `COGS is now ${cogsPctOfRevenue.current!.toFixed(1)}% of revenue, up from ${cogsPctOfRevenue.prior!.toFixed(1)}% the period before — worth checking supplier prices or wastage.`,
      entityId: "growth-lever-cogs",
      entityType: "insight",
      isRead: false,
    });
  }

  if (operatingExpenses.changePct !== null && operatingExpenses.changePct >= thresholdPct) {
    notifications.push({
      type: "growth_lever",
      priority: priorityFor(operatingExpenses.changePct),
      title: "Operating costs are rising",
      message: `Operating expenses are up ${operatingExpenses.changePct.toFixed(0)}% vs. the prior period — worth a look at what's driving it before it becomes the new normal.`,
      entityId: "growth-lever-opex",
      entityType: "insight",
      isRead: false,
    });
  }

  if (avgSellingPrice.changePct !== null && avgSellingPrice.changePct <= -thresholdPct) {
    notifications.push({
      type: "growth_lever",
      priority: priorityFor(avgSellingPrice.changePct),
      title: "Average selling price is slipping",
      message: `You're taking in ${Math.abs(avgSellingPrice.changePct).toFixed(0)}% less per unit than the prior period — check for discounting creep or a shift toward cheaper items.`,
      entityId: "growth-lever-price",
      entityType: "insight",
      isRead: false,
    });
  }

  if (averageOrderValue.changePct !== null && averageOrderValue.changePct <= -thresholdPct) {
    notifications.push({
      type: "growth_lever",
      priority: priorityFor(averageOrderValue.changePct),
      title: "Average order value is dropping",
      message: `Customers are spending ${Math.abs(averageOrderValue.changePct).toFixed(0)}% less per order than the prior period — an upsell, bundle, or order minimum could help.`,
      entityId: "growth-lever-aov",
      entityType: "insight",
      isRead: false,
    });
  }

  return notifications;
}

// One reminder per shipment still on the way past its expected day. Delivered shipments never appear here, and nothing is raised
// for a shipment that is not yet due, so the list only shows what is already late.
export function generateShipmentNotifications(shipments: Shipment[], today: string = todayIso()): Omit<Notification, "id" | "createdAt">[] {
  const out: Omit<Notification, "id" | "createdAt">[] = [];
  for (const s of shipments) {
    if (!isOverdue(s, today) || !s.etaDate) continue;
    const days = daysBetween(s.etaDate, today);
    const stage = SHIPMENT_STAGES.find((x) => x.value === s.stage)?.label ?? s.stage;
    out.push({
      type: "shipment_overdue",
      priority: getPriorityForDaysOverdue(days),
      title: `Shipment overdue: ${s.reference}`,
      message: `Expected ${s.etaDate}, ${days} day${days !== 1 ? "s" : ""} ago. Still at: ${stage}.`,
      entityId: s.id,
      entityType: "shipment",
      dueDate: s.etaDate,
      isRead: false,
    });
  }
  return out;
}

// One reminder per rented-out item still not back past its due-back day. Returned items never appear here.
export function generateRentalNotifications(rentals: Rental[], today: string = todayIso()): Omit<Notification, "id" | "createdAt">[] {
  const out: Omit<Notification, "id" | "createdAt">[] = [];
  for (const r of rentals) {
    if (!isRentalOverdue(r, today)) continue;
    const days = daysBetween(r.dueBackDate, today);
    out.push({
      type: "rental_overdue",
      priority: getPriorityForDaysOverdue(days),
      title: `Rental overdue: ${r.item}`,
      message: `${r.customer} was due to return it ${r.dueBackDate}, ${days} day${days !== 1 ? "s" : ""} ago. Rent keeps counting per day.`,
      entityId: r.id,
      entityType: "rental",
      dueDate: r.dueBackDate,
      isRead: false,
    });
  }
  return out;
}

// Customers who used to buy on a regular rhythm and have gone quiet (the "Gone quiet" status on the Customers page).
// Without this the win-back prompt only exists on that one page. Only "slipping" customers are raised: "due to reorder"
// is a normal nudge and stays on the Customers page so the bell is not flooded. The most-overdue are kept if there are many.
// The date on each one is the customer's last order, so a lapse is raised once, and again only after they buy and lapse
// again. Marking it read stops it coming back for that same lapse.
export const MAX_QUIET_CUSTOMER_NOTIFICATIONS = 20;

export function generateCustomerQuietNotifications(rhythms: CustomerRhythm[]): Omit<Notification, "id" | "createdAt">[] {
  return rhythms
    .filter((r) => r.status === "slipping")
    .sort((a, b) => b.daysSinceLast - a.daysSinceLast || a.name.localeCompare(b.name))
    .slice(0, MAX_QUIET_CUSTOMER_NOTIFICATIONS)
    .map((r) => {
      const gap = r.typicalGapDays ?? 0;
      // Slipping means at least twice the usual gap; three times or more is the urgent end.
      const priority: NotificationPriority = gap > 0 && r.daysSinceLast >= 3 * gap ? "high" : "medium";
      const usual = gap > 0 ? ` They usually order about every ${gap} day${gap === 1 ? "" : "s"}.` : "";
      return {
        type: "customer_quiet" as NotificationType,
        priority,
        title: `Win back ${r.name}`,
        message: `Last order ${r.daysSinceLast} day${r.daysSinceLast === 1 ? "" : "s"} ago (${r.lastOrder}).${usual}`,
        entityId: r.key,
        entityType: "customer",
        dueDate: r.lastOrder,
        isRead: false,
      };
    });
}

export function generateAllNotifications(params: {
  receivables: ReceivableLine[];
  payables: PayableLine[];
  bills: BillPayableLine[];
  products: Product[];
  ledgers: Map<string, ProductLedgerResult>;
  eoqByProduct: Map<string, { eoq: number }>;
  expenses: Expense[];
  loans: Loan[];
  projectBudgetAlerts: ProjectBudgetAlert[];
  milestoneReminders: MilestoneReminder[];
  leads: Lead[];
  shipments?: Shipment[];
  rentals?: Rental[];
  growthLevers?: GrowthLevers;
  lentLoans?: LentLoanSummary[];
  customerRhythms?: CustomerRhythm[];
}): Omit<Notification, "id" | "createdAt">[] {
  const {
    receivables,
    payables,
    bills,
    products,
    ledgers,
    eoqByProduct,
    expenses,
    loans,
    projectBudgetAlerts,
    milestoneReminders,
    leads,
    growthLevers,
    lentLoans,
  } = params;

  return [
    ...generateReceivableNotifications(receivables),
    ...generatePayableNotifications(payables),
    ...generateBillNotifications(bills),
    ...generateLowStockNotifications(products, ledgers, eoqByProduct),
    ...generateExpenseNotifications(expenses),
    ...generateLoanNotifications(loans),
    ...generateLentLoanNotifications(lentLoans ?? []),
    ...generateProjectBudgetNotifications(projectBudgetAlerts),
    ...generateMilestoneNotifications(milestoneReminders),
    ...generateLeadNotifications(leads),
    ...generateShipmentNotifications(params.shipments ?? []),
    ...generateRentalNotifications(params.rentals ?? []),
    ...(growthLevers ? generateGrowthLeverNotifications(growthLevers) : []),
    ...generateCustomerQuietNotifications(params.customerRhythms ?? []),
  ];
}
