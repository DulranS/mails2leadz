// Memberships (lib/memberships.ts): included hours, who a booking can be covered for, and the wiring that keeps a covered booking out of the sales.
// Run: npx tsx scripts/verify-memberships.ts
import fs from "node:fs";
import { membershipBalance, membershipCoverProblem, membershipDeleteProblem, membershipsFor, sortMemberships, validateMembershipInput } from "../lib/memberships";
import { bookingSaleProblem, cleanBookingInput } from "../lib/bookings";
import { generateSaleReminders } from "../lib/salesReminders";
import type { Booking, Membership } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const today = "2026-11-10";
const mem = (o: Partial<Membership> = {}): Membership => ({ id: "m1", customer: "Kasun Perera", plan: "Monthly 10 hours", hours: 10, startDate: "2026-11-01", endDate: "2026-11-30", createdAt: 1, updatedAt: 1, ...o });
const bk = (o: Partial<Booking> = {}): Booking => ({ id: "b" + Math.random().toString(36).slice(2, 6), customerName: "Kasun Perera", service: "Table", date: "2026-11-05", startTime: "10:00", durationMin: 120, status: "done", membershipId: "m1", createdAt: 1, updatedAt: 1, ...o });

// ---- validation ----
const v = { customer: "Kasun", plan: "Gold", hours: 10, startDate: "2026-11-01", endDate: "2026-11-30" };
ok(validateMembershipInput(v) === null, "a normal membership is accepted");
ok(validateMembershipInput({ ...v, hours: 0 }) !== null && validateMembershipInput({ ...v, hours: -2 }) !== null && validateMembershipInput({ ...v, hours: NaN }) !== null, "hours must be above zero");
ok(validateMembershipInput({ ...v, hours: 7.25 }) === null && validateMembershipInput({ ...v, hours: 7.3 }) !== null, "quarter-hour steps only");
ok(validateMembershipInput({ ...v, endDate: "2026-10-31" }) !== null && validateMembershipInput({ ...v, startDate: "2026-13-01" }) !== null, "dates must be real and in order");
ok(validateMembershipInput({ ...v, customer: "K" }) !== null && validateMembershipInput({ ...v, plan: "" }) !== null, "member and plan are required");

// ---- balance ----
const books = [bk({ durationMin: 120 }), bk({ durationMin: 90, status: "booked", date: "2026-11-20" }), bk({ durationMin: 600, status: "cancelled" }), bk({ durationMin: 300, status: "no_show" }), bk({ membershipId: undefined, durationMin: 600 }), bk({ membershipId: "other", durationMin: 600 })];
const b = membershipBalance(mem(), books, today);
ok(b.used === 2 && b.reserved === 1.5 && b.left === 6.5, "used (Done), reserved (booked) and left; cancelled, no-show and other bookings use nothing");
ok(b.state === "active" && b.lapsed === 0, "active inside its dates");
ok(membershipBalance(mem(), [], "2026-10-31").state === "upcoming" && membershipBalance(mem(), [], "2026-12-01").state === "expired", "upcoming and expired by date");
ok(membershipBalance(mem(), [bk({ durationMin: 360 })], "2026-12-01").lapsed === 4, "unused hours lapse after the last day");
ok(membershipBalance(mem({ hours: 1 }), [bk({ durationMin: 600 })], today).left === 0, "left never goes below zero");
ok(membershipBalance(mem(), [bk({ durationMin: 20 }), bk({ durationMin: 20 }), bk({ durationMin: 20 })], today).used === 1, "minutes add up to hours without drift");

// ---- covering a booking ----
const nb = { customerName: "kasun perera ", date: "2026-11-12", durationMin: 120, status: "booked" as const };
ok(membershipCoverProblem(mem(), nb, books) === null, "a booking inside the dates with hours left can be covered (name match ignores case and spaces)");
ok(membershipCoverProblem(mem(), { ...nb, customerName: "Nimal" }, books) !== null, "another customer's booking cannot use it");
ok(membershipCoverProblem(mem(), { ...nb, date: "2026-12-02" }, books) !== null && membershipCoverProblem(mem(), { ...nb, date: "2026-10-30" }, books) !== null, "outside the dates is refused");
ok(membershipCoverProblem(mem(), { ...nb, durationMin: 480 }, books) !== null, "more hours than are left is refused");
ok(membershipCoverProblem(mem(), { ...nb, durationMin: 390 }, books) === null, "exactly the hours left is fine");
ok(membershipCoverProblem(undefined, nb, books) !== null, "a deleted membership is refused");
const mine = books[0];
ok(membershipCoverProblem(mem({ hours: 2 }), { ...nb, id: mine.id, date: mine.date, durationMin: 120, status: "done" }, books.slice(0, 1)) === null, "editing a covered booking does not count its own hours twice");
ok(membershipCoverProblem(mem({ hours: 1 }), { ...nb, status: "cancelled" }, books) === null, "a cancelled booking uses no hours, so it is never refused");

// ---- offered on the form ----
const list = [mem(), mem({ id: "m2", endDate: "2026-11-05" }), mem({ id: "m3", customer: "Nimal" }), mem({ id: "m4", hours: 2 })];
ok(membershipsFor(list, "Kasun Perera", [bk({ membershipId: "m4", durationMin: 120 })], today).map((m) => m.id).join() === "m1,m3".replace(",m3", ""), "offers only this customer's unexpired memberships with hours left");
ok(membershipsFor(list, "", [], today).length === 0, "no name, no offer");
ok(sortMemberships([mem({ id: "x", endDate: "2026-10-01", startDate: "2026-09-01" }), mem({ id: "y" }), mem({ id: "z", startDate: "2026-12-01", endDate: "2026-12-31" })], [], today).map((r) => r.m.id).join() === "y,z,x", "active first, then upcoming, then expired");
ok(membershipDeleteProblem({ id: "m1" }, [bk()]) !== null && membershipDeleteProblem({ id: "m1" }, [bk({ status: "booked" })]) === null, "a membership with finished bookings stays; with only future ones it can go");

// ---- covered bookings stay out of the sales ----
ok(bookingSaleProblem({ status: "done", date: "2026-11-05", membershipId: "m1" }, today) !== null, "a covered booking has no sale to record");
ok(bookingSaleProblem({ status: "done", date: "2026-11-05" }, today) === null, "an uncovered Done booking still can");
ok(cleanBookingInput({ customerName: "K", service: "T", date: "2026-11-05", startTime: "10:00", durationMin: 60, status: "booked", membershipId: "m1" }).membershipId === "m1", "the link survives cleaning");
const rem = generateSaleReminders([bk(), bk({ membershipId: undefined })], [], today);
ok(rem.length === 1, "only the uncovered Done booking raises a 'record the sale' reminder");

// ---- wiring ----
const ctx = read("contexts/DataContext.tsx");
ok(/if \(b\.membershipId\) throw new Error\("A membership covers this booking/.test(ctx), "the sale transaction refuses a covered booking");
ok((ctx.match(/b\.membershipId && role !== "staff"/g) ?? []).length === 2, "adding and editing a booking check the cover (staff cannot read memberships, so they keep the link as is)");
ok((ctx.match(/"cheques", "mileage", "memberships"/g) ?? []).length === 2 && !/role === "staff"\) return \[[^\]]*memberships/.test(ctx), "owner, manager and accountant subscribe; staff do not");
ok(/match \/memberships\/\{docId\}/.test(read("firestore.rules")) && /"memberships"/.test(read("scripts/restore-from-backup.mjs")) && /memberships: data\.memberships/.test(read("lib/backupPayload.ts")), "rules, restore and backup");
ok(/!b\.membershipId/.test(read("app/bookings/page.tsx")), "the sale list on Bookings leaves covered bookings out");
ok(!/collection\(db, "users", bizId, "sales"\)/.test(ctx.slice(ctx.indexOf("addMembership: async"), ctx.indexOf("deleteMembership: async"))), "adding a membership posts no sale");
console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
