// The landing page describes what the app does now: bookings, sales from won leads, camera scanning, and channel economics.
// Run: /home/claude/.npm-global/bin/tsx scripts/verify-landing-copy.ts
import fs from "node:fs";

let fails = 0;
let checks = 0;
const page = fs.readFileSync("app/page.tsx", "utf8");
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
ok(page.includes('title: "Book the time"'), "the landing page describes bookings");
ok(page.includes("A finished booking becomes a sale in one tap"), "the landing page says a booking becomes a sale");
ok(page.includes("A won lead becomes a sale in one tap"), "the landing page says a won lead becomes a sale");
ok(page.includes("A follow-up date is set for you"), "the landing page describes the automatic follow-up date");
ok(page.includes("cash taken out for a delivery or an errand"), "the landing page describes till payouts");
ok(page.includes("with a scanner or the phone camera"), "the landing page mentions camera scanning");
ok(page.includes("what its customers are worth"), "the landing page mentions channel economics");
console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
