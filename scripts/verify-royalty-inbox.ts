// Royalty to head office, one key per site: a statement is accepted only if it adds up, from a site with its own active key, which is
// checked against a stored hash (never the key itself); a repeat send is a no-op; revoking stops a site at once; confirming books the income
// once; and the old shared key is gone. Run: npx tsx scripts/verify-royalty-inbox.ts
import fs from "node:fs";
import { createHash } from "node:crypto";
import { validateStatement, statementDocId, isSiteId, SITE_KEY_PREFIX } from "../lib/royaltyInbox";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const good = { sourceBusinessId: "siteABCD1234", sourceName: "Kandy branch", period: "2026-10", currency: "lkr", rows: [{ location: "Kandy branch", sales: 15000, ratePct: 6, royalty: 900 }] };
const v = validateStatement(good);
ok(v.ok && v.value.currency === "LKR" && v.value.rows[0].royalty === 900, "a statement that adds up is accepted, and its currency is kept in capitals");
ok(!validateStatement({ ...good, rows: [{ location: "Kandy branch", sales: 15000, ratePct: 6, royalty: 1000 }] }).ok, "a royalty that is not the rate of the sales is refused, not corrected");
ok(!validateStatement({ ...good, period: "2026-13" }).ok && !validateStatement({ ...good, currency: "RUPEE" }).ok, "a bad month or a bad currency is refused");
ok(!validateStatement({ ...good, rows: [] }).ok, "a statement with no rows is refused");
ok(!validateStatement({ ...good, rows: [{ location: "X", sales: 100, ratePct: 150, royalty: 150 }] }).ok, "a rate above 100% is refused");
ok(!validateStatement({ ...good, sourceBusinessId: "bad id!" }).ok && !validateStatement(null).ok, "a malformed site id, or a body that is not an object, is refused");
ok(statementDocId("siteABCD1234", "2026-10") === "siteABCD1234_2026-10", "a statement's id is its site and month, so a repeat send is recognised");
ok(isSiteId("siteABCD1234") && !isSiteId("bad id!") && SITE_KEY_PREFIX === "rsk_", "a site id is checked, and site keys carry their own prefix");

const recv = read("app/api/v1/businesses/[businessId]/royalty/statement/route.ts");
ok(recv.includes('collection("royaltyInboxSites").doc(st.sourceBusinessId)') && recv.includes("timingSafeEqual") && recv.includes("sha256Hex(given)"), "the site's own key is hashed and compared in constant time, against that site's stored hash");
ok(recv.includes("site.revokedAt") && recv.includes("!site?.keyHash"), "a site with no key, or a revoked one, is refused");
ok(recv.includes('create({') && recv.includes('code === 6') && recv.includes('status: "pending"'), "a statement is stored once, as pending; a repeat is recognised and nothing is booked here");
ok(!recv.includes('integrations").doc("royalty_inbox")') && !/allowedSources/.test(recv), "the receiving route no longer uses the shared key or the allow-list");

const inbox = read("components/ops/RoyaltyInbox.tsx");
ok(inbox.includes("keyHash: await sha256Hex(key)") && !/keyHash:\s*key\b/.test(inbox), "only the hash of a site's key is stored");
ok(inbox.includes("revokedAt: Date.now(), keyHash: \"\"") && inbox.includes("Copy it now"), "revoking clears the stored hash; a key is shown once, when made");
ok(inbox.includes('"Royalty income:') === false && inbox.includes("`Royalty income: ${s.sourceName}") && inbox.includes("if (!expenses.some((e) => e.name === name))"), "confirming books the income once, and only then marks the statement confirmed");
ok(inbox.includes('status: "confirmed"'), "a confirmed statement is marked so it cannot be booked again");

const hash = createHash("sha256").update("example").digest("hex");
ok(/^[0-9a-f]{64}$/.test(hash) && read("components/ops/RoyaltyInbox.tsx").includes('crypto.subtle.digest("SHA-256"') && recv.includes('createHash("sha256")'), "the browser and the server both use SHA-256 in lowercase hex, so a key checks out on either side");
ok(!read("lib/integrations.ts").includes('id: "royalty_inbox"') && !read("lib/integrations.ts").includes("royalty_inbox\"]"), "the old shared inbox key is no longer offered");
ok(read("firestore.rules").includes("match /royaltyInboxSites/{docId}") && read("firestore.rules").includes("hasOnly(['status', 'decidedAt', 'incomeRecordedName'])"), "the rules: site records are for the owner and manager; statements change only their status and the income booked");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
