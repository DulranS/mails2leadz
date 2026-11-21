// Online seat requests (lib/publicTickets.ts, app/api/tickets, app/tickets): what the public sees and what a request must contain.
// Run: npx tsx scripts/verify-public-tickets.ts
import fs from "node:fs";
import { publicEvents, validateTicketRequest, MAX_SEATS_PER_REQUEST, type PublicEvent } from "../lib/publicTickets";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const today = "2026-11-02";
const ev = (o: any) => ({ id: "e", name: "Game night", date: "2026-11-20", startTime: "19:00", capacity: 20, ticketPrice: 1500, ticketProductId: "p", status: "scheduled", onlineRequests: true, otherCosts: 5000, notes: "secret prizes", createdAt: 1, updatedAt: 1, ...o });
const list = publicEvents(
  [
    ev({ id: "a" }), ev({ id: "b", onlineRequests: false }), ev({ id: "c", status: "cancelled" }), ev({ id: "d", date: "2026-10-30" }),
    ev({ id: "f", date: "2027-06-01" }), ev({ id: "g", date: "2026-11-05", startTime: "10:00" }), ev({ id: "h", date: "2026-11-02" }),
  ] as any,
  [{ eventId: "a", qty: 5 }, { eventId: "a", qty: 3 }, { eventId: "g", qty: 99 }, { eventId: "zzz", qty: 4 }],
  today
);
ok(list.map((e) => e.id).join() === "h,g,a", "only open, scheduled, upcoming events within 180 days, soonest first");
ok(list.find((e) => e.id === "a")!.remaining === 12, "seats left = capacity less seats sold on its sales");
ok(list.find((e) => e.id === "g")!.remaining === 0, "oversold reads as zero, never negative");
ok(Object.keys(list[0]).sort().join() === "date,id,name,remaining,startTime,ticketPrice", "the public view carries no costs, notes or names");

const visible: PublicEvent[] = list;
const req = (o: any = {}) => ({ eventId: "a", seats: 2, name: "Kasun Perera", contact: "0771234567", ...o });
ok(validateTicketRequest(req(), visible).ok === true, "a normal request is accepted");
ok(!validateTicketRequest(req({ eventId: "b" }), visible).ok, "an event not opened to requests is refused");
ok(!validateTicketRequest(req({ name: "K" }), visible).ok, "a name is required");
ok(!validateTicketRequest(req({ contact: "hello" }), visible).ok && !validateTicketRequest(req({ contact: "12345" }), visible).ok, "a real phone number or email is required");
ok(validateTicketRequest(req({ contact: "kasun@x.lk" }), visible).ok === true, "an email works as contact");
ok(!validateTicketRequest(req({ seats: 0 }), visible).ok && !validateTicketRequest(req({ seats: 1.5 }), visible).ok && !validateTicketRequest(req({ seats: NaN }), visible).ok, "seats must be a whole number of at least one");
ok(!validateTicketRequest(req({ seats: MAX_SEATS_PER_REQUEST + 1 }), [{ ...visible[2], remaining: 50 }]).ok, "no more than the per-request maximum");
ok(!validateTicketRequest(req({ seats: 13 }), visible).ok, "more than the seats left is refused");
ok(!validateTicketRequest(req({ eventId: "g" }), visible).ok, "a sold-out event is refused");
ok(!validateTicketRequest(req({ notes: "x".repeat(501) }), visible).ok, "a long note is refused");

const route = read("app/api/tickets/route.ts");
ok(/body\?\.website/.test(route) && /isRateLimited\("tickets-ip"/.test(route) && /isRateLimited\("tickets-business"/.test(route), "honeypot plus per-address and per-business limits");
ok(/type: "ticket_requested"/.test(route) && !/collection\("sales"\)\.add|collection\("sales"\)\.doc/.test(route), "a request is a notification and never writes a sale");
ok(/resolveAccess\(.*\)\.locked/.test(route), "a locked account takes no requests");
ok(/pathname\.startsWith\("\/tickets\/"\)/.test(read("components/AppShell.tsx")), "the ticket page opens without signing in");
ok(/ticket_requested/.test(read("app/notifications/page.tsx")), "the owner sees the request on Notifications");
ok(/onlineRequests/.test(read("app/events/page.tsx")), "the owner chooses which events are open");
console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
