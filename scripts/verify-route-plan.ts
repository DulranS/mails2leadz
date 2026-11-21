// Route planning (v319, lib/routePlan.ts): the nearest-neighbour order and its tie-break, the metres and the return leg, the geocode and
// distance matrix parsers, the URL builders, the "not configured" state (no key, no call), and a full plan with a mocked fetch: the order,
// the unlocated stops, the Google refusal, and that the key never appears in an error. No real network call is made.
// Run: npx tsx scripts/verify-route-plan.ts
import fs from "node:fs";
import path from "node:path";
import { nearestNeighbourOrder, routeMetres, geocodeUrl, distanceMatrixUrl, parseGeocode, parseDistanceMatrix, planRoute, MAX_ROUTE_STOPS, type RouteStop } from "../lib/routePlan";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

// point 0 is the depot; 1..3 are stops
const M = [
  [0, 10, 30, 20],
  [10, 0, 15, 40],
  [30, 15, 0, 5],
  [20, 40, 5, 0],
];
ok(JSON.stringify(nearestNeighbourOrder(M, 0)) === JSON.stringify([1, 2, 3]), "from the depot, the nearest stop is taken first, then the nearest from there");
const M2 = [
  [0, 10, 10],
  [10, 0, 5],
  [10, 5, 0],
];
ok(JSON.stringify(nearestNeighbourOrder(M2, 0)) === JSON.stringify([1, 2]), "a tie goes to the lower index");
const Mx = [
  [0, Infinity, 7],
  [Infinity, 0, Infinity],
  [7, Infinity, 0],
];
ok(JSON.stringify(nearestNeighbourOrder(Mx, 0)) === JSON.stringify([2, 1]), "an unreachable stop goes last");
ok(JSON.stringify(nearestNeighbourOrder([[0]], 0)) === "[]", "no stops gives an empty order");

const rm = routeMetres(M, 0, [1, 2, 3]);
ok(JSON.stringify(rm.legs) === JSON.stringify([10, 15, 5]) && rm.returnLeg === 20 && rm.total === 50, "the legs are 10, 15 and 5 metres, and the return is 20 metres");

ok(geocodeUrl("12 Galle Rd, Colombo", "KEY1").includes("address=12%20Galle%20Rd%2C%20Colombo") && geocodeUrl("x", "KEY1").endsWith("key=KEY1"), "the geocode URL encodes the address and carries the key");
const mu = distanceMatrixUrl([{ lat: 6.9, lng: 79.8 }, { lat: 6.91, lng: 79.81 }], "KEY2");
ok(mu.includes("origins=6.9%2C79.8%7C6.91%2C79.81") && mu.includes("units=metric") && mu.endsWith("key=KEY2"), "the matrix URL lists the points as lat,lng with the metric units");

ok(parseGeocode({ status: "OK", results: [{ geometry: { location: { lat: 6.9, lng: 79.8 } } }] })?.lat === 6.9, "a geocode answer gives the point");
ok(parseGeocode({ status: "ZERO_RESULTS", results: [] }) === null, "no result gives null");
ok(parseGeocode({ status: "OK", results: [{ geometry: { location: { lat: "6.9", lng: 79.8 } } }] }) === null, "a point that is not a number is refused");
ok(parseDistanceMatrix({ status: "OK", rows: [{ elements: [{ status: "OK", distance: { value: 100 } }, { status: "NOT_FOUND" }] }, { elements: [{ status: "OK", distance: { value: 50 } }, { status: "OK", distance: { value: 0 } }] }] }, 2)?.[0][1] === Infinity, "an element Google could not route is infinite");
ok(parseDistanceMatrix({ status: "OK", rows: [{ elements: [{ status: "OK", distance: { value: 1 } }] }] }, 2) === null, "a matrix of the wrong size is refused");
ok(parseDistanceMatrix({ status: "REQUEST_DENIED", error_message: "x" }, 2) === null, "a refused request is refused");

async function run() {
// not configured: no key, no call
let calls = 0;
const countingFetch = (async () => { calls++; return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
const stops: RouteStop[] = [{ id: "o1", name: "Ann", address: "1 Lake Rd" }, { id: "o2", name: "Ben", address: "2 Hill St" }];
const nc = await planRoute({ depotAddress: "Depot", stops, key: undefined, fetchImpl: countingFetch });
ok(nc.configured === false && nc.error.includes("GOOGLE_MAPS_KEY") && calls === 0, "no key: not configured, the setting is named, and nothing is called");
ok((await planRoute({ depotAddress: "Depot", stops, key: "   ", fetchImpl: countingFetch })).configured === false, "a blank key is not configured");

// a full plan with a mocked Google
const SECRET = "AIza-test-key-123";
const answers: Record<string, unknown> = {};
function geo(lat: number, lng: number) { return { status: "OK", results: [{ geometry: { location: { lat, lng } } }] }; }
const mockGoogle = (async (url: string) => {
  const u = String(url);
  if (u.includes("/geocode/")) {
    if (u.includes(encodeURIComponent("Depot"))) return new Response(JSON.stringify(geo(6.0, 80.0)));
    if (u.includes(encodeURIComponent("1 Lake Rd"))) return new Response(JSON.stringify(geo(6.1, 80.1)));
    if (u.includes(encodeURIComponent("2 Hill St"))) return new Response(JSON.stringify(geo(6.2, 80.2)));
    return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }));
  }
  if (u.includes("/distancematrix/")) {
    // depot 0, Ann 1 (near), Ben 2 (far); the order must be Ann then Ben
    const m = [[0, 5000, 9000], [5000, 0, 2000], [9000, 2000, 0]];
    return new Response(JSON.stringify({ status: "OK", rows: m.map((r) => ({ elements: r.map((d) => ({ status: "OK", distance: { value: d } })) })) }));
  }
  return new Response("{}", { status: 404 });
}) as unknown as typeof fetch;
const plan = await planRoute({ depotAddress: "Depot", stops: [...stops, { id: "o3", name: "Cy", address: "Nowhere at all" }, { id: "o4", name: "Di", address: "" }], key: SECRET, fetchImpl: mockGoogle });
ok(plan.configured === true && plan.ok === true, "with a key and answers the plan is ok");
if (plan.configured && plan.ok) {
  ok(plan.stops.map((s) => s.id).join(",") === "o1,o2", "the stops come in the nearest-first order");
  ok(plan.stops[0].legKm === 5 && plan.stops[1].legKm === 2 && plan.stops[1].cumulativeKm === 7, "the legs are 5 km and 2 km, and the running total is 7 km");
  ok(plan.totalKm === 7 && plan.returnKm === 9, "the total is 7 km, and the way back to the depot is 9 km");
  ok(plan.unlocated.length === 2 && plan.unlocated.some((u) => u.id === "o3") && plan.unlocated.some((u) => u.id === "o4"), "a stop Google cannot place, and one with no address, are listed as unlocated");
}
// the key is in the requests, never in a result or an error
ok(!JSON.stringify(plan).includes(SECRET), "the key is not in the plan result");

const refused = (async (url: string) => {
  if (String(url).includes("/geocode/")) return new Response(JSON.stringify({ status: "REQUEST_DENIED", results: [] }));
  return new Response("{}", { status: 500 });
}) as unknown as typeof fetch;
const bad = await planRoute({ depotAddress: "Depot", stops, key: SECRET, fetchImpl: refused });
ok(bad.configured === true && bad.ok === false && !JSON.stringify(bad).includes(SECRET), "a refused key gives an error with no key in it");

const tooMany = await planRoute({ depotAddress: "Depot", stops: Array.from({ length: MAX_ROUTE_STOPS + 1 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, address: "a" })), key: SECRET, fetchImpl: mockGoogle });
ok(tooMany.configured === true && tooMany.ok === false && tooMany.error.includes(String(MAX_ROUTE_STOPS)), "more stops than the limit is refused before any call");

const noDepot = await planRoute({ depotAddress: "  ", stops, key: SECRET, fetchImpl: mockGoogle });
ok(noDepot.configured === true && noDepot.ok === false && noDepot.error.includes("Settings"), "no business address is refused, and the fix is named");

const root = path.resolve(process.cwd());
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
ok(read("app/api/routes/plan/route.ts").includes("planRoute") && read("app/api/routes/plan/route.ts").includes("GOOGLE_MAPS_KEY"), "the route plans through the helper and reads the key from the server environment");
ok(!/console\.\w+\([^)]*(KEY|key)/.test(read("app/api/routes/plan/route.ts")), "the route never logs the key");
ok(read("components/ops/DeliveryRunPanel.tsx").includes("/api/routes/plan"), "the delivery run sheet asks for a planned route");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) { console.error(`${fails} failed`); process.exit(1); }
}

run();
