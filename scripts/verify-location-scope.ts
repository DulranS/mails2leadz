// Branch-restricted staff (lib/locationScope.ts): hand-worked cases, then the wiring that must stay in place.
// Run: /home/claude/.npm-global/bin/tsx scripts/verify-location-scope.ts
import fs from "node:fs";
import {
  defaultLocationForScope,
  inScope,
  locationScopeFor,
  offeredLocations,
  recordLocationId,
  scopedRows,
} from "../lib/locationScope";
import type { Location } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const loc = (id: string, extra: Partial<Location> = {}) => ({ id, name: id, active: true, createdAt: 0, ...extra }) as Location;
const MAIN = loc("main", { isDefault: true });
const B = loc("b");
const CLOSED = loc("c", { active: false });
const locations = [MAIN, B, CLOSED];
const keys = (s: Set<string> | null) => (s === null ? "ALL" : [...s].sort().join(","));

// ---- who is restricted ---------------------------------------------------------------------------------------------------
ok(locationScopeFor(undefined, "owner", locations) === null, "the owner is never restricted");
ok(locationScopeFor({ locationIds: ["b"] }, "owner", locations) === null, "even an owner with locations ticked is not restricted");
ok(locationScopeFor(undefined, "staff", locations) === null, "a staff member with no record yet sees every location (no change for anyone not restricted)");
ok(keys(locationScopeFor({}, "staff", locations)) === "ALL", "staff with no locations set see every location");
ok(keys(locationScopeFor({ locationIds: [] }, "staff", locations)) === "ALL", "staff with an empty list see every location");
ok(keys(locationScopeFor({ locationIds: ["b"] }, "staff", locations)) === "b", "staff ticked for B see only B");
ok(keys(locationScopeFor({ locationIds: ["b", "c", "gone"] }, "staff", locations)) === "b", "a closed branch and a deleted one drop out of the scope");
ok(keys(locationScopeFor({ locationIds: ["gone"] }, "staff", locations)) === "", "a scope whose branches are all gone sees nothing, rather than everything");

// ---- which location a record belongs to ----------------------------------------------------------------------------------
ok(recordLocationId(undefined, locations) === "main", "a record with no location belongs to the default location (legacy data)");
ok(recordLocationId("b", locations) === "b", "a record with a location keeps it");
ok(recordLocationId(undefined, [B, MAIN]) === "main", "the default is found even when it is not listed first");
ok(recordLocationId(undefined, [B]) === "b", "with no default flagged, the first location stands in");
ok(recordLocationId(undefined, []) === "", "no locations at all gives no location");

// ---- what a person may see ------------------------------------------------------------------------------------------------
const sB = new Set(["b"]);
ok(inScope(null, locations, "b") && inScope(null, locations, undefined), "an unrestricted person sees every record");
ok(inScope(sB, locations, "b") === true, "restricted to B: a B record is visible");
ok(inScope(sB, locations, "main") === false, "restricted to B: a Main record is hidden");
ok(inScope(sB, locations, undefined) === false, "restricted to B: a legacy record (Main) is hidden");
ok(inScope(new Set(["main"]), locations, undefined) === true, "restricted to Main: a legacy record is visible");

const rows = [
  { id: "r1", locationId: "b" },
  { id: "r2" }, // legacy, belongs to Main
  { id: "r3", locationId: "main" },
  { id: "r4", locationId: "b" },
];
ok(scopedRows(rows, null, locations) === rows, "unrestricted: the same array comes back, so owners pay nothing for the filter");
ok(scopedRows(rows, sB, locations).map((r) => r.id).join() === "r1,r4", "restricted to B: only B's records, in their original order");
ok(scopedRows(rows, new Set(["main"]), locations).map((r) => r.id).join() === "r2,r3", "restricted to Main: Main's records, including legacy ones");

// ---- the location picker -------------------------------------------------------------------------------------------------
ok(offeredLocations(null, locations).map((l) => l.id).join() === "main,b", "unrestricted: every active location, closed ones left out");
ok(offeredLocations(sB, locations).map((l) => l.id).join() === "b", "restricted to B: the picker offers only B");
ok(offeredLocations(new Set(), locations).length === 0, "an empty scope offers nothing");
ok(defaultLocationForScope(null, locations) === "main", "unrestricted: the default location starts the form");
ok(defaultLocationForScope(sB, locations) === "b", "restricted to B: the form starts on B");
ok(defaultLocationForScope(new Set(["main", "b"]), locations) === "main", "restricted to Main and B: the form starts on the default, Main");
ok(defaultLocationForScope(new Set(), locations) === "", "nothing allowed: no starting location");

// ---- wiring --------------------------------------------------------------------------------------------------------------
const ctx = fs.readFileSync("contexts/DataContext.tsx", "utf8");
ok(ctx.includes("const sales = useMemo(() => scopedRows(readyList(loading, salesRaw), myLocationScope, locationsForScope)"), "sales are filtered by the signed-in person's locations");
ok(ctx.includes("const purchases = useMemo(() => scopedRows(readyList(loading, purchasesRaw), myLocationScope, locationsForScope)"), "purchases are filtered by the signed-in person's locations");
ok(ctx.includes("const stockAdjustments = useMemo(() => scopedRows(readyList(loading, stockAdjustmentsRaw), myLocationScope, locationsForScope)"), "stock adjustments are filtered by the signed-in person's locations");
ok(ctx.includes("const saleReturns = useMemo(() => scopedRows(readyList(loading, saleReturnsRaw), myLocationScope, locationsForScope)"), "sale returns are filtered by the signed-in person's locations");
ok(ctx.includes("const estimates = useMemo(() => scopedRows(readyList(loading, estimatesRaw), myLocationScope, locationsForScope)"), "estimates are filtered by the signed-in person's locations");
ok(ctx.includes("const myLocationScope = useMemo(() => locationScopeFor(myMember, role, locationsForScope)"), "the scope is worked out from the signed-in person's member record and role");
ok(ctx.includes('if (target?.role === "owner") throw new Error("The owner can always see every location.");'), "the owner's own locations cannot be restricted");
ok(ctx.includes('{ locationIds: clean }'), "the saved list is written to the member record");
ok(/setMemberLocations: \(uid: string, locationIds: string\[\]\) => Promise<void>;/.test(ctx), "setMemberLocations is part of the data context's interface");
ok(/myLocationScope: Set<string> \| null;/.test(ctx), "the scope is exposed on the data context");
const picker = fs.readFileSync("components/LocationPicker.tsx", "utf8");
ok(picker.includes("defaultLocationForScope(myLocationScope, locations)") && picker.includes("offeredLocations(myLocationScope, locations)"), "the location picker offers only allowed locations and moves a form off a location it may not use");
const team = fs.readFileSync("app/team/page.tsx", "utf8");
ok(team.includes("<StaffLocationsCard />") && team.includes('from "@/components/StaffLocationsCard"'), "the team page shows the work-locations card");
ok(fs.readFileSync("lib/types.ts", "utf8").includes("locationIds?: string[];"), "the member record can carry locationIds");

console.log(fails === 0 ? `OK: ${checks} checks passed` : `${fails} of ${checks} checks FAILED`);
process.exit(fails === 0 ? 0 : 1);
