// Succession and the organisation (lib/succession.ts): the reporting tree, deputies, key-person risks from sole qualification and span of control,
// loops in reporting lines, and the wiring. Worked numbers. Run: npx tsx scripts/verify-succession.ts
import fs from "node:fs";
import { buildOrg, keyPersonRisks } from "../lib/succession";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const members = [
  { id: "a", name: "Owner", active: true },
  { id: "b", name: "Ruwan", active: true },
  { id: "c", name: "Sunil", active: true },
  { id: "d", name: "Dilani", active: true },
  { id: "x", name: "Left", active: false },
];
const links = { b: { reportsToId: "a" }, c: { reportsToId: "b" }, d: { reportsToId: "a" }, x: { reportsToId: "a" } };
const org = buildOrg(members, links);
ok(org.nodes.map((n) => `${n.depth}:${n.name}`).join(" ") === "0:Owner 1:Dilani 1:Ruwan 2:Sunil", "the tree shows who reports to whom, indented by level, with inactive people left out");
ok(org.cycles.length === 0, "a clean reporting tree has no loops");
const loop = buildOrg(members, { a: { reportsToId: "c" }, b: { reportsToId: "a" }, c: { reportsToId: "b" } });
ok(loop.cycles.length > 0 && loop.nodes.length === 4, "a reporting loop is found and reported, and the tree still builds");
ok(buildOrg(members, { a: { reportsToId: "a" } }).cycles.length === 0, "a person reporting to themselves is ignored, not counted as a loop");

const sole = [
  { title: "Cash count", qualified: ["Sunil"] },           // only Sunil: a single point of failure
  { title: "Opening checks", qualified: ["Ruwan", "Dilani"] },
];
const risks = keyPersonRisks(members, links, sole);
ok(risks.length === 1 && risks[0].name === "Sunil" && risks[0].reasons[0].includes("Cash count"), "the person who is the only qualified one for a procedure, with no deputy, is a key-person risk");
const withDeputy = keyPersonRisks(members, { ...links, c: { reportsToId: "b", deputyId: "d" } }, sole);
ok(withDeputy.length === 0, "naming a deputy clears the risk for that person");
const invalid = keyPersonRisks(members, { ...links, c: { reportsToId: "b", deputyId: "x" } }, sole);
ok(invalid.length === 1, "a deputy who is no longer active does not count as cover");
const span = keyPersonRisks(members, { a: {}, b: { reportsToId: "a" }, c: { reportsToId: "a" }, d: { reportsToId: "a" } }, []);
ok(span.length === 1 && span[0].name === "Owner" && span[0].reasons[0].includes("leads 3"), "a person who leads three or more, with no deputy, is flagged for span of control");
ok(keyPersonRisks(members, links, []).length === 0, "with no sole procedures and a small team, nobody is flagged");

ok(tabsForRole("owner").includes("succession") && tabsForRole("manager").includes("succession") && !tabsForRole("staff").includes("succession"), "succession is for the owner and manager");
ok(read("contexts/DataContext.tsx").includes("setOrgLink: async") && read("contexts/DataContext.tsx").includes('requirePermission("manage:team");'), "reporting lines and deputies are recorded with the team permission");
ok(read("firestore.rules").includes("match /orgLinks/{docId}"), "reporting lines and deputies are stored under their own rule");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
