// Table-time pricing (lib/bookings.ts): minimum charge, billing blocks, per-person rate, and party size on a booking.
// Run: npx tsx scripts/verify-table-pricing.ts
import fs from "node:fs";
import { billableMinutes, cleanBookingInput, cleanPricingRules, suggestBookingPrice, validateBookingInput, type BookingInput } from "../lib/bookings";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const table = { defaultSellPrice: 600, baseUnit: "hour" };
// plain hourly pricing is unchanged
ok(suggestBookingPrice(table, 90)?.amount === 900, "no rules: 90 min at 600/h = 900");
ok(suggestBookingPrice(table, 90, {}, 4)?.amount === 900, "no rules: party size changes nothing");
ok(suggestBookingPrice(table, 90, undefined)?.basis === "1.5 h at 600 per hour", "no rules: basis text unchanged");
// minimum charge
ok(suggestBookingPrice(table, 30, { minMinutes: 60 })?.amount === 600, "a 30 min booking is charged the 60 min minimum");
ok(suggestBookingPrice(table, 90, { minMinutes: 60 })?.amount === 900, "a booking above the minimum is unaffected");
ok(/booked 30 min, charged as 60/.test(suggestBookingPrice(table, 30, { minMinutes: 60 })!.basis), "the working says why");
// blocks
ok(billableMinutes(70, { blockMinutes: 30 }) === 90 && billableMinutes(60, { blockMinutes: 30 }) === 60 && billableMinutes(1, { blockMinutes: 30 }) === 30, "rounds up to whole blocks");
ok(suggestBookingPrice(table, 70, { blockMinutes: 30 })?.amount === 900, "70 min in 30 min blocks is charged as 90");
ok(billableMinutes(20, { minMinutes: 60, blockMinutes: 30 }) === 60 && billableMinutes(70, { minMinutes: 60, blockMinutes: 30 }) === 90, "minimum and blocks together");
// per person
ok(suggestBookingPrice(table, 60, { perPerson: true }, 4)?.amount === 2400, "per person: 4 people for an hour");
ok(suggestBookingPrice(table, 60, { perPerson: true })?.amount === 600, "per person with no party size counts one");
ok(suggestBookingPrice(table, 60, { perPerson: true }, 0)?.amount === 600 && suggestBookingPrice(table, 60, { perPerson: true }, 2.9)?.amount === 1200, "party size is whole and at least one");
ok(/for 4 people/.test(suggestBookingPrice(table, 60, { perPerson: true }, 4)!.basis), "the working names the people");
ok(suggestBookingPrice(table, 60, { perPerson: false }, 4)?.amount === 600, "per person off: party size ignored");
ok(Math.abs(suggestBookingPrice({ defaultSellPrice: 333.33, baseUnit: "hr" }, 45, { perPerson: true }, 3)!.amount - 749.99) < 0.011, "money is rounded to cents");
// still only for hourly services
ok(suggestBookingPrice({ defaultSellPrice: 600, baseUnit: "pc" }, 60, { minMinutes: 60 }) === null && suggestBookingPrice({ defaultSellPrice: 0, baseUnit: "hour" }, 60) === null, "non-hourly services and zero prices get no suggestion");
// rule cleaning
const c = cleanPricingRules({ minMinutes: -5, blockMinutes: 1.5, perPerson: "yes" as any });
ok(c.minMinutes === undefined && c.blockMinutes === undefined && c.perPerson === false, "bad rule values are dropped");
ok(cleanPricingRules({ minMinutes: 5000, blockMinutes: 500 }).minMinutes === undefined, "absurd rule values are dropped");
// party size on a booking
const base: BookingInput = { customerName: "Kasun", service: "Table", date: "2026-11-10", startTime: "10:00", durationMin: 60, status: "booked" };
ok(validateBookingInput({ ...base, partySize: 4 }) === null && validateBookingInput(base) === null, "party size is optional");
ok(validateBookingInput({ ...base, partySize: 0 }) !== null && validateBookingInput({ ...base, partySize: 2.5 }) !== null && validateBookingInput({ ...base, partySize: 201 }) !== null, "party size must be a whole number from 1 to 200");
ok(cleanBookingInput({ ...base, partySize: 4 }).partySize === 4 && cleanBookingInput(base).partySize === undefined, "party size is kept when given and absent otherwise");
// wiring
const page = read("app/bookings/page.tsx");
ok((page.match(/bookingPerPerson/g) ?? []).length >= 3, "all three price hints on the bookings page pass the rules");
ok(/saleFor\.partySize/.test(page) && /b\.partySize\)/.test(page), "and the party size");
ok(/role !== "owner"\) return null/.test(read("components/TablePricingCard.tsx")) && /deleteField\(\)/.test(read("components/TablePricingCard.tsx")), "the rules are the owner's to save, and clearing one really clears it");
console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
