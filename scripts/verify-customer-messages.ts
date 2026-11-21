// Customer messages (lib/customerMessages.ts): each message is due in its window and only then, sent once per event, service messages to everyone who has not
// refused, promotional messages only when switched on and only to customers who have not opted out, a booking confirmation within the hour, a reminder a
// day ahead, a quote followed up after three days, a thank-you the day after a job, a review ask after three to five days, a welcome after a first order.
// Worked times. Run: npx tsx scripts/verify-customer-messages.ts
import { dueMessages, MESSAGE_RULES } from "../lib/customerMessages";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const H = 3_600_000, D = 24 * H;
const now = Date.parse("2026-11-14T10:00:00Z");
type Events = Parameters<typeof dueMessages>[0];
const empty: Events = { bookings: [], estimates: [], projects: [], firstSales: [] };
const run = (ev: Partial<Events>, sent: string[] = [], review = false) =>
  dueMessages({ ...empty, ...ev }, new Set(sent), now, "Shop", review);

ok(MESSAGE_RULES.length === 6 && MESSAGE_RULES.filter((r) => r.kind === "promotional").map((r) => r.id).join() === "review_request", "six messages, and only the review request is promotional");
ok(run({ bookings: [{ id: "b1", customer: "Nimal", startsAt: now + 24 * H, createdAt: now - 10 * 60_000, status: "booked" }] }).map((m) => m.ruleId).join() === "booking_confirmation,booking_reminder", "a booking made ten minutes ago gets its confirmation, and one starting in a day gets its reminder");
ok(run({ bookings: [{ id: "b2", customer: "Ravi", startsAt: now + 48 * H, createdAt: now - 2 * H, status: "booked" }] }).length === 0, "a booking made two hours ago and starting in two days is not due yet");
ok(run({ bookings: [{ id: "b3", customer: "Amal", startsAt: now + 24 * H, createdAt: now - 10 * 60_000, status: "cancelled" }] }).length === 0, "a cancelled booking sends nothing");
ok(run({ estimates: [{ id: "q1", customer: "Kamal", sentAt: now - 4 * D, status: "sent" }] }).map((m) => m.ruleId).join() === "quote_follow_up", "a quote sent four days ago and not answered is followed up");
ok(run({ estimates: [{ id: "q2", customer: "Kamal", sentAt: now - 4 * D, status: "accepted" }] }).length === 0, "a quote already accepted is not followed up");
ok(run({ projects: [{ id: "p1", customer: "Sunil", completedAt: now - 5 * H }] }).map((m) => m.ruleId).join() === "thank_you", "a job finished five hours ago gets a thank-you");
ok(run({ projects: [{ id: "p2", customer: "Sunil", completedAt: now - 4 * D }] }, [], true).map((m) => m.ruleId).join() === "review_request", "a job finished four days ago gets a review ask, when reviews are switched on");
ok(run({ projects: [{ id: "p3", customer: "Sunil", completedAt: now - 4 * D }] }, [], false).length === 0, "the review ask is off unless the owner switches it on");
ok(run({ projects: [{ id: "p4", customer: "Sunil", completedAt: now - 4 * D, optedOut: true }] }, [], true).length === 0, "a customer who has opted out gets no review ask");
ok(run({ projects: [{ id: "p5", customer: "Sunil", completedAt: now - 5 * H, optedOut: true }] }).length === 0, "a customer who has refused messages gets no thank-you");
ok(run({ bookings: [{ id: "b9", customer: "Sunil", startsAt: now + 24 * H, createdAt: now - 10 * 60_000, status: "booked", optedOut: true }] }).map((m) => m.ruleId).join() === "booking_confirmation,booking_reminder", "a customer who has refused messages still gets the confirmation and reminder for a booking they made");
ok(run({ firstSales: [{ id: "s1", customer: "Lalith", at: now - 2 * H }] }).map((m) => m.ruleId).join() === "welcome", "a first order two hours ago gets a welcome");
ok(run({ projects: [{ id: "p6", customer: "Sunil", completedAt: now - 5 * H }] }, ["project:p6:thanks"]).length === 0, "a message already sent for an event is not sent again");
ok(run({ firstSales: [{ id: "s2", customer: "  Lalith ", at: now - 2 * H }] }, ["customer:lalith:welcome"]).length === 0, "a welcome already sent is not repeated, whatever the spacing or case of the name");
ok(MESSAGE_RULES.every((r) => r.text("Shop").includes("Shop")), "every message names the business");
ok(run({ projects: [{ id: "p7", customer: "Sunil", completedAt: now - 4 * D, marketingOut: true }] }, [], true).length === 0, "a customer who has not agreed to marketing gets no review ask");
ok(run({ projects: [{ id: "p8", customer: "Sunil", completedAt: now - 5 * H, marketingOut: true }] }).map((m) => m.ruleId).join() === "thank_you", "a customer who has not agreed to marketing still gets a thank-you for their job");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
