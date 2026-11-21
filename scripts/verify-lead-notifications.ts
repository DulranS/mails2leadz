// Verifies the "so a follow-up never quietly gets forgotten" promise in
// the Lead doc comment (lib/types.ts) is actually kept end to end: an
// overdue nextFollowUpDate must turn into a real notification via
// generateLeadNotifications, the same way generateReceivableNotifications
// already does for an overdue payment. Without this, the Leads page's own
// "overdue" flag was the only place that promise was kept — invisible
// unless someone thought to open that specific page.
//
// Run: npx tsx scripts/verify-lead-notifications.ts

import { generateLeadNotifications } from "../lib/notification-automation";
import type { Lead } from "../lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

function lead(overrides: Partial<Lead>): Lead {
  return {
    id: "l1",
    name: "Kamal Hardware",
    stage: "follow_up",
    createdAt: 0,
    ...overrides,
  };
}

const today = new Date().toISOString().slice(0, 10);
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function daysFromNow(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Overdue follow-up on an active lead -> a real notification
const overdue = generateLeadNotifications([lead({ nextFollowUpDate: daysAgo(3) })]);
assert(overdue.length === 1, "an overdue follow-up produces exactly one notification");
assert(overdue[0]?.type === "lead_follow_up", "notification has the right type");
assert(overdue[0]?.entityId === "l1" && overdue[0]?.entityType === "lead", "notification links back to the lead");
assert(overdue[0]?.title.includes("Kamal Hardware"), "notification names the lead");

// Won lead with an "overdue" date -> no notification (nothing left to follow up on)
const won = generateLeadNotifications([lead({ stage: "won", nextFollowUpDate: daysAgo(3) })]);
assert(won.length === 0, "a Won lead never generates a follow-up notification, even with a past date");

// Lost lead -> same
const lost = generateLeadNotifications([lead({ stage: "lost", nextFollowUpDate: daysAgo(3) })]);
assert(lost.length === 0, "a Lost lead never generates a follow-up notification");

// No follow-up date set -> nothing to be overdue against
const noDate = generateLeadNotifications([lead({})]);
assert(noDate.length === 0, "a lead with no next-follow-up date generates nothing");

// Far-future follow-up -> not due yet, no premature notification
const future = generateLeadNotifications([lead({ nextFollowUpDate: daysFromNow(30) })]);
assert(future.length === 0, "a follow-up 30 days out doesn't generate a notification yet");

// Due today -> should still notify (matches receivables' "due soon" behavior)
const dueToday = generateLeadNotifications([lead({ nextFollowUpDate: today })]);
assert(dueToday.length === 1, "a follow-up due today generates a notification");

// A month overdue -> high priority, same escalation as every other overdue item
const wayOverdue = generateLeadNotifications([lead({ nextFollowUpDate: daysAgo(35) })]);
assert(wayOverdue[0]?.priority === "high", "a month-overdue follow-up is high priority");

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
