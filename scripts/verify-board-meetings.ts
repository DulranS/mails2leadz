// Board and advisors (lib/boardMeetings.ts): meeting checks, the open-action list, and the board pack text.
import { boardPackText, openActions, parseAttendees, validateMeeting } from "../lib/boardMeetings";
import type { BoardMeeting } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

ok(validateMeeting({ date: "2026-11-30", agenda: "", decisions: "" }).length === 1, "a meeting with no agenda and no decisions is refused: it would not be on record");
ok(validateMeeting({ date: "30-11-2026", agenda: "Budget", decisions: "" }).some((m) => m.includes("date")), "a meeting needs a proper date");
ok(validateMeeting({ date: "2026-11-30", agenda: "Budget", decisions: "" }).length === 0, "an agenda alone is enough to save a meeting");

ok(parseAttendees(" Nimal ,  , Ann,Ben ").join("|") === "Nimal|Ann|Ben", "attendees are split on commas, trimmed, and blanks dropped");
ok(parseAttendees(Array.from({ length: 50 }, (_, i) => `P${i}`).join(",")).length === 30, "attendees are capped at 30");

const meetings: BoardMeeting[] = [
  {
    id: "m1", date: "2026-10-15", attendees: ["Ann"], agenda: "Q3", decisions: "Hire one more agent", keyRisks: "Cash in Q1", actions: [
      { id: "a1", text: "Draft the hiring plan", owner: "Ann", due: "2026-11-01", done: false },
      { id: "a2", text: "Close the Q3 books", owner: "", due: "", done: true },
    ],
  },
  {
    id: "m2", date: "2026-11-10", attendees: [], agenda: "", decisions: "Renew the supplier contract", keyRisks: "", actions: [
      { id: "a3", text: "Sign the renewal", owner: "Ben", due: "2026-12-05", done: false },
      { id: "a4", text: "Review pricing", owner: "", due: "", done: false },
    ],
  },
];
const open = openActions(meetings, "2026-11-16");
ok(open.length === 3 && !open.some((o) => o.action.done), "finished actions are left off the open list");
ok(open[0].action.id === "a1" && open[0].overdue === true, "the soonest dated action comes first, and an action past its date is marked overdue");
ok(open[1].action.id === "a3" && open[1].overdue === false, "a dated action not yet due is not marked overdue");
ok(open[2].action.id === "a4" && open[2].action.due === "", "undated actions come last");

const money = (n: number) => `$${n.toFixed(2)}`;
const pack = boardPackText({
  businessName: "  Acme  Ltd ", asOf: "2026-11-16", month: "2026-10", revenue: 12000, netProfitAfterTax: 1500, cash: 40000,
  avgMonthlyNetCashFlow: -2000, runwayMonths: 20, latest: meetings[1], open, money,
});
ok(pack.startsWith("Board pack: Acme Ltd"), "the pack is titled with the business name, cleaned of extra spaces");
ok(pack.includes("  Revenue: $12000.00") && pack.includes("about 20 months"), "the pack carries the month's figures and the runway");
ok(pack.includes("Decided: Renew the supplier contract") && !pack.includes("Attended:"), "the latest meeting is shown, with an empty attendee list left out");
ok(pack.includes("Draft the hiring plan (owner: Ann, due 2026-11-01, OVERDUE)") && pack.includes("(owner: unassigned)"), "open actions show owner, due date, overdue, and an unassigned owner");
ok(pack.includes("Open actions (3)"), "the pack counts the open actions");

const bare = boardPackText({ businessName: "", asOf: "2026-11-16", month: "2026-10", revenue: 0, netProfitAfterTax: 0, cash: 0, avgMonthlyNetCashFlow: 0, runwayMonths: null, latest: null, open: [], money });
ok(bare.includes("No board meeting recorded yet.") && bare.includes("not running out at the recent pace") && bare.includes("  None."), "with nothing recorded, the pack says so plainly and does not invent a runway");
ok(bare.startsWith("Board pack: Your business"), "a pack with no business name still has a title");

console.log(`verify-board-meetings: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
