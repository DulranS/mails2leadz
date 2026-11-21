// Checks the key encryption for saved outside-service keys. Run: tsx scripts/verify-secret-box.ts
import fs from "node:fs";
import {
  loadSecretKey, sealValue, openValue, revealValues, sealSecrets, secretHint, isSealed, SecretKeyMissingError, SEALED_PREFIX,
} from "../lib/secretBox";

let checks = 0;
let fails = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const KEY = loadSecretKey("ab".repeat(32))!;
const OTHER = loadSecretKey("cd".repeat(32))!;

ok(loadSecretKey(undefined) === null, "no key gives null");
ok(loadSecretKey("short") === null, "a short key gives null");
ok(loadSecretKey("zz".repeat(32)) === null, "a non-hex key gives null");
ok(loadSecretKey(`  ${"ab".repeat(32)}  `)?.length === 32, "a key with spaces around it is accepted");

const sealed = sealValue("merchant-secret-123", KEY);
ok(sealed.startsWith(SEALED_PREFIX) && isSealed(sealed), "a sealed value carries the prefix");
ok(!sealed.includes("merchant-secret-123"), "the plain value does not appear in the sealed form");
ok(openValue(sealed, KEY) === "merchant-secret-123", "a sealed value opens with the same key");
ok(sealValue("same", KEY) !== sealValue("same", KEY), "each seal uses a fresh nonce");
ok(openValue(sealed, OTHER) === null, "a value does not open with a different key");
ok(openValue(sealed, null) === null, "a value does not open without a key");
const tampered = sealed.slice(0, -2) + (sealed.slice(-2) === "AA" ? "BB" : "AA");
ok(openValue(tampered, KEY) === null, "a tampered value fails (GCM authentication)");
ok(openValue("enc:v1:not:valid", KEY) === null, "a malformed sealed value fails safely");
ok(openValue("plain", KEY) === null, "a plain value is not treated as sealed");

const stored = { merchantId: "123", merchantSecret: sealed, mode: "sandbox", legacy: "old-plain" };
const revealed = revealValues(stored, KEY);
ok(revealed.merchantId === "123" && revealed.mode === "sandbox", "plain fields are read as they are");
ok(revealed.merchantSecret === "merchant-secret-123", "a sealed field is opened for the server");
ok(revealed.legacy === "old-plain", "a legacy plain-text secret still works");
const noKey = revealValues(stored, null);
ok(noKey.merchantSecret === undefined, "without the key a sealed field is dropped (the service shows not set up)");
ok(noKey.merchantId === "123", "without the key plain fields still read");
ok(revealValues(undefined, KEY) && Object.keys(revealValues(undefined, KEY)).length === 0, "no values gives an empty object");

const sealedOnSave = sealSecrets({ merchantId: "123", merchantSecret: "new-secret", legacy: "old" }, ["merchantSecret", "legacy"], KEY);
ok(sealedOnSave.merchantId === "123", "a plain field is stored as it is");
ok(isSealed(sealedOnSave.merchantSecret) && isSealed(sealedOnSave.legacy), "every secret field is sealed when saved");
ok(openValue(sealedOnSave.merchantSecret, KEY) === "new-secret", "a saved secret opens to what was typed");
const alreadySealed = sealSecrets({ merchantSecret: sealed }, ["merchantSecret"], KEY);
ok(alreadySealed.merchantSecret === sealed, "a value already sealed is not sealed twice");
const emptySecret = sealSecrets({ merchantSecret: "" }, ["merchantSecret"], KEY);
ok(emptySecret.merchantSecret === "", "an empty secret is left empty");

let threw = false;
try { sealSecrets({ merchantSecret: "x" }, ["merchantSecret"], null); } catch (e) { threw = e instanceof SecretKeyMissingError; }
ok(threw, "saving a secret with no key is refused, never stored in plain text");
ok(sealSecrets({ merchantId: "1" }, ["merchantSecret"], null).merchantId === "1", "saving only plain fields needs no key");

ok(secretHint("abcdefgh") === "efgh", "the hint is the last four characters");
ok(secretHint("abcd") === "", "a short value gives no hint");

// Wiring: every server reader opens saved keys, the save route is owner-only and seals, and the page never writes keys itself.
const read = (p: string) => fs.readFileSync(p, "utf8");
for (const r of [
  "lib/leadApiAuth.ts", "lib/aiKey.ts", "lib/sms.ts", "app/api/invoices/public/route.ts", "app/api/royalty/send/route.ts",
  "app/api/integrations/test/route.ts", "app/api/payments/payhere/notify/route.ts", "app/api/payments/payhere/checkout/route.ts",
]) {
  ok(read(r).includes("revealedValues("), r + " opens saved keys before use");
}
const save = read("app/api/integrations/save/route.ts");
ok(save.includes('role !== "owner"'), "the save route is owner only");
ok(save.includes("sealSecrets(") && save.includes("SecretKeyMissingError"), "the save route seals secrets and refuses without a key");
const page = read("app/integrations/page.tsx");
ok(page.includes("/api/integrations/save"), "the page saves through the server route");
ok(!page.includes("setDoc("), "the page no longer writes keys to the database itself");
ok(read("lib/secretBox.ts").includes("SEALED_VALUE_PREFIX"), "the sealed prefix is shared with the page");
console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
