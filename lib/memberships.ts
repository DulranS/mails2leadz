// Memberships: a prepaid bank of included hours that bookings draw down. Pure: no I/O.
// The fee the member paid is an ordinary sale you record on the Sales page: that is when the money reaches the books. The hours
// here are a count of what is left to use. A booking covered by a membership uses hours and has no sale to record, because the
// money was already recorded when the membership was sold. The page never posts anything.
import { isIsoDate } from "./playbook";
import type { Booking, Membership } from "./types";

export const MAX_MEMBERSHIP_HOURS = 10_000;

export interface MembershipInput { customer: string; plan: string; hours: number; startDate: string; endDate: string; notes?: string }

export function validateMembershipInput(i: MembershipInput): string | null {
  const customer = (i.customer ?? "").trim();
  if (customer.length < 2 || customer.length > 120) return "Enter the member's name (2 to 120 characters).";
  const plan = (i.plan ?? "").trim();
  if (plan.length < 2 || plan.length > 80) return "Enter the plan name (2 to 80 characters).";
  if (!Number.isFinite(i.hours) || i.hours <= 0 || i.hours > MAX_MEMBERSHIP_HOURS) return "Enter the hours included, above zero.";
  if (Math.round(i.hours * 4) !== i.hours * 4) return "Enter hours in quarter-hour steps (for example 10 or 7.25).";
  if (!isIsoDate(i.startDate)) return "Enter the first day it can be used.";
  if (!isIsoDate(i.endDate)) return "Enter the last day it can be used.";
  if (i.endDate < i.startDate) return "The last day cannot be before the first day.";
  if ((i.notes ?? "").length > 300) return "Keep the notes under 300 characters.";
  return null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const hoursOf = (b: Pick<Booking, "durationMin">) => b.durationMin / 60;

export interface MembershipBalance {
  hours: number;
  used: number; // Done bookings covered by it
  reserved: number; // still-booked bookings covered by it
  left: number; // hours less used and reserved (never below zero)
  state: "upcoming" | "active" | "expired";
  expired: boolean;
  lapsed: number; // hours never used, once expired
}

export function membershipBalance(m: Membership, bookings: Pick<Booking, "membershipId" | "status" | "durationMin">[], today: string): MembershipBalance {
  let used = 0, reserved = 0;
  for (const b of bookings) {
    if (b.membershipId !== m.id) continue;
    if (b.status === "done") used += hoursOf(b);
    else if (b.status === "booked") reserved += hoursOf(b);
  }
  used = r2(used); reserved = r2(reserved);
  const left = Math.max(0, r2(m.hours - used - reserved));
  const state = today < m.startDate ? "upcoming" : today > m.endDate ? "expired" : "active";
  return { hours: m.hours, used, reserved, left, state, expired: state === "expired", lapsed: state === "expired" ? Math.max(0, r2(m.hours - used)) : 0 };
}

// Why this booking cannot be covered by this membership, or null when it can. `existing` is the booking as already saved when it is
// being edited, so its own hours are not counted twice.
export function membershipCoverProblem(
  m: Membership | undefined,
  b: Pick<Booking, "customerName" | "date" | "durationMin" | "status"> & { id?: string },
  bookings: Pick<Booking, "id" | "membershipId" | "status" | "durationMin">[]
): string | null {
  if (!m) return "That membership no longer exists.";
  if (b.status === "cancelled" || b.status === "no_show") return null; // a cancelled or missed booking uses no hours
  if (m.customer.trim().toLowerCase() !== b.customerName.trim().toLowerCase()) return `This membership belongs to ${m.customer}, not ${b.customerName}.`;
  if (b.date < m.startDate || b.date > m.endDate) return `This membership can be used from ${m.startDate} to ${m.endDate}. The booking is on ${b.date}.`;
  const others = bookings.filter((x) => x.id !== b.id);
  const bal = membershipBalance(m, others, m.startDate);
  const need = hoursOf(b);
  if (need > bal.left + 1e-9) return `Only ${bal.left} hour${bal.left === 1 ? "" : "s"} left on this membership. This booking needs ${r2(need)}.`;
  return null;
}

// Renewals (v175): active memberships that end within RENEWAL_WINDOW_DAYS and still have hours left. Hours not used by the end
// date are lost, so these are the ones to speak to before they expire. Read-only.
export const RENEWAL_WINDOW_DAYS = 14;
export function membershipsEndingSoon(
  list: Membership[],
  bookings: Pick<Booking, "membershipId" | "status" | "durationMin">[],
  today: string,
  days = RENEWAL_WINDOW_DAYS,
): { m: Membership; bal: MembershipBalance }[] {
  const last = addDaysIso(today, days);
  return list
    .map((m) => ({ m, bal: membershipBalance(m, bookings, today) }))
    .filter(({ m, bal }) => bal.state === "active" && m.endDate >= today && m.endDate <= last && bal.left > 0)
    .sort((a, b) => a.m.endDate.localeCompare(b.m.endDate) || a.m.customer.localeCompare(b.m.customer));
}

// The ISO date `n` days after `iso` (UTC arithmetic, as elsewhere in the pipeline code).
function addDaysIso(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

export function sortMemberships(list: Membership[], bookings: Pick<Booking, "membershipId" | "status" | "durationMin">[], today: string) {
  const rank = { active: 0, upcoming: 1, expired: 2 } as const;
  return list
    .map((m) => ({ m, bal: membershipBalance(m, bookings, today) }))
    .sort((a, b) => rank[a.bal.state] - rank[b.bal.state] || a.m.endDate.localeCompare(b.m.endDate) || a.m.customer.localeCompare(b.m.customer));
}

// Active memberships for one customer that still have hours: what the booking form offers.
export function membershipsFor(list: Membership[], customer: string, bookings: Pick<Booking, "membershipId" | "status" | "durationMin">[], today: string): Membership[] {
  const key = customer.trim().toLowerCase();
  if (!key) return [];
  return list.filter((m) => m.customer.trim().toLowerCase() === key && today <= m.endDate && membershipBalance(m, bookings, today).left > 0);
}

export function membershipDeleteProblem(m: Pick<Membership, "id">, bookings: Pick<Booking, "membershipId" | "status">[]): string | null {
  return bookings.some((b) => b.membershipId === m.id && b.status === "done")
    ? "Bookings already finished under this membership use its hours, so it can't be deleted. Let it expire instead."
    : null;
}
