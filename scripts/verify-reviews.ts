// The review API (lib/reviewIntake.ts and the review route), the shared lead API key check (lib/leadApiAuth.ts), the low-review alert
// switch, and the compliance kinds added for intellectual property, data protection and environmental records.
// Run: npx tsx scripts/verify-reviews.ts
import fs from "node:fs";
import { cleanReview, isLowReview, reviewFeedbackDoc, starsToScore, MAX_REVIEW_COMMENT } from "../lib/reviewIntake";
import { DEFAULT_AUTOMATIONS, resolveAutomations } from "../lib/leadIntake";
import { COMPLIANCE_CATEGORIES } from "../lib/operations";
import { FEEDBACK_CHANNELS } from "../lib/feedback";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-11-03";

ok([1, 2, 3, 4, 5].map(starsToScore).join() === "2,4,6,8,10", "stars map onto the 0 to 10 scale: 1 to 2, 5 to 10");
ok(isLowReview(4) && isLowReview(2) && !isLowReview(6), "one or two stars (scores up to 4) are low reviews; three stars and up are not");

const good = cleanReview({ customerName: "  Amal  Perera ", stars: 3, comment: "Fine   overall", source: "Google" }, TODAY);
ok(good.ok && good.value.score === 6 && good.value.stars === 3 && good.value.customerName === "Amal Perera", "a three-star review is cleaned and scored 6");
ok(good.ok && good.value.comment === "Fine overall" && good.value.source === "Google" && good.value.receivedOn === TODAY, "comments are tidied; the source and the day are kept, the day defaults to today");
const scored = cleanReview({ score: 9 }, TODAY);
ok(scored.ok && scored.value.score === 9 && scored.value.stars === undefined && scored.value.customerName === "Online reviewer" && scored.value.source === "Online review", "a score can be sent instead of stars; defaults fill in the name and source");
ok(!cleanReview({ customerName: "x" }, TODAY).ok, "a review with neither stars nor a score is refused");
ok(!cleanReview({ stars: 6 }, TODAY).ok && !cleanReview({ stars: 2.5 }, TODAY).ok, "stars must be whole numbers from 1 to 5");
ok(!cleanReview({ score: 11 }, TODAY).ok && !cleanReview({ score: "x" }, TODAY).ok, "a score must be a whole number from 0 to 10");
ok(!cleanReview({ stars: 4, receivedOn: "2026-02-30" }, TODAY).ok, "an impossible date is refused");
ok(cleanReview({ stars: 4, comment: "x".repeat(2000) }, TODAY).ok && (cleanReview({ stars: 4, comment: "x".repeat(2000) }, TODAY) as { value: { comment: string } }).value.comment.length === MAX_REVIEW_COMMENT, "a long comment is kept up to the cap");

const doc = reviewFeedbackDoc(good.ok ? good.value : (null as never), 42) as Record<string, unknown>;
ok(doc.channel === "online_review" && doc.followedUp === false && doc.reviewStars === 3 && doc.reviewSource === "Google", "the review is filed as feedback from an online review, not yet followed up");
ok(doc.createdByName === "Review API (Google)" && doc.createdAt === 42, "the record says it came through the review API");
ok(!("reviewStars" in (reviewFeedbackDoc(scored.ok ? scored.value : (null as never), 1) as object)), "a score-only review carries no stars field");
ok(FEEDBACK_CHANNELS.some((c) => c.value === "online_review"), "online review is a feedback channel in the list the app shows");

ok(DEFAULT_AUTOMATIONS.alertLowReviews === true && resolveAutomations(undefined).alertLowReviews === true, "the low-review alert is on by default (it only alerts)");
ok(resolveAutomations({ alertLowReviews: false }).alertLowReviews === false, "the low-review alert can be switched off");
for (const k of ["intellectual_property", "data_protection", "environmental"]) ok(COMPLIANCE_CATEGORIES.some((c) => c.value === k), `the compliance register holds ${k} items`);

const route = read("app/api/v1/businesses/[businessId]/reviews/route.ts");
ok(route.includes("authoriseLeadApi(req, businessId)") && route.includes('type: "review_received"') && route.includes('entityType: "feedback"'), "the review route checks the key, files the review and alerts the owner against the feedback record");
ok(route.includes("externalId") && route.includes('status: "duplicate"'), "a review sent twice (same externalId) is not filed twice");
const shared = read("lib/leadApiAuth.ts");
ok(shared.includes("timingSafeEqual(") && shared.includes("saved?.enabled") && shared.includes("isRateLimited(\"lead-api\""), "the shared key check compares in constant time, needs the switch on, and rate limits");
ok(!read("app/api/v1/businesses/[businessId]/leads/route.ts").includes("timingSafeEqual("), "the lead route uses the shared key check, not its own copy");
ok(read("app/notifications/page.tsx").includes("review_received"), "the notifications page labels the review alert");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
