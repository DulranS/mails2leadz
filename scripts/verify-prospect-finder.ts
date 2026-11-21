// Prospect finder (lib/prospectFinder.ts, lib/prospectSearch.ts, app/api/prospects/search/route.ts): hand-worked cases, with a
// fake map service so no network is needed.
// Run: npx tsx scripts/verify-prospect-finder.ts
import fs from "node:fs";
import {
  bboxFromGeocode, bboxProblem, buildOverpassQuery, categoryByValue, cleanArea, hasContact, markDuplicates, MAX_PROSPECTS,
  parseOverpass, PROSPECT_CATEGORIES, prospectContact, prospectToLead, type Prospect,
} from "../lib/prospectFinder";
import { runProspectSearch } from "../lib/prospectSearch";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

// ---- the category table ---------------------------------------------------------------------------------------------------
ok(new Set(PROSPECT_CATEGORIES.map((c) => c.value)).size === PROSPECT_CATEGORIES.length, "category values are unique");
ok(PROSPECT_CATEGORIES.every((c) => c.tags.length > 0 && c.tags.every(([k, v]) => /^[a-z_]+$/.test(k) && /^[a-z_]+$/.test(v))), "every map tag is plain lowercase words, so nothing in the table can alter a query");
ok(categoryByValue("plumber")?.label === "Plumbers" && categoryByValue("nope") === undefined && categoryByValue(undefined) === undefined, "lookup by value");

// ---- area text and boxes --------------------------------------------------------------------------------------------------
ok(cleanArea("  Dehiwala,   Sri Lanka ") === "Dehiwala, Sri Lanka", "area tidied");
ok(cleanArea("a") === null && cleanArea("") === null && cleanArea("x".repeat(101)) === null && cleanArea(42) === null && cleanArea(undefined) === null, "too short, too long or not text: refused");
ok(cleanArea("Gal\u0000le\nFort") === "Gal le Fort", "control characters become spaces");
// The geocoder's order is [south, north, west, east].
const gBox = bboxFromGeocode({ boundingbox: ["6.80", "6.90", "79.80", "79.90"] });
ok(gBox !== null && gBox.south === 6.8 && gBox.north === 6.9 && gBox.west === 79.8 && gBox.east === 79.9, "geocoder box read in the right order");
ok(bboxFromGeocode(null) === null && bboxFromGeocode({}) === null && bboxFromGeocode({ boundingbox: ["1", "2"] }) === null && bboxFromGeocode({ boundingbox: ["a", "b", "c", "d"] }) === null, "missing or malformed boxes are refused");
ok(bboxFromGeocode({ boundingbox: ["6.9", "6.8", "79.8", "79.9"] }) === null, "an upside-down box is refused");
const SL = { south: 5.9, north: 9.9, west: 79.6, east: 81.9 };
ok(/too big/.test(bboxProblem(SL) ?? ""), "a whole country is too big and the message says what to do");
ok(bboxProblem({ south: 6.8, north: 7.4, west: 79.8, east: 80.4 }) === null, "exactly 0.6 degrees is allowed");
ok(bboxProblem({ south: 6.8, north: 7.41, west: 79.8, east: 80.0 }) !== null, "just over 0.6 degrees is not");
ok(bboxProblem({ south: 6.5, north: 7, west: 79, east: 79.5 }) === null, "a normal district is fine");
ok(bboxProblem({ south: NaN, north: 7, west: 79, east: 79.5 }) === "bad" && bboxProblem({ south: -95, north: -94, west: 0, east: 1 }) === "bad", "NaN and impossible coordinates are 'bad'");

// ---- the query ------------------------------------------------------------------------------------------------------------
const box = { south: 6.8, west: 79.8, north: 6.9, east: 79.9 };
const q = buildOverpassQuery("plumber", box) as string;
ok(q === '[out:json][timeout:25];(nwr["craft"="plumber"]["name"](6.80000,79.80000,6.90000,79.90000);nwr["shop"="plumbing"]["name"](6.80000,79.80000,6.90000,79.90000););out center tags 100;', "the exact query for plumbers in a small box");
ok(buildOverpassQuery("nope", box) === null && buildOverpassQuery("plumber", SL) === null, "an unknown kind or a huge area makes no query");
ok(/out center tags 1;$/.test(buildOverpassQuery("plumber", box, 0) as string) && /out center tags 100;$/.test(buildOverpassQuery("plumber", box, 5000) as string) && /out center tags 7;$/.test(buildOverpassQuery("plumber", box, 7.9) as string), "limit clamped to 1..100 and whole");
ok((buildOverpassQuery("restaurant", box) as string).split("nwr[").length - 1 === 3, "one clause per tag of the kind");
ok(!/[<>'`$\\]/.test(q), "no characters that could break out of the query");

// ---- reading the answer ---------------------------------------------------------------------------------------------------
const sample = {
  elements: [
    { type: "node", id: 1, tags: { name: "Perera Plumbing", phone: "+94 11 234 5678; +94 77 111 2222", email: "info@perera.lk", website: "https://perera.lk", "addr:housenumber": "12", "addr:street": "Galle Road", "addr:city": "Dehiwala" } },
    { type: "way", id: 2, center: { lat: 6.8, lon: 79.8 }, tags: { name: "Silva Pipes", "contact:phone": "0771234567" } },
    { type: "node", id: 3, tags: { name: "No Contact Plumbers" } },
    { type: "node", id: 4, tags: { shop: "plumbing" } },                                   // unnamed: skipped
    { type: "node", id: 5, tags: { name: "Bad Links", email: "not an email", website: "javascript:alert(1)", phone: "" } },
    { type: "node", id: 6, tags: { name: "Perera Plumbing", phone: "+94 11 999 0000" } },       // same name, different number: separate
    { type: "node", id: 7, tags: { name: "perera  plumbing", phone: "+94112345678" } },   // same name and same number as node 1 (spacing and punctuation ignored): duplicate
    { type: "node", id: 8, tags: { name: "<b>Evil</b> \u0007Pipes", "name:en": "ignored" } },
    { type: "relation", id: 9, tags: { "name:en": "English Only Plumbers" } },
    { type: "bogus", id: 10, tags: { name: "Weird Type" } },
    null, 5, "x", { tags: "nope" }, { type: "node", id: 11 },
  ],
};
const parsed = parseOverpass(sample);
const names = parsed.map((p) => p.name);
ok(!names.includes("") && parsed.every((p) => p.name.length > 0 && p.name.length <= 100), "every result has a name");
ok(parsed[0].name === "Perera Plumbing" && parsed.slice(0, 3).every((p) => hasContact(p)) && !hasContact(parsed[3]), "businesses with a phone or email come first");
const perera = parsed.find((p) => p.osmId === "node/1") as Prospect;
ok(perera.phone === "+94 11 234 5678" && perera.email === "info@perera.lk" && perera.website === "https://perera.lk" && perera.address === "12, Galle Road, Dehiwala", "phone (first of several), email, website and address read");
ok(parsed.find((p) => p.osmId === "way/2")?.phone === "0771234567", "the contact:phone tag and map ways are read");
const bad = parsed.find((p) => p.name === "Bad Links") as Prospect;
ok(bad && !("email" in bad) && !("website" in bad) && !("phone" in bad), "an invalid email and a non-web link are dropped, not stored");
ok(parsed.filter((p) => /perera plumbing/i.test(p.name)).length === 2, "same name with a different phone stays; same name and the same phone is one entry");
ok(!parsed.some((p) => /[<>\u0007]/.test(p.name)) && parsed.some((p) => p.name === "b Evil /b Pipes"), "markup and control characters are stripped from names");
ok(parsed.some((p) => p.name === "English Only Plumbers" && p.osmId === "relation/9"), "name:en is used when there is no name");
ok(parsed.find((p) => p.name === "Weird Type")?.osmId === "", "an unknown element type gets no id rather than a wrong one");
ok(parsed.every((p) => Object.values(p).every((v) => v !== undefined)), "no undefined values");
ok(parseOverpass(null).length === 0 && parseOverpass({}).length === 0 && parseOverpass({ elements: "x" }).length === 0 && parseOverpass([]).length === 0 && parseOverpass("junk").length === 0, "unexpected answers give an empty list, never an error");
const many = { elements: Array.from({ length: 300 }, (_, i) => ({ type: "node", id: i + 1, tags: { name: `Shop ${i}` } })) };
ok(parseOverpass(many).length === MAX_PROSPECTS, "at most 100 results");
ok(parseOverpass({ elements: [{ type: "node", id: 1, tags: { name: "n".repeat(300), phone: "9".repeat(300), website: "https://" + "w".repeat(400) + ".com" } }] })[0].name.length === 100, "very long fields are cut");

// ---- duplicates -----------------------------------------------------------------------------------------------------------
const ps: Prospect[] = [
  { osmId: "n/1", name: "Perera Plumbing", phone: "+94 11 234 5678" },
  { osmId: "n/2", name: "Totally New Ltd", phone: "077-111-2222" },
  { osmId: "n/3", name: "Renamed Co", email: "Sales@Kamal.lk" },
  { osmId: "n/4", name: "Kamal Traders" },
  { osmId: "n/5", name: "Fresh Start" },
];
const dup = markDuplicates(ps, [{ name: "  perera   PLUMBING ", contact: "" }, { name: "Other", contact: "0771112222" }], [{ name: "kamal traders" }, { name: "Elsewhere", contact: "sales@kamal.lk" }]);
ok(dup[0].duplicate === "lead", "same name (spacing and case ignored) is already a lead");
ok(dup[1].duplicate === "lead", "same phone with different punctuation is already a lead");
ok(dup[2].duplicate === "customer", "same email as a customer (case ignored) is a customer");
ok(dup[3].duplicate === "customer", "same name as a customer is a customer");
ok(dup[4].duplicate === null, "a new business is not marked");
ok(markDuplicates([{ osmId: "", name: "X", phone: "0771112222" }], [{ name: "L", contact: "0771112222" }], [{ name: "C", contact: "0771112222" }])[0].duplicate === "customer", "a customer outranks a lead");
ok(markDuplicates([{ osmId: "", name: "X" }], [{ name: "L", contact: "" }], [{ name: "C", contact: "" }])[0].duplicate === null, "empty contacts never match each other");

// ---- the lead a prospect becomes ------------------------------------------------------------------------------------------
const lead = prospectToLead(perera, "Plumbers");
ok(lead.name === "Perera Plumbing" && lead.contact === "+94 11 234 5678" && lead.source === "Cold outreach", "name, phone as the contact, and the existing Cold outreach source");
ok(lead.notes === "Plumbers · 12, Galle Road, Dehiwala · https://perera.lk · info@perera.lk · Found on OpenStreetMap", "the note keeps the kind, address, site, the email when the phone is the contact, and where it came from");
const l2 = prospectToLead({ osmId: "x", name: "Only Name" }, "Plumbers");
ok(!("contact" in l2) && l2.notes === "Plumbers · Found on OpenStreetMap" && Object.values(l2).every((v) => v !== undefined), "no contact: the field is left out; nothing undefined");
ok(prospectToLead({ osmId: "x", name: "E", email: "a@b.co" }, "Plumbers").contact === "a@b.co" && prospectContact({ osmId: "", name: "E" }) === "", "email is the contact when there is no phone");
ok(prospectToLead({ osmId: "x", name: "L", address: "a".repeat(150), website: "https://" + "w".repeat(190) }, "K".repeat(300)).notes.length <= 500, "note capped at 500");

// ---- the search, against a fake map service ------------------------------------------------------------------------------
type Call = { url: string; init?: RequestInit };
function fake(responses: Array<Response | Error>): { f: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses[i++];
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  return { f, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const place = [{ display_name: "Dehiwala-Mount Lavinia, Western Province, Sri Lanka", boundingbox: ["6.80", "6.90", "79.80", "79.90"] }];

async function main() {
  // Success.
  let s = fake([json(place), json(sample)]);
  let r = await runProspectSearch({ category: "plumber", area: " Dehiwala,  Sri Lanka ", fetchImpl: s.f, contact: "ops@example.com" });
  ok(r.ok && r.prospects.length > 0 && r.place.startsWith("Dehiwala-Mount Lavinia") && r.categoryLabel === "Plumbers", "a normal search returns the parsed businesses, the place name and the kind");
  ok(s.calls.length === 2, "exactly one geocode request and one map-data request");
  ok(s.calls[0].url.includes("q=Dehiwala%2C%20Sri%20Lanka") && s.calls[0].url.includes("limit=1"), "the geocode asks for one place, with the area tidied and encoded");
  const ua = (s.calls[0].init?.headers as Record<string, string>)["User-Agent"];
  ok(/^Balancr\/1\.0 \(ops@example\.com\)$/.test(ua) && (s.calls[1].init?.headers as Record<string, string>)["User-Agent"] === ua, "both requests name the app and its operator, as the map services require");
  ok(s.calls[1].init?.method === "POST" && String(s.calls[1].init?.body).startsWith("data=") && decodeURIComponent(String(s.calls[1].init?.body).slice(5)) === buildOverpassQuery("plumber", { south: 6.8, west: 79.8, north: 6.9, east: 79.9 }), "the map-data request carries exactly the query built from the geocoded box");
  ok(!!s.calls[0].init?.signal && !!s.calls[1].init?.signal, "both requests have a timeout");
  const noContact = fake([json(place), json(sample)]);
  await runProspectSearch({ category: "plumber", area: "Dehiwala", fetchImpl: noContact.f });
  ok(/business management app/.test((noContact.calls[0].init?.headers as Record<string, string>)["User-Agent"]), "without a contact configured the User-Agent still names the app");

  // Input problems make no request at all.
  s = fake([]);
  r = await runProspectSearch({ category: "nope", area: "Dehiwala", fetchImpl: s.f });
  ok(!r.ok && r.status === 400 && s.calls.length === 0, "an unknown kind is refused before any request");
  r = await runProspectSearch({ category: "plumber", area: " ", fetchImpl: s.f });
  ok(!r.ok && r.status === 400 && s.calls.length === 0, "a blank area is refused before any request");

  // Place problems.
  s = fake([json([])]);
  r = await runProspectSearch({ category: "plumber", area: "Atlantis", fetchImpl: s.f });
  ok(!r.ok && r.status === 404 && /Couldn't find "Atlantis"/.test(r.error) && s.calls.length === 1, "an unknown place says so and does not ask for businesses");
  s = fake([json([{ display_name: "x", boundingbox: ["a"] }])]);
  r = await runProspectSearch({ category: "plumber", area: "Weird", fetchImpl: s.f });
  ok(!r.ok && r.status === 404 && s.calls.length === 1, "a place with no usable box is refused");
  s = fake([json([{ display_name: "Sri Lanka", boundingbox: ["5.9", "9.9", "79.6", "81.9"] }])]);
  r = await runProspectSearch({ category: "plumber", area: "Sri Lanka", fetchImpl: s.f });
  ok(!r.ok && r.status === 400 && /too big/.test(r.error) && s.calls.length === 1, "a whole country is refused, and the heavy map query is never made");
  s = fake([json({ not: "an array" })]);
  r = await runProspectSearch({ category: "plumber", area: "Odd", fetchImpl: s.f });
  ok(!r.ok && r.status === 404, "a geocoder answer that is not a list is treated as not found");

  // Service problems.
  for (const [label, resp, status] of [["geocode 429", [json({}, 429)], 503], ["geocode 500", [json({}, 500)], 502], ["geocode network error", [new Error("ECONNRESET")], 502], ["map data 429", [json(place), json({}, 429)], 503], ["map data 504", [json(place), json({}, 504)], 503], ["map data 500", [json(place), json({}, 500)], 502], ["map data network error", [json(place), new Error("timeout")], 502], ["map data not JSON", [json(place), new Response("<html>busy</html>", { status: 200 })], 502]] as const) {
    const rr = await runProspectSearch({ category: "plumber", area: "Dehiwala", fetchImpl: fake([...resp]).f });
    ok(!rr.ok && rr.status === status && /try again in a minute/.test(rr.error), `${label}: status ${status}, a plain "try again" message and no crash`);
  }
  // An empty result is a success, not an error.
  r = await runProspectSearch({ category: "plumber", area: "Dehiwala", fetchImpl: fake([json(place), json({ elements: [] })]).f });
  ok(r.ok && r.prospects.length === 0, "no businesses found is an empty list, not an error");

  // ---- wiring ---------------------------------------------------------------------------------------------------------
  const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  const route = read("app/api/prospects/search/route.ts");
  ok(/requireAiContext\(req\)/.test(route) && /accountKind === "public_demo"/.test(route), "route: owner/manager sign-in and suspension rules, and never the public demo");
  ok(route.indexOf("isRateLimited(") > 0 && route.indexOf("isRateLimited(") < route.indexOf("runProspectSearch("), "route: the daily limit is checked before the map services are asked");
  ok(/PROSPECT_SEARCHES_PER_DAY = 15/.test(route) && /valid &&/.test(route), "route: 15 searches a day per business, counted only for real searches");
  ok(!/addDoc|setDoc|updateDoc|\.set\(|\.add\(|batch\(/.test(route), "route writes nothing to the database");
  for (const f of ["app/api/prospects/search/route.ts", "app/api/ai/draft/route.ts"]) {
    const bad = read(f).split("\n").filter((l) => /^export /.test(l) && !/^export (async function POST|const runtime|const maxDuration)\b/.test(l));
    ok(bad.length === 0, `${f}: only POST, runtime and maxDuration are exported (any other export fails the Next.js build): ${bad.join(" | ")}`);
  }
  const comp = read("components/ProspectFinder.tsx");
  ok(/role !== "owner" && role !== "manager"\) return null/.test(comp), "button: owners and managers only");
  ok(/bulkAddLeads\(chosen\)/.test(comp) && /!m\.duplicate/.test(comp) && /markDuplicates\(/.test(comp), "adding goes through the same path as a CSV import and never adds a marked duplicate");
  ok(/OSM_CREDIT/.test(comp), "the map credit is shown");
  ok(/<ProspectFinder \/>/.test(read("app/leads/page.tsx")), "the Leads page has the button");
  ok(/- Find prospects|Find prospects/.test(read("lib/aiPrompts.ts")), "the AI assistant knows the feature");

  console.log(`${checks - fails}/${checks} checks passed`);
  if (fails) process.exit(1);
}
main();
