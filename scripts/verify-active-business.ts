// Choosing among several businesses on one login (lib/activeBusiness.ts), and the wiring that must not change the
// ordinary one-business login. Run: npx tsx scripts/verify-active-business.ts
import fs from "node:fs";
import { resolveActiveBusiness, listBusinesses, activeBusinessKey, pickRequestBusiness, BUSINESS_ID_HEADER } from "../lib/activeBusiness";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const r = (p: string | null, c: string | null, m: { active?: boolean } | null | undefined) => resolveActiveBusiness(p, c, m);

// Ordinary login: no choice stored = the pointer's business, nothing dropped.
ok(r("A", null, undefined).businessId === "A" && !r("A", null, undefined).dropChoice, "no choice: the pointer's business, as before");
ok(r(null, null, undefined).businessId === null && r(null, "B", { active: true }).businessId === null, "no pointer: no business, whatever is stored");
// A choice that points at the pointer's own business is redundant and is dropped.
ok(r("A", "A", undefined).businessId === "A" && r("A", "A", undefined).dropChoice, "choosing the primary business clears the stored choice");
// A chosen business not yet verified is shown; once verified active it stays.
ok(r("A", "B", undefined).businessId === "B" && !r("A", "B", undefined).dropChoice, "unverified choice is shown while the member lookup runs");
ok(r("A", "B", { active: true }).businessId === "B" && r("A", "B", {}).businessId === "B", "an active member record keeps the choice");
// Lost access: removed or deactivated falls back to the primary and drops the choice.
ok(r("A", "B", null).businessId === "A" && r("A", "B", null).dropChoice, "no member record at the chosen business: back to the primary");
ok(r("A", "B", { active: false }).businessId === "A" && r("A", "B", { active: false }).dropChoice, "deactivated at the chosen business: back to the primary");

const l = listBusinesses("A", ["B", "A", "", "C", "B"]);
ok(l.map((x) => x.businessId).join() === "A,B,C" && l[0].isPrimary && !l[1].isPrimary, "list: primary first, linked after, no repeats or blanks");
ok(listBusinesses(null, ["B"]).map((x) => x.businessId).join() === "B" && listBusinesses("A", []).length === 1, "list works with no pointer or no links");
ok(activeBusinessKey("u1") === "balancr.activeBiz.u1", "the stored choice is per login");

// Server side: which business a request is for.
ok(pickRequestBusiness("A", null) === "A" && pickRequestBusiness("A", undefined) === "A" && pickRequestBusiness("A", "") === "A" && pickRequestBusiness("A", "   ") === "A", "no header: the pointer's business, as before");
ok(pickRequestBusiness("A", "A") === "A" && pickRequestBusiness("A", "B") === "B" && pickRequestBusiness("A", "  B  ") === "B", "a header naming another business is used (membership is still checked by the caller)");
ok(pickRequestBusiness("A", "../users/x") === "A" && pickRequestBusiness("A", "a/b") === "A" && pickRequestBusiness("A", "B C") === "A" && pickRequestBusiness("A", "x".repeat(129)) === "A" && pickRequestBusiness("A", "B\nC") === "A", "a malformed header (path characters, spaces, too long) falls back to the pointer");
ok(BUSINESS_ID_HEADER === "x-business-id", "the header name is fixed");
const admin = fs.readFileSync("lib/firebaseAdmin.ts", "utf8");
ok(/pickRequestBusiness\(pointerBusinessId, req\.headers\.get\(BUSINESS_ID_HEADER\)\)/.test(admin), "the server picks the business through the checked helper");
const afterPick = admin.slice(admin.indexOf("pickRequestBusiness(pointerBusinessId"));
ok(/members"\)\.doc\(uid\)\.get\(\)/.test(afterPick) && /member\.active === false \|\| !member\.role/.test(afterPick) && /resolveAccess\(/.test(afterPick), "the member record, its active flag, and suspension are all checked against the picked business");
for (const [file, n] of [["contexts/AiAssistantContext.tsx", 3], ["app/products/page.tsx", 1]] as const) {
  const src = fs.readFileSync(file, "utf8");
  ok((src.match(/\[BUSINESS_ID_HEADER\]:/g) ?? []).length === n, `${file}: every API call sends the business it is showing (${n})`);
}

// Wiring: the ordinary path is untouched, the fallback exists, and access never depends on the choice.
const auth = fs.readFileSync("contexts/AuthContext.tsx", "utf8");
ok(/resolveActiveBusiness\(/.test(auth), "AuthContext uses the resolver");
ok(/memberships", user\.uid\)/.test(auth) && /pointerBusinessId/.test(auth), "AuthContext still reads the pointer, and keeps it");
ok(/localStorage/.test(auth) && /try \{[\s\S]{0,200}localStorage/.test(auth), "the stored choice is read inside try/catch (private mode never breaks sign-in)");
ok(/dropChoice/.test(auth), "a lost choice is dropped and the primary shown again");
const rules = fs.readFileSync("firestore.rules", "utf8");
const block = rules.match(/match \/linked\/\{linkedBusinessId\} \{[\s\S]*?\n      \}/);
ok(!!block, "firestore.rules has the linked-businesses block");
ok(!!block && /allow read: if signedIn\(\) && request\.auth\.uid == uid;/.test(block[0]), "only the person reads their own list");
ok(!!block && /allow create: if signedIn\(\) && request\.auth\.uid == uid\s*&&\s*get\(\/databases\/\$\(database\)\/documents\/users\/\$\(linkedBusinessId\)\/members\/\$\(uid\)\)\.data\.active == true;/.test(block[0]), "a link can only be made to a business where the person is an active member");
ok(!!block && /allow update: if false;/.test(block[0]) && /allow delete: if signedIn\(\) && request\.auth\.uid == uid && !isPublicDemo\(linkedBusinessId\);/.test(block[0]), "links are not editable; the person can remove their own");
ok((rules.match(/\{/g) ?? []).length === (rules.match(/\}/g) ?? []).length && (rules.match(/\(/g) ?? []).length === (rules.match(/\)/g) ?? []).length, "firestore.rules braces and parentheses balance");
ok(!/allow update: if false;\s*\/\/ \(Not for the shared demo/.test(rules) || /match \/memberships\/\{uid\}/.test(rules), "the pointer's own never-updated rule is untouched");
ok(/allow update: if false;\n      \/\/ \(Not for the shared demo: a visitor deleting its pointer/.test(rules), "the pointer rules (never updated) are exactly as before");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
