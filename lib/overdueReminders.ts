// Automatic overdue-invoice reminders by email. Pure: the cron route does the reads, the sends and the log.
// Off by default per business. A reminder goes to the customer's email only, once per invoice per interval, and only for an
// invoice that is past its due date and still has a balance. It is a reminder to pay, not marketing.

export const REMINDER_MIN_DAYS = 1;
export const REMINDER_MAX_DAYS = 60;
export const REMINDER_DEFAULT_DAYS = 7;
export const REMINDER_RUN_LIMIT = 200; // emails per daily run, so one run cannot flood a provider

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The contact on a sale is free text (a phone number, an email, or both). Only an email address can receive a reminder.
export function customerEmail(contact: string | undefined | null): string | null {
  if (!contact) return null;
  const found = contact.split(/[\s,;]+/).find((part) => EMAIL_RE.test(part));
  return found ? found.slice(0, 200) : null;
}

export function clampReminderDays(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : REMINDER_DEFAULT_DAYS;
  return Math.min(REMINDER_MAX_DAYS, Math.max(REMINDER_MIN_DAYS, v));
}

// Whole days between two ISO dates (to minus from).
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

// True when no reminder has gone for this invoice yet, or the last one is at least `everyDays` old.
export function reminderDue(lastSentIso: string | undefined, today: string, everyDays: number): boolean {
  if (!lastSentIso) return true;
  return daysBetween(lastSentIso, today) >= everyDays;
}

export function reminderText(p: {
  ref: string;
  businessName: string;
  currency: string;
  balance: number;
  dueDate: string | null;
  link: string;
  paymentInstructions?: string | null;
}): { subject: string; text: string } {
  const money = `${p.currency} ${p.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const business = p.businessName.trim() || "Your supplier";
  const lines = [
    `This is a reminder from ${business}.`,
    "",
    `Invoice ${p.ref} has a balance of ${money}${p.dueDate ? `, which was due on ${p.dueDate}` : ""}.`,
    "",
    `You can view the invoice and what is still owed here: ${p.link}`,
  ];
  if (p.paymentInstructions?.trim()) lines.push("", "How to pay:", p.paymentInstructions.trim());
  lines.push(
    "",
    "If you have already paid, please ignore this reminder. The business records payments on its side, and it may take a day to update.",
    "",
    "This message was sent by Balancr on behalf of the business above. Reply to the business directly for questions about the invoice."
  );
  return { subject: `Reminder: invoice ${p.ref} is overdue`, text: lines.join("\n") };
}
