// Rentals (lib/rentals.ts): day counting, rent and late days, input and return checks, the deposit balance, overdue, the
// summary window and open-list order, plus the wiring that must know about rentals (rules, data layer, period guards, menu,
// backup, notifications, assistant knowledge).
// Run: npx tsx scripts/verify-rentals.ts
import fs from "node:fs";
import {
  cleanRentalInput,
  depositHeld,
  isRentalOverdue,
  lateDays,
  rentalCharge,
  rentalDays,
  sortOpenRentals,
  summarizeRentals,
  validateRentalInput,
  validateReturnInput,
  type RentalInput,
} from "../lib/rentals";
import type { Rental } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}
const read = (p: string) => fs.readFileSync(p, "utf8");
const TODAY = "2026-10-30";
const rental = (over: Partial<Rental>): Rental => ({
  id: "r",
  item: "Generator",
  customer: "Kamal",
  outDate: "2026-10-01",
  dueBackDate: "2026-10-03",
  dailyRate: 250,
  incomeProductId: "svc1",
  createdAt: 0,
  updatedAt: 0,
  ...over,
});
const good: RentalInput = {
  item: "Generator 5 kVA",
  customer: "Kamal",
  outDate: "2026-10-01",
  dueBackDate: "2026-10-03",
  dailyRate: 250,
  incomeProductId: "svc1",
};

// 1. Day counting: both the day out and the day back are counted; never less than one
ok(rentalDays("2026-10-01", "2026-10-01") === 1, "same-day return is one day");
ok(rentalDays("2026-10-01", "2026-10-03") === 3, "out 1 Oct, back 3 Oct is three days");
ok(rentalDays("2026-10-01", "2026-09-30") === 1, "a return dated before the out day still counts as one day, never negative");
ok(rentalDays("2026-10-28", "2026-11-02") === 6, "a month boundary: 28 Oct to 2 Nov is 6 days counting both");

// 2. Rent: days times the daily rate
ok(rentalCharge(rental({}), "2026-10-05") === 1250, "out 1 Oct, back 5 Oct at 250 a day is 1250");
ok(rentalCharge(rental({ dailyRate: 99.99 }), "2026-10-02") === 199.98, "rent is rounded to the cent (2 days at 99.99)");

// 3. Late days: only days past the planned due-back day are late
const planned = rental({}); // planned 1 Oct to 3 Oct = 3 days
ok(lateDays(planned, "2026-10-03") === 0, "back on the due-back day is not late");
ok(lateDays(planned, "2026-10-02") === 0, "back early is not late and gets no credit");
ok(lateDays(planned, "2026-10-05") === 2, "back on 5 Oct is two days late");

// 4. Input checks
ok(validateRentalInput(good) === null, "a complete rental is fine");
ok(validateRentalInput({ ...good, item: "   " }) !== null, "a rental needs an item");
ok(validateRentalInput({ ...good, customer: "" }) !== null, "a rental needs who is renting it");
ok(validateRentalInput({ ...good, dueBackDate: "2026-09-30" }) !== null, "due back cannot be before it goes out");
ok(validateRentalInput({ ...good, dueBackDate: "2026-10-01" }) === null, "due back on the out day is fine (one day)");
ok(validateRentalInput({ ...good, dailyRate: 0 }) !== null, "a rate of zero is refused");
ok(validateRentalInput({ ...good, dailyRate: NaN }) !== null, "a rate that is not a number is refused");
ok(validateRentalInput({ ...good, deposit: -5 }) !== null, "a negative deposit is refused");
ok(validateRentalInput({ ...good, incomeProductId: "" }) !== null, "the service the rent goes under is required");
ok(validateRentalInput({ ...good, outDate: "10/01/2026" }) !== null, "a non-ISO out date is refused");
ok(validateRentalInput({ ...good, notes: "x".repeat(501) }) !== null, "notes over 500 characters are refused");

// 5. Cleaning: nothing is stored blank
{
  const c = cleanRentalInput({ ...good, item: "  Van 2  ", customerContact: "   ", deposit: 0, notes: "" });
  ok(c.item === "Van 2", "the item is trimmed");
  ok(!("customerContact" in c) && !("deposit" in c) && !("notes" in c), "blank contact, zero deposit and blank notes are left out");
  const d = cleanRentalInput({ ...good, deposit: 1000, customerContact: "0771234567" });
  ok(d.deposit === 1000 && d.customerContact === "0771234567", "a deposit and a contact are kept");
}

// 6. Return checks
const withDeposit = rental({ deposit: 1000 });
ok(validateReturnInput(withDeposit, { returnedDate: "2026-10-05" }, TODAY) === null, "a normal return is fine");
ok(validateReturnInput(withDeposit, { returnedDate: "2026-09-30" }, TODAY) !== null, "a return before the out day is refused");
ok(validateReturnInput(withDeposit, { returnedDate: "2026-10-31" }, TODAY) !== null, "a return dated in the future is refused");
ok(validateReturnInput(withDeposit, { returnedDate: "2026-10-30" }, TODAY) === null, "a return today is fine");
ok(validateReturnInput(withDeposit, { returnedDate: "2026-10-05", damageCharge: -5 }, TODAY) !== null, "a negative damage charge is refused");
ok(validateReturnInput(withDeposit, { returnedDate: "2026-10-05", depositRefund: 1001 }, TODAY) !== null, "refunding more than the deposit held is refused");
ok(validateReturnInput(withDeposit, { returnedDate: "2026-10-05", depositRefund: 1000 }, TODAY) === null, "refunding the full deposit is fine");
ok(validateReturnInput(rental({ deposit: 1000, depositRefunded: 800 }), { returnedDate: "2026-10-05", depositRefund: 300 }, TODAY) !== null, "a refund cannot exceed what is still held");

// 7. Deposit held: taken, less refunded
ok(depositHeld({ deposit: 1000, depositRefunded: 300 }) === 700, "1000 taken, 300 refunded: 700 held");
ok(depositHeld({ deposit: 1000 }) === 1000, "no refund yet: all 1000 held");
ok(depositHeld({}) === 0, "no deposit: nothing held");

// 8. Overdue: due today is not yet overdue; still out and past the day is
ok(isRentalOverdue(rental({ dueBackDate: "2026-10-28" }), TODAY), "out and past its due-back day is overdue");
ok(!isRentalOverdue(rental({ dueBackDate: "2026-10-30" }), TODAY), "due back today is not overdue yet");
ok(!isRentalOverdue(rental({ dueBackDate: "2026-10-01", returnedDate: "2026-10-02" }), TODAY), "a returned rental is never overdue");

// 9. Summary over a set of rentals, as of 30 Oct 2026 (window 1 Oct to 30 Oct)
{
  const list: Rental[] = [
    rental({ id: "a", item: "A", outDate: "2026-10-01", dueBackDate: "2026-10-28", deposit: 500 }), // overdue, holds 500
    rental({ id: "b", item: "B", outDate: "2026-10-29", dueBackDate: "2026-11-04" }), // due in 5 days
    rental({ id: "c", item: "C", outDate: "2026-10-30", dueBackDate: "2026-11-20", deposit: 200 }), // not soon, holds 200
    rental({ id: "d", item: "D", outDate: "2026-10-20", dueBackDate: "2026-10-22", returnedDate: "2026-10-25", charged: 1250, deposit: 1000, depositRefunded: 800 }), // back, holds 200
    rental({ id: "e", item: "E", outDate: "2026-09-28", dueBackDate: "2026-09-29", returnedDate: "2026-10-01", charged: 300 }), // back on the first day of the window
    rental({ id: "f", item: "F", outDate: "2026-09-20", dueBackDate: "2026-09-21", returnedDate: "2026-09-30", charged: 999 }), // back the day before the window
    rental({ id: "g", item: "G", outDate: "2026-10-05", dueBackDate: "2026-10-10" }), // overdue, older
  ];
  const s = summarizeRentals(list, TODAY);
  ok(s.out === 4, `four rentals still out (got ${s.out})`);
  ok(s.overdue === 2, `two overdue: A and G (got ${s.overdue})`);
  ok(s.dueSoon === 1, `one due in the next 7 days: B (got ${s.dueSoon})`);
  ok(s.returnedLast30 === 2, `two returned in the last 30 days, both window edges included (got ${s.returnedLast30})`);
  ok(s.chargedLast30 === 1550, `rent charged in that window: 1250 + 300 (got ${s.chargedLast30})`);
  ok(s.depositsHeld === 900, `deposits still held: 500 + 200 + 200 (got ${s.depositsHeld})`);
}

// 10. Open list order: overdue first, oldest due day first, then by due day
{
  const list: Rental[] = [
    rental({ id: "c", item: "C", dueBackDate: "2026-11-20" }),
    rental({ id: "a", item: "A", dueBackDate: "2026-10-28" }),
    rental({ id: "x", item: "X", dueBackDate: "2026-10-01", returnedDate: "2026-10-02" }),
    rental({ id: "b", item: "B", dueBackDate: "2026-11-04" }),
    rental({ id: "g", item: "G", dueBackDate: "2026-10-10" }),
  ];
  const order = sortOpenRentals(list, TODAY).map((r) => r.id).join(",");
  ok(order === "g,a,b,c", `open order is overdue oldest first, then by due day, returned excluded (got ${order})`);
}

// 11. Wiring: every place rentals must reach
const dc = read("contexts/DataContext.tsx");
ok(/addRental: async \(r\)/.test(dc) && /updateRental: async/.test(dc) && /deleteRental: async/.test(dc) && /returnRental: async/.test(dc), "the data layer has all four rental writes");
ok(/requirePermission\("manage:rentals"\)/.test(dc), "rental writes need manage:rentals");
ok(/const rentals = readyList\(loading, rentalsRaw\)/.test(dc), "rentals are exposed to the app");
ok(/"rentals"\]|"shipments", "rentals"/.test(dc), "rentals are in the owner and manager read lists");
ok(/collection\(db, "users", businessId, "rentals"\)/.test(dc), "rentals are listened to for the books' roles");
ok(/clearListedUndefined|rental/.test(dc) && /batch\.update\(ref, \{[\s\S]*returnedDate: input\.returnedDate/.test(dc), "a return writes its rental back in the same batch as its sales");
const pg = read("lib/periodGuards.ts");
ok(/returnRental: \(args\) => \[args\[1\]\?\.returnedDate\]/.test(pg), "a return is dated by its return day for the period lock");
ok(/addRental: \(args\) => \(args\[0\]\?\.deposit/.test(pg), "renting out is dated money only when a deposit is taken");
const pl = read("scripts/verify-period-lock.ts");
ok(/"updateRental"/.test(pl), "updating a rental is classified as non-money in the period-lock check");
const rules = read("firestore.rules");
ok(/match \/rentals\/\{docId\} \{[\s\S]*?allow read: if canReadBooks\(businessId\);[\s\S]*?allow create, update: if isOwnerOrManager\(businessId\);/.test(rules), "rules: accountant reads, owner and manager write");
ok(/match \/rentals\/\{docId\} \{[\s\S]*?allow delete: if isOwnerOrManager\(businessId\) && !isPublicDemo\(businessId\);/.test(rules), "rules: delete is owner or manager and not the public demo");
const app = read("components/AppShell.tsx");
ok(app.includes('{ href: "/rentals", label: "Rentals"'), "the menu has Rentals");
ok(read("lib/navPrefs.ts").includes('{ href: "/rentals", label: "Rentals"'), "Rentals can be hidden in the menu settings");
const csv = read("lib/csv.ts");
ok(csv.includes("export function rentalRows"), "rentals have a CSV");
const bk = read("lib/backup.ts");
ok(bk.includes('zip.file("rentals.csv"') && bk.includes("rentalRows(backupRentals)"), "the backup writes rentals.csv");
ok(read("lib/backupPayload.ts").includes("rentals: data.rentals,"), "the backup payload carries rentals");
ok(read("scripts/restore-from-backup.mjs").includes('"rentals"'), "restore accepts the rentals collection");
ok(read("lib/notification-automation.ts").includes('type: "rental_overdue"'), "overdue rentals raise a reminder");
ok(read("contexts/NotificationsContext.tsx").split("rentals,").length - 1 === 3, "the notifications context passes rentals through");
ok(read("app/notifications/page.tsx").includes('rental_overdue: "Rental overdue"'), "the notifications page labels the reminder");
ok(read("lib/aiPrompts.ts").includes("- Rentals (Rentals page"), "the assistant knows about rentals");
ok(read("app/rentals/page.tsx").includes('useRequireRole(["owner", "manager", "accountant"])'), "the Rentals page is for owner, manager and accountant");
ok(read("app/rentals/page.tsx").includes("returnRental(r.id, input)"), "the return goes through the single batch write");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exitCode = 1;
