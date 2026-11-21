"use client";

import { useState } from "react";
import Link from "next/link";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useRequireRole } from "@/lib/roleGuard";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import type { NotificationType, NotificationPriority } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, Stat, StatGridSkeleton, Table, TableCardSkeleton, Tabs } from "@/components/ui";

const PRIORITY_LABEL: Record<NotificationPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const PRIORITY_TONE: Record<NotificationPriority, "default" | "amber" | "bad"> = {
  low: "default",
  medium: "amber",
  high: "bad",
};

// For a recurring reminder (payroll/rent-style expense, a loan
// installment), the underlying cost is already counted in the business's
// numbers the moment it's due — that's correct accrual accounting, same
// as any bill you're on the hook for whether or not you've paid it yet.
// So "mark as done" here doesn't create a second money entry (that would
// double-count it); it just confirms you've handled this period's payment
// and clears the reminder. A fresh one appears automatically next period
// (next month's payroll, next month's rent, the loan's next installment).
const RECURRING_REMINDER_TYPES: NotificationType[] = ["expense_due", "loan_payment_due"];

// Notification types where the real action is settling money you owe or
// are owed — payable_overdue/payable_due_soon covers both supplier credit
// purchases and one-off bills (see generateBillNotifications), and
// receivable_* covers customer invoices. All of them already have a full
// settlement flow (with partial-payment tracking) on Receivables &
// Payables — this just links straight there instead of leaving the person
// to go find it.
const SETTLEMENT_LINK_TYPES: NotificationType[] = [
  "payable_overdue",
  "payable_due_soon",
  "receivable_overdue",
  "receivable_due_soon",
];

const TYPE_LABEL: Record<NotificationType, string> = {
  receivable_overdue: "Overdue payment from customer",
  receivable_due_soon: "Customer payment due soon",
  payable_overdue: "Overdue payment owed",
  payable_due_soon: "Payment owed soon",
  low_stock: "Low stock warning",
  expense_due: "Expense due",
  loan_payment_due: "Loan payment due",
  lent_loan_late: "Borrower is late paying you",
  project_over_budget: "Project budget alert",
  milestone_due: "Milestone payment due",
  growth_lever: "Growth lever alert",
  lead_follow_up: "Lead follow-up due",
  customer_quiet: "Customer gone quiet",
  booking_soon: "Booking coming up",
  sale_due: "Sale not recorded yet",
  shipment_overdue: "Shipment overdue",
  rental_overdue: "Rental overdue",
  quote_answered: "Customer answered a quote",
  enquiry_received: "New website enquiry",
  payment_claimed: "Customer says they paid",
  booking_requested: "Booking request to confirm",
  ticket_requested: "Event seat request to confirm",
  review_received: "Online review",
  order_received: "Web order to confirm",
  custom: "Custom reminder",
};

export default function NotificationsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager"]);
  const { notifications, markNotificationRead, deleteNotification, notificationsLoading: loading } = useNotifications();
  const toast = useToast();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  if (guardLoading || !allowed) return null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const filteredNotifications = filter === "unread"
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  const highPriorityCount = notifications.filter((n) => n.priority === "high" && !n.isRead).length;

  if (loading) {
    return (
      <>
        <PageHeader title="Notifications & Reminders" />
        <Tabs
          tabs={[
            { key: "all", label: "All" },
            { key: "unread", label: "Unread" },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <StatGridSkeleton count={3} />
        <TableCardSkeleton rows={6} cols={5} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Notifications & Reminders" />

      <Tabs
        tabs={[
          { key: "all", label: `All (${notifications.length})` },
          { key: "unread", label: `Unread (${unreadCount})` },
        ]}
        value={filter}
        onChange={setFilter}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <Stat label="Total notifications" value={notifications.length.toString()} />
        <Stat label="Unread" value={unreadCount.toString()} tone={unreadCount > 0 ? "amber" : "default"} />
        <Stat label="High priority" value={highPriorityCount.toString()} tone={highPriorityCount > 0 ? "bad" : "default"} />
      </div>

      {!loading && filteredNotifications.length === 0 && (
        <EmptyState
          title={filter === "unread" ? "No unread notifications" : "No notifications"}
          body={
            filter === "unread"
              ? "You're all caught up! New notifications will appear here when there are overdue payments, low stock warnings, or other reminders."
              : "Notifications will appear here when there are overdue payments, low stock warnings, expense due dates, or other reminders you need to act on."
          }
        />
      )}

      {filteredNotifications.length > 0 && (
        <>
          {/* Mobile: one card per notification. Same data as the table below,
              never rendered at the same time. */}
          <div className="sm:hidden space-y-2.5">
            {[...filteredNotifications].sort((a, b) => b.createdAt - a.createdAt).map((notification) => (
              <Card key={notification.id} className={`!p-3.5 ${!notification.isRead ? "border-amber-dim/40" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{notification.title}</div>
                    <div className="text-xs text-muted mt-0.5">{notification.message}</div>
                  </div>
                  <Badge tone={PRIORITY_TONE[notification.priority]}>{PRIORITY_LABEL[notification.priority]}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                  <div className="text-muted">{TYPE_LABEL[notification.type]}</div>
                  {notification.dueDate && (
                    <div>
                      <span className="text-muted">Due </span>
                      <span className="num">{notification.dueDate}</span>
                    </div>
                  )}
                </div>
                {RECURRING_REMINDER_TYPES.includes(notification.type) && !notification.isRead && (
                  <div className="text-[11px] text-muted mt-1.5">
                    You&apos;ll get a new reminder next time this comes due.
                  </div>
                )}
                {SETTLEMENT_LINK_TYPES.includes(notification.type) && (
                  <Link
                    href="/receivables-payables"
                    className="text-xs text-amber-soft hover:underline mt-2.5 inline-block"
                  >
                    Record payment →
                  </Link>
                )}
                {notification.type === "lent_loan_late" && (
                  <Link href="/lending" className="text-xs text-amber-soft hover:underline mt-2.5 inline-block">
                    Record a payment →
                  </Link>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                  {!notification.isRead && (
                    <button
                      onClick={() =>
                        markNotificationRead(notification.id).catch((err) =>
                          toast.error("Couldn't mark as read", toastableErrorMessage(err))
                        )
                      }
                      className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]"
                    >
                      {RECURRING_REMINDER_TYPES.includes(notification.type) ? "Mark as done" : "Mark read"}
                    </button>
                  )}
                  <button
                    onClick={() =>
                      deleteNotification(notification.id).catch((err) =>
                        toast.error("Couldn't dismiss", toastableErrorMessage(err))
                      )
                    }
                    className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]"
                  >
                    Dismiss
                  </button>
                </div>
              </Card>
            ))}
            <div className="text-[11px] text-muted">
              Notifications are generated automatically based on your business data — overdue payments, low stock items, upcoming expenses, and loan payment schedules. Custom reminders can be added from the relevant pages.
            </div>
          </div>

          {/* Desktop: the full table, unchanged. */}
          <Card className="hidden sm:block">
          <div className="table-container">
            <Table>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                  <th className="py-2 pr-3 font-medium">Priority</th>
                  <th className="py-2 px-3 font-medium">Type</th>
                  <th className="py-2 px-3 font-medium">Title</th>
                  <th className="py-2 px-3 font-medium">Due date</th>
                  <th className="py-2 pl-3 font-medium text-right">·</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredNotifications].sort((a, b) => b.createdAt - a.createdAt).map((notification) => (
                  <tr
                    key={notification.id}
                    className={`border-b border-line last:border-0 ${!notification.isRead ? "bg-panel2/50" : ""}`}
                  >
                    <td className="py-2.5 pr-3">
                      <Badge tone={PRIORITY_TONE[notification.priority]}>
                        {PRIORITY_LABEL[notification.priority]}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-muted text-xs">{TYPE_LABEL[notification.type]}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium">{notification.title}</div>
                      <div className="text-[11px] text-muted mt-0.5">{notification.message}</div>
                      {RECURRING_REMINDER_TYPES.includes(notification.type) && !notification.isRead && (
                        <div className="text-[11px] text-muted mt-0.5">You&apos;ll get a new reminder next time this comes due.</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-muted text-xs">{notification.dueDate ?? "—"}</td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      {SETTLEMENT_LINK_TYPES.includes(notification.type) && (
                        <Link href="/receivables-payables" className="text-xs text-amber-soft hover:underline mr-3">
                          Record payment →
                        </Link>
                      )}
                      {notification.type === "lent_loan_late" && (
                        <Link href="/lending" className="text-xs text-amber-soft hover:underline mr-3">
                          Record a payment →
                        </Link>
                      )}
                      {!notification.isRead && (
                        <button
                          onClick={() =>
                            markNotificationRead(notification.id).catch((err) =>
                              toast.error("Couldn't mark as read", toastableErrorMessage(err))
                            )
                          }
                          className="text-xs text-amber-soft hover:underline mr-3"
                        >
                          {RECURRING_REMINDER_TYPES.includes(notification.type) ? "Mark as done" : "Mark read"}
                        </button>
                      )}
                      <button
                        onClick={() =>
                          deleteNotification(notification.id).catch((err) =>
                            toast.error("Couldn't dismiss", toastableErrorMessage(err))
                          )
                        }
                        className="text-xs text-muted hover:text-bad"
                      >
                        Dismiss
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="text-[11px] text-muted mt-3">
            Notifications are generated automatically based on your business data — overdue payments, low stock items, upcoming expenses, and loan payment schedules. Custom reminders can be added from the relevant pages.
          </div>
          </Card>
        </>
      )}
    </>
  );
}
