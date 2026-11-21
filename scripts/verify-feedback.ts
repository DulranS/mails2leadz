// Customer feedback / NPS (lib/feedback.ts) and the wiring of its collection: hand-worked cases.
// Run: npx tsx scripts/verify-feedback.ts
import fs from "node:fs";
import {
  cleanFeedbackInput, customersToAsk, npsGroup, npsVerdict, summarizeFeedback, validateFeedbackInput, FEEDBACK_CHANNELS,
  type FeedbackInput,
} from "../lib/feedback";
import { can } from "../lib/permissions";
import { isMutationName } from "../lib/readOnlyGuard";
import type { FeedbackEntry, Role } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const TODAY = "2026-10-24"; // 90 days back = 2026-07-26, 180 days back = 2026-04-27
let n = 0;
const mk = (o: Partial<FeedbackEntry>): FeedbackEntry => ({ id: `f${++n}`, customerName: "X", score: 8, receivedOn: "2026-10-01", followedUp: false, createdAt: 0, updatedAt: 0, ...o });

// ---- groups -------------------------------------------------------------------------------------------------------------
ok(npsGroup(10) === "promoter" && npsGroup(9) === "promoter", "9 and 10 are promoters");
ok(npsGroup(8) === "passive" && npsGroup(7) === "passive", "7 and 8 are passives");
ok(npsGroup(6) === "detractor" && npsGroup(0) === "detractor", "0 to 6 are detractors");

// ---- the worked set -----------------------------------------------------------------------------------------------------
// In the window: 3 promoters (10, 9, 10), 2 passives (8, 7), 3 detractors (6, 3, 0) => 8 answers, NPS = (3 - 3) / 8 = 0.
// Average = (10+9+10+8+7+6+3+0) / 8 = 53 / 8 = 6.6 (6.625 rounds to 6.6).
const P1 = mk({ customerName: "Kamal", score: 10, receivedOn: "2026-10-20" });
const P2 = mk({ customerName: "Nimali", score: 9, receivedOn: "2026-10-22" });
const P3 = mk({ customerName: "Amali", score: 10, receivedOn: "2026-09-01" });
const S1 = mk({ customerName: "Sunil", score: 8, receivedOn: "2026-10-01" });
const S2 = mk({ customerName: "Ravi", score: 7, receivedOn: "2026-08-15" });
const D1 = mk({ customerName: "Dilani", score: 6, receivedOn: "2026-10-10" });
const D2 = mk({ customerName: "Kasun", score: 3, receivedOn: "2026-09-05", followedUp: false });
const D3 = mk({ customerName: "Priya", score: 0, receivedOn: "2026-08-01", followedUp: true });
// Previous 90 days (2026-04-27 to 2026-07-25): 4 promoters, 1 detractor => NPS (4 - 1) / 5 = 60.
const Q = [
  mk({ score: 10, receivedOn: "2026-07-25" }), mk({ score: 9, receivedOn: "2026-06-01" }), mk({ score: 10, receivedOn: "2026-05-15" }),
  mk({ score: 9, receivedOn: "2026-05-01" }), mk({ customerName: "Old Critic", score: 2, receivedOn: "2026-04-27" }),
];
const now = [P1, P2, P3, S1, S2, D1, D2, D3];
const s = summarizeFeedback([...now, ...Q], TODAY);
ok(s.answers === 8 && s.promoters === 3 && s.passives === 2 && s.detractors === 3, "8 answers: 3 promoters, 2 passives, 3 detractors");
ok(s.nps === 0, "NPS = (3 - 3) / 8 = 0");
ok(s.average === 6.6, "average = 53 / 8 = 6.625 -> 6.6");
ok(s.previous.answers === 5 && s.previous.nps === 60, "the 90 days before: 5 answers, NPS (4 - 1) / 5 = 60");
ok(s.trend === -60, "trend = 0 - 60 = -60");
ok(s.tooFew === true, "8 answers is under the 10 needed to trust the score");
// Follow-up: detractors in the last 180 days not followed up: Dilani (10-10), Kasun (09-05), and Old Critic (04-27 is exactly the 180th day, counts).
// Priya was followed up. Oldest first.
ok(s.toFollowUp.map((e) => e.customerName).join(",") === "Old Critic,Kasun,Dilani", "follow-up list: Old Critic (day 180), Kasun, Dilani, oldest first; Priya was already followed up");
ok(s.referralCandidates.map((e) => e.customerName).join(",") === "Nimali,Kamal,Amali", "referral candidates are the promoters in the window, newest first");

// ---- window edges and bad data ------------------------------------------------------------------------------------------
const edge = summarizeFeedback([
  mk({ score: 10, receivedOn: "2026-07-26" }),                // day 90: in the window
  mk({ score: 0, receivedOn: "2026-07-25" }),                 // day 91: previous window
  mk({ score: 0, receivedOn: "2026-10-25" }),                 // tomorrow: ignored
  mk({ score: 11, receivedOn: "2026-10-01" }),                // not a score: ignored
  mk({ score: 7.5, receivedOn: "2026-10-01" }),               // not whole: ignored
  mk({ score: 5, receivedOn: "not a date" }),                 // not a date: ignored
], TODAY);
ok(edge.answers === 1 && edge.promoters === 1 && edge.nps === 100, "only the day-90 answer is in the window; future, out-of-range, fractional and undated rows are ignored");
ok(edge.previous.answers === 1 && edge.previous.nps === -100, "the day-91 answer belongs to the previous window");
ok(edge.toFollowUp.length === 1 && edge.toFollowUp[0].receivedOn === "2026-07-25", "an ignored future or invalid detractor never reaches the follow-up list");

const empty = summarizeFeedback([], TODAY);
ok(empty.answers === 0 && empty.nps === null && empty.average === null && empty.trend === null && empty.tooFew === true && empty.toFollowUp.length === 0, "no answers: nothing, and never a made-up zero");
ok(summarizeFeedback([P1], TODAY).trend === null, "no trend without answers in both windows");

// 10 answers is reliable.
const ten = summarizeFeedback(Array.from({ length: 10 }, () => mk({ score: 9, receivedOn: "2026-10-10" })), TODAY);
ok(ten.tooFew === false && ten.nps === 100, "10 answers is no longer flagged as too few");
const nine = summarizeFeedback(Array.from({ length: 9 }, () => mk({ score: 9, receivedOn: "2026-10-10" })), TODAY);
ok(nine.tooFew === true, "9 answers is still too few");

// Rounding: 2 promoters, 1 detractor of 3 => (2 - 1) / 3 = 33.33 -> 33.
ok(summarizeFeedback([mk({ score: 9 }), mk({ score: 10 }), mk({ score: 2 })], TODAY).nps === 33, "NPS rounds to a whole number (33.3 -> 33)");
ok(summarizeFeedback([mk({ score: 9 }), mk({ score: 2 }), mk({ score: 2 })], TODAY).nps === -33, "and below zero (-33.3 -> -33)");

// ---- verdict ------------------------------------------------------------------------------------------------------------
ok(/No answers yet/.test(npsVerdict(empty)), "verdict with no answers asks for a first reading");
ok(/first impression/.test(npsVerdict(s)) && !/recommending you|Healthy|Room to improve|More critics/.test(npsVerdict(s)), "a low-sample score is a first impression, never a verdict");
ok(/recommending you/.test(npsVerdict({ nps: 50, answers: 20, tooFew: false })) && /Healthy/.test(npsVerdict({ nps: 49, answers: 20, tooFew: false })) && /Healthy/.test(npsVerdict({ nps: 30, answers: 20, tooFew: false })), "50+ excellent, 30 to 49 healthy");
ok(/Room to improve/.test(npsVerdict({ nps: 29, answers: 20, tooFew: false })) && /Room to improve/.test(npsVerdict({ nps: 0, answers: 20, tooFew: false })) && /More critics/.test(npsVerdict({ nps: -1, answers: 20, tooFew: false })), "0 to 29 room to improve, below 0 more critics than fans");
ok(/1 answer so far/.test(npsVerdict({ nps: 100, answers: 1, tooFew: true })), "singular wording for one answer");

// ---- validation ---------------------------------------------------------------------------------------------------------
const good: FeedbackInput = { customerName: "Kamal Perera", score: 9, receivedOn: TODAY, followedUp: false };
ok(validateFeedbackInput(good) === null, "a minimal answer saves");
ok(validateFeedbackInput({ ...good, customerName: "  " }) !== null, "a name is required");
ok(validateFeedbackInput({ ...good, customerName: "x".repeat(101) }) !== null, "name limited to 100");
for (const bad of [-1, 11, 7.5, NaN, Infinity]) ok(validateFeedbackInput({ ...good, score: bad }) !== null, `score ${bad} refused`);
ok(validateFeedbackInput({ ...good, score: 0 }) === null && validateFeedbackInput({ ...good, score: 10 }) === null, "0 and 10 are valid");
ok(validateFeedbackInput({ ...good, score: "9" as unknown as number }) !== null, "a score typed as text is refused");
ok(validateFeedbackInput({ ...good, receivedOn: "2026-02-30" }) !== null && validateFeedbackInput({ ...good, receivedOn: "" }) !== null, "a real date is required");
ok(validateFeedbackInput({ ...good, comment: "y".repeat(1001) }) !== null && validateFeedbackInput({ ...good, comment: "y".repeat(1000) }) === null, "comment limited to 1000");
ok(validateFeedbackInput({ ...good, contact: "z".repeat(101) }) !== null, "contact limited to 100");
ok(validateFeedbackInput({ ...good, channel: "carrier_pigeon" as never }) !== null && FEEDBACK_CHANNELS.every((c) => validateFeedbackInput({ ...good, channel: c.value }) === null), "channel must be a listed one");
ok(validateFeedbackInput({ ...good, followedUp: undefined as unknown as boolean }) !== null, "followedUp must be a real true or false");

// ---- clean (no undefined or blank fields reach Firestore) --------------------------------------------------------------------
const c1 = cleanFeedbackInput({ ...good, customerName: "  Kamal   Perera ", contact: "   ", comment: "", channel: undefined });
ok(c1.customerName === "Kamal Perera", "name trimmed and inner spaces collapsed");
ok(!("contact" in c1) && !("comment" in c1) && !("channel" in c1), "blank optional fields are left out entirely");
ok(Object.values(c1).every((v) => v !== undefined), "no undefined values");
const c2 = cleanFeedbackInput({ ...good, comment: " great\r\nservice ", contact: " 0771234567 ", channel: "whatsapp", followedUp: true });
ok(c2.comment === "great\nservice" && c2.contact === "0771234567" && c2.channel === "whatsapp" && c2.followedUp === true, "optional fields trimmed and kept");

// ---- who to ask next ----------------------------------------------------------------------------------------------------
// Bought in the last 60 days (from 2026-08-25), not asked in the last 180 days.
const purchases = [
  { customerName: "Kamal", date: "2026-10-20" },      // asked on 10-20 (P1): excluded
  { customerName: "Meena", date: "2026-10-22" },
  { customerName: "  meena ", date: "2026-10-23" },   // same person, later purchase date wins
  { customerName: "Tharu", date: "2026-08-25" },      // exactly day 60: included
  { customerName: "Lahiru", date: "2026-08-24" },     // day 61: too old
  { customerName: "Future", date: "2026-10-30" },     // future: ignored
  { customerName: "", date: "2026-10-01" },           // no name: ignored
  { customerName: "Bad", date: "yesterday" },         // bad date: ignored
  { customerName: "Old Critic", date: "2026-10-02" }, // answered 2026-04-27, exactly day 180: counts as asked
  { customerName: "Rested", date: "2026-10-03" },     // answered long ago (see below): can be asked again
];
const asked = customersToAsk(purchases, [...now, ...Q, mk({ customerName: "Rested", score: 9, receivedOn: "2026-04-26" })], TODAY);
ok(asked.map((a) => a.name).join(",") === "meena,Rested,Tharu", `ask list is newest purchase first: meena, Rested, Tharu; got ${asked.map((a) => a.name).join(",")}`);
ok(asked.length === 3 && asked[0].lastPurchase === "2026-10-23", "most recent purchase first, and the later of Meena's two dates is used");
ok(!asked.some((a) => ["Kamal", "Lahiru", "Future", "Bad", "Old Critic", ""].includes(a.name)), "asked recently, too old, future, unnamed, bad date: none of them appear");
ok(customersToAsk(purchases, [], TODAY, 2).length === 2, "limit respected");
ok(customersToAsk([], [], TODAY).length === 0, "no purchases, nobody to ask");

// ---- wiring (the collection and who can use it) -------------------------------------------------------------------------
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const dc = read("contexts/DataContext.tsx");
ok(/feedbackEntries:\s*FeedbackEntry\[\]/.test(dc), "DataContext exposes feedbackEntries");
ok(/addFeedbackEntry[\s\S]{0,200}requirePermission\("manage:support"\)/.test(dc) && /updateFeedbackEntry[\s\S]{0,300}requirePermission\("manage:support"\)/.test(dc), "adding and editing need the support permission");
ok(/deleteFeedbackEntry[\s\S]{0,200}requirePermission\("delete:records"\)/.test(dc), "deleting needs delete:records");
ok(/collection\(db, "users", businessId, "feedback"\)/.test(dc), "a listener reads the feedback collection");
ok(/"feedback"/.test(dc.slice(dc.indexOf("requiredKeys"), dc.indexOf("requiredKeys") + 1200)), "feedback is in the loading gate");
const rules = read("firestore.rules");
ok(/match \/feedback\/\{docId\}\s*\{[^}]*allow read: if canReadBooks\(businessId\);[^}]*allow create, update: if isOwnerOrManager\(businessId\);[^}]*allow delete: if isOwner\(businessId\) && !isPublicDemo\(businessId\);/.test(rules), "rules: read by those who read the books, written by owner or manager, deleted by the owner (never in the public demo)");
ok(/"feedback"/.test(read("scripts/restore-from-backup.mjs")), "restore script allows the collection");
ok(/feedback:\s*data\.feedbackEntries/.test(read("lib/backupPayload.ts")), "backup payload carries it");
ok(/feedback\.csv/.test(read("lib/backup.ts")), "backup writes feedback.csv");
ok(/addFeedbackEntry/.test(read("scripts/verify-period-lock.ts")), "period-lock test lists it as deliberately unlocked");
const page = read("app/feedback/page.tsx");
ok(/useRequireRole\(\["owner", "manager", "accountant"\]\)/.test(page) && /can\(role, "manage:support"\)/.test(page), "page: owner, manager and accountant may open it; only those with manage:support see the write buttons");
ok(/canWrite && toAsk\.length > 0/.test(page) && /canWrite && summary\.referralCandidates/.test(page), "page: the ask and introduction lists (with Message links) are for writers only");
ok(/href: "\/feedback"[^}]*roles: \["owner", "manager", "accountant"\]/.test(read("components/AppShell.tsx")), "nav: Feedback is listed for owner, manager and accountant, not staff");
ok(/- Feedback \(/.test(read("lib/aiPrompts.ts")), "the AI assistant knows the page");
const roles: Role[] = ["owner", "manager"];
ok(roles.every((r) => can(r, "manage:support")), "owner and manager can log feedback");
ok(!can("staff", "manage:support") && !can("accountant", "manage:support"), "staff and accountant cannot");
ok(isMutationName("addFeedbackEntry") && isMutationName("updateFeedbackEntry") && isMutationName("deleteFeedbackEntry"), "the accountant's read-only guard catches all three by name");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
