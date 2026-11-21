// Quiet hours for text messages (lib/quietHours.ts), and where they are applied: the daily reminders job holds SMS back outside the
// window and does not log a held-back reminder, so the next run sends it. Run: npx tsx scripts/verify-quiet-hours.ts
import fs from "node:fs";
import { DEFAULT_SMS_FROM_HOUR, DEFAULT_SMS_UNTIL_HOUR, localHour, smsAllowedAt, validTimeZone, validateQuietHours } from "../lib/quietHours";
import { validateAutomations } from "../lib/leadIntake";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

// 03:00 UTC on 3 Nov 2026 is 08:30 in Colombo (UTC+5:30), and 22:00 the evening before in New York (UTC-5, after DST ended on 1 Nov).
const T = new Date("2026-11-03T03:00:00Z");
ok(validTimeZone("Asia/Colombo") && validTimeZone("Europe/London") && !validTimeZone("Mars/Base") && !validTimeZone(""), "time zones are recognised, and nonsense is refused");
ok(localHour("Asia/Colombo", T) === 8, "the wall clock hour in Colombo is 8 at that instant");
ok(localHour("America/New_York", T) === 22, "the wall clock hour in New York is 22 at that instant");
ok(localHour("UTC", T) === 3, "UTC hour is 3");
ok(localHour("Not/AZone", T) === null, "an unknown zone gives no hour");
ok(localHour("UTC", new Date("2026-11-03T00:30:00Z")) === 0, "midnight is hour 0, not 24");

ok(smsAllowedAt(undefined, T) && smsAllowedAt({}, T), "with no time zone, texts are never held back (the old behaviour)");
ok(smsAllowedAt({ smsTimeZone: "Asia/Colombo" }, T), "08:30 in Colombo is inside the default 08:00 to 20:00 window");
ok(!smsAllowedAt({ smsTimeZone: "UTC" }, T), "03:00 UTC is outside the default window and is held back");
ok(!smsAllowedAt({ smsTimeZone: "America/New_York" }, T), "22:00 in New York is outside the default window");
ok(smsAllowedAt({ smsTimeZone: "America/New_York", smsSendFromHour: 22, smsSendUntilHour: 6 }, T), "a window that runs past midnight includes 22:00");
ok(!smsAllowedAt({ smsTimeZone: "Asia/Colombo", smsSendFromHour: 9, smsSendUntilHour: 18 }, T), "08:30 is held back when the window starts at 09:00");
ok(smsAllowedAt({ smsTimeZone: "Asia/Colombo", smsSendFromHour: 8, smsSendUntilHour: 9 }, T), "the start hour itself is inside the window");
ok(!smsAllowedAt({ smsTimeZone: "Asia/Colombo", smsSendFromHour: 7, smsSendUntilHour: 8 }, T), "the end hour itself is outside the window");
ok(smsAllowedAt({ smsTimeZone: "Not/AZone" }, T), "an unreadable zone never drops a reminder at run time (validation refuses it when saved)");
ok(DEFAULT_SMS_FROM_HOUR === 8 && DEFAULT_SMS_UNTIL_HOUR === 20, "the default window is 08:00 to 20:00");

ok(validateQuietHours({}) === null && validateQuietHours({ smsTimeZone: "Asia/Colombo" }) === null, "a time zone alone (or none) is valid");
ok(validateQuietHours({ smsTimeZone: "Mars/Base" }) !== null, "an unknown zone is refused on save");
ok(validateQuietHours({ smsTimeZone: "Asia/Colombo", smsSendFromHour: 24 }) !== null, "an hour of 24 is refused");
ok(validateQuietHours({ smsTimeZone: "Asia/Colombo", smsSendFromHour: 8, smsSendUntilHour: 8 }) !== null, "a window with the same start and end is refused");
ok(validateAutomations({ smsTimeZone: "Mars/Base" }) !== null, "the automation settings refuse a bad zone");
ok(validateAutomations({ smsTimeZone: "Asia/Colombo", smsSendFromHour: 8, smsSendUntilHour: 20 }) === null, "the automation settings accept a good window");

// wiring
const cron = read("app/api/cron/reminders/route.ts");
ok(/smsWanted = !!\(ownSms \?\? serverSmsConfig\(\)\) && settings\.smsReminders === true && smsAllowedAt\(settings\.automations/.test(cron), "the reminders job holds SMS back outside the window");
ok(/if \(!to && !mobile\) continue;/.test(cron) && /const last = \(await logRef\.get\(\)\)/.test(cron), "a held-back reminder is not logged, so the next run tries again");
ok(read("lib/types.ts").includes("smsTimeZone?: string"), "the time zone is part of the automation settings");
ok(read("components/AutomationsCard.tsx").includes("smsTimeZone") && read("components/AutomationsCard.tsx").includes("smsSendFromHour"), "the Integrations page has the time zone and the window");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
