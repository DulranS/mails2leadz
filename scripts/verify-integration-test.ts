// "Test connection" for saved service keys (lib/integrationTest.ts, app/api/integrations/test, the Integrations page).
// Hand-worked cases for the request and the result, then the wiring. Nothing here calls a real service.
// Run: /home/claude/.npm-global/bin/tsx scripts/verify-integration-test.ts
import fs from "node:fs";
import { INTEGRATION_PROVIDERS, integrationFor } from "../lib/integrations";
import { checkRequestFor, interpretCheck, isCheckable } from "../lib/integrationTest";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const provider = (id: string) => integrationFor(id)!;

// ---- which services can be tested --------------------------------------------------------------------------------------
ok(isCheckable("email") && !isCheckable("card_payments"), "email can be tested; a service that is no longer offered cannot");
ok(!isCheckable("sms") && !isCheckable("whatsapp") && !isCheckable("nope"), "a service with no read-only check, or an unknown one, cannot be tested");
ok(INTEGRATION_PROVIDERS.filter((p) => isCheckable(p.id)).length === 1 && isCheckable("email"), "the one read-only check is email's, the only checkable service still offered");

// ---- the request ---------------------------------------------------------------------------------------------------------
const email = checkRequestFor(provider("email"), { fromAddress: "billing@shop.lk", apiKey: "re_test_123" });
ok(!!email && email.url === "https://api.resend.com/domains", "email: lists the sending domains, which sends nothing");
ok(!!email && email.headers.Authorization === "Bearer re_test_123", "email: the key goes in the Authorization header");
ok(!!email && !email.url.includes("re_test_123"), "the key never appears in the URL");

const resend = checkRequestFor(provider("email"), { fromAddress: "billing@shop.lk", apiKey: "re_test_abc" });
ok(!!resend && resend.url === "https://api.resend.com/domains", "email: lists the sending domains, which changes nothing");
ok(!!resend && resend.headers.Authorization === "Bearer re_test_abc", "email: the key is sent in the header");

// A required key missing, or only spaces, means no request is made.
ok(checkRequestFor(provider("email"), { fromAddress: "billing@shop.lk" }) === null, "email with no key: no request");
ok(checkRequestFor(provider("email"), { fromAddress: "billing@shop.lk", apiKey: "   " }) === null, "a key that is only spaces counts as missing");
ok(checkRequestFor(provider("sms"), { userId: "1", apiKey: "x", senderId: "Shop" }) === null, "a service with no check: no request");

// ---- the result --------------------------------------------------------------------------------------------------------
ok(interpretCheck(200).ok === true && interpretCheck(200).message === "Connected. The key works.", "200 is connected");
ok(interpretCheck(204).ok === true, "any 2xx is connected");
ok(interpretCheck(401).ok === false && interpretCheck(401).message.includes("rejected"), "401 says the key was rejected");
ok(interpretCheck(403).ok === false && interpretCheck(403).message.includes("rejected"), "403 says the key was rejected");
ok(interpretCheck(429).message.includes("busy"), "429 says the service is busy, not that the key is wrong");
ok(interpretCheck(503).message.includes("problem"), "5xx says the service had a problem, not that the key is wrong");
ok(interpretCheck(404).message === "The service answered with an error (404). Check the keys and test again.", "any other status is reported with its number");
ok(interpretCheck(null).ok === false && interpretCheck(null).message.includes("Couldn't reach"), "no answer (offline or timed out) says it could not reach the service");

// ---- wiring --------------------------------------------------------------------------------------------------------------
const route = fs.readFileSync("app/api/integrations/test/route.ts", "utf8");
ok(route.includes('role !== "owner"'), "the route is owner only");
ok(route.includes('accountKind === "public_demo"'), "the route is blocked in the public demo");
ok(route.includes("isRateLimited(\"integration-test\""), "the route is rate limited per business");
ok(route.includes("ref.set({ lastTest: { ok: outcome.ok, message: outcome.message, at } }, { merge: true })"), "the result is stored on the service record, merged, with the keys left alone");
ok(route.includes("Response.json({ ok: outcome.ok, message: outcome.message, at })"), "the response carries only the result, never the keys");
ok(route.includes("AbortSignal.timeout(TIMEOUT_MS)"), "the outside call has a timeout");
const page = fs.readFileSync("app/integrations/page.tsx", "utf8");
ok(page.includes('"/api/integrations/test"') && page.includes("Test connection") && page.includes("[BUSINESS_ID_HEADER]: businessId"), "the page has a Test connection button that sends the business header");
ok(page.includes("isCheckable(provider.id) && ("), "the button shows only for services that can be tested");
ok(fs.readFileSync("lib/integrations.ts", "utf8").includes("lastTest?: { ok: boolean; message: string; at: number }"), "the saved record has room for the last test result");

console.log(fails === 0 ? `OK: ${checks} checks passed` : `${fails} of ${checks} checks FAILED`);
process.exit(fails === 0 ? 0 : 1);
