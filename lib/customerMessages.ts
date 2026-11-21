// Customer messages (v265): the routine messages a business sends its customers, worked out from its own records. Service messages (a booking
// confirmation, a day-before reminder, a quote follow-up, a thank-you after a job, a welcome) are part of the job and are sent unless the customer has
// refused messages; a customer who has refused gets no further messages, except the confirmation and reminder for a booking they made themselves. Promotional messages (a review request) are only sent to customers who have not opted out, and are off until the owner turns them on.
// Each message is keyed to the event that caused it, so it goes out once. Pure: this decides what is due; the cron route sends it. Quiet hours and the daily
// cap are applied by the caller.

export type MessageKind = "service" | "promotional";
export interface CustomerEvent { id: string; customer: string; contact?: string; at: number; optedOut?: boolean; marketingOut?: boolean }
// optedOut: the customer has asked not to be messaged at all (set by the owner). marketingOut: the customer has not agreed to promotional messages.

export const MESSAGE_RULES = [
  { id: "booking_confirmation", kind: "service" as MessageKind, text: (b: string) => `Hi, your booking with ${b} is confirmed. Reply to this message if you need to change it.` },
  { id: "booking_reminder", kind: "service" as MessageKind, text: (b: string) => `Reminder from ${b}: your booking is tomorrow. Reply to this message if you cannot make it.` },
  { id: "quote_follow_up", kind: "service" as MessageKind, text: (b: string) => `Hi, we sent you a quote from ${b}. Would you like to go ahead, or shall we change anything?` },
  { id: "thank_you", kind: "service" as MessageKind, text: (b: string) => `Thank you for choosing ${b}. We hope everything was right. Tell us if anything needs fixing.` },
  { id: "welcome", kind: "service" as MessageKind, text: (b: string) => `Welcome to ${b}. Thank you for your first order. Reply any time with questions.` },
  { id: "review_request", kind: "promotional" as MessageKind, text: (b: string) => `Thank you for working with ${b}. If you were happy, a short review would help us a lot.` },
];

// At most this many customer messages go out in one daily run, so a runaway job cannot spend the text balance.
export const CUSTOMER_MESSAGE_RUN_LIMIT = 100;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// The events that make each message due, at the time they are checked (now, in ms).
export function dueMessages(
  events: {
    bookings: { id: string; customer: string; contact?: string; startsAt: number; createdAt: number; status: string; optedOut?: boolean; marketingOut?: boolean }[];
    estimates: { id: string; customer: string; contact?: string; sentAt: number; status: string; optedOut?: boolean; marketingOut?: boolean }[];
    projects: { id: string; customer: string; contact?: string; completedAt: number; optedOut?: boolean; marketingOut?: boolean }[];
    firstSales: CustomerEvent[];
  },
  sent: ReadonlySet<string>,
  now: number,
  business: string,
  reviewRequestsOn: boolean,
) {
  const out: { ruleId: string; key: string; customer: string; contact?: string; text: string; kind: MessageKind }[] = [];
  const add = (ruleId: string, key: string, e: { customer: string; contact?: string; optedOut?: boolean; marketingOut?: boolean }) => {
    const rule = MESSAGE_RULES.find((r) => r.id === ruleId)!;
    if (sent.has(key)) return;
    if (rule.kind === "promotional" && (!reviewRequestsOn || e.marketingOut || e.optedOut)) return;
    if (rule.kind === "service" && e.optedOut === true && ruleId !== "booking_confirmation" && ruleId !== "booking_reminder") return;
    out.push({ ruleId, key, customer: e.customer, contact: e.contact, text: rule.text(business), kind: rule.kind });
  };
  for (const b of events.bookings) {
    if (b.status !== "booked") continue;
    if (now - b.createdAt >= 0 && now - b.createdAt < HOUR) add("booking_confirmation", `booking:${b.id}:confirm`, b);
    const ahead = b.startsAt - now;
    if (ahead >= 18 * HOUR && ahead <= 30 * HOUR) add("booking_reminder", `booking:${b.id}:day`, b);
  }
  for (const q of events.estimates) {
    if (q.status !== "sent") continue;
    const age = now - q.sentAt;
    if (age >= 3 * DAY && age < 7 * DAY) add("quote_follow_up", `estimate:${q.id}:follow`, q);
  }
  for (const p of events.projects) {
    const age = now - p.completedAt;
    if (age >= 0 && age < DAY) add("thank_you", `project:${p.id}:thanks`, p);
    if (age >= 3 * DAY && age < 5 * DAY) add("review_request", `project:${p.id}:review`, p);
  }
  for (const f of events.firstSales) {
    if (now - f.at >= 0 && now - f.at < DAY) add("welcome", `customer:${f.customer.trim().toLowerCase()}:welcome`, f);
  }
  return out;
}
