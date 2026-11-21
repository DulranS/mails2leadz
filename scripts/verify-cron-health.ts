// Offline proof that the stale-scheduler warning fires when it should and stays silent otherwise.
import { readFileSync } from "fs";
import { cronWarningFor } from "../lib/cronHealth";

let failed = 0;
function check(ok: boolean, msg: string) {
  console.log(`${ok ? "OK:  " : "FAIL:"} ${msg}`);
  if (!ok) failed++;
}
const H = 3_600_000;
const now = 1_000_000_000_000;

check(cronWarningFor({ secretSet: true, lastRunAt: now - 5 * H, now }) === null, "a job that ran 5 hours ago gives no warning");
check(cronWarningFor({ secretSet: true, lastRunAt: now - 36 * H, now }) === null, "exactly 36 hours is still fine (matches the admin panel)");
check((cronWarningFor({ secretSet: true, lastRunAt: now - 50 * H, now }) ?? "").includes("50 hours"), "a job 50 hours silent warns and says how long");
check(cronWarningFor({ secretSet: false, lastRunAt: now - 90 * H, now }) === null, "scheduler deliberately off: no warning");
check(cronWarningFor({ secretSet: true, lastRunAt: null, now }) === null, "never ran yet (fresh deploy): no warning");

const src = readFileSync("lib/cronHealth.ts", "utf8");
check(/catch\s*\{\s*return null;/.test(src), "reading the heartbeat can never throw into the lead flow");
const commit = readFileSync("lib/trialCommitServer.ts", "utf8");
check(commit.indexOf("cronWarningText()") > commit.indexOf("try {\n    await notifyAdminOfTrialRequest"), "the check sits inside the notification try/catch");

if (failed) process.exit(1);
console.log("\nAll cron-health checks passed.");
