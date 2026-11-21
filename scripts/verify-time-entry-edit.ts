// Empirical check for the Time page's "Correct an entry" date handling (lib/timeEntryEdit.ts).
//
// Run: TZ=Asia/Colombo npx tsx scripts/verify-time-entry-edit.ts
// (Meaningful in any zone, but UTC+ zones such as Colombo are the ones the old code got wrong. When TZ is not
// set the script re-runs itself under Asia/Colombo so the check is never vacuous.)
import { spawnSync } from "node:child_process";
if (!process.env.TZ) {
  const r = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, TZ: "Asia/Colombo" } });
  process.exit(r.status ?? 1);
}
import { entryFields, entryTimes } from "../lib/timeEntryEdit";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

// 1. A 02:00 local shift keeps its own calendar day through open -> save (the old code moved it back a day).
const early = new Date("2026-10-07T02:00:00").getTime();
const f = entryFields(early);
check("early-morning date is the local day", f.date === "2026-10-07", f.date);
check("early-morning time", f.time === "02:00", f.time);

// 2. Open -> save with nothing changed returns the same instants, for many times of day, in both directions.
let roundTrips = 0;
for (let h = 0; h < 24; h++) {
  for (const m of [0, 15, 30, 45, 59]) {
    const inTs = new Date(2026, 9, 7, h, m).getTime();
    const outTs = inTs + 3 * 3600000; // 3 h later, which may cross midnight
    const a = entryFields(inTs), b = entryFields(outTs);
    const t = entryTimes(a.date, a.time, b.time);
    check(`round trip ${h}:${m}`, !!t && t.clockIn === inTs && t.clockOut === outTs, JSON.stringify({ a, b, t }));
    roundTrips++;
  }
}

// 3. An overnight shift can be re-saved, ends the next day, and says so.
const n = entryTimes("2026-10-07", "22:00", "06:00");
check("overnight accepted", !!n);
check("overnight flagged", n?.endsNextDay === true);
check("overnight is 8 hours", !!n && (n.clockOut - n.clockIn) === 8 * 3600000);

// 4. A same-day shift is not flagged; equal start/end is treated as a full 24 h only via the flagged path.
const d = entryTimes("2026-10-07", "09:00", "17:30");
check("same-day not flagged", d?.endsNextDay === false);
check("same-day 8.5 hours", !!d && (d.clockOut - d.clockIn) === 8.5 * 3600000);

// 5. Missing / invalid input is refused rather than saved as NaN.
check("empty date refused", entryTimes("", "09:00", "10:00") === null);
check("empty start refused", entryTimes("2026-10-07", "", "10:00") === null);
check("empty end refused", entryTimes("2026-10-07", "09:00", "") === null);

// 6. Month and year boundaries.
const nye = entryTimes("2026-12-31", "23:00", "01:00");
check("new year's eve overnight", !!nye && new Date(nye.clockOut).getFullYear() === 2027 && (nye.clockOut - nye.clockIn) === 2 * 3600000);

console.log(`verify-time-entry-edit: ${pass} passed, ${fail} failed (${roundTrips} round trips, TZ=${process.env.TZ})`);
process.exit(fail ? 1 : 0);
