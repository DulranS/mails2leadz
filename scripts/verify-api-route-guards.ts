// Structural guard over every app/api/**/route.ts handler:
//   - each one authenticates (admin passcode or a signed-in business member),
//     EXCEPT the intentionally public POSTs below (trial request, feedback, the emailed-link endpoints, the demo opener);
//   - each public POST is rate limited and keeps its honeypot, because it writes a
//     document and emails the admin on every call (a loop would burn the email quota
//     the real new-trial alerts depend on).
// A new route that forgets to authenticate fails here instead of shipping open.
// Run: npx tsx scripts/verify-api-route-guards.ts
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}

const ROOT = join(__dirname, "..");
// The lead API (v176b): not a signed-in member and not public. Each call presents the business's lead API key, which must match the
// key saved on that business, and the lead API must be switched on. The route checks all three, compares in constant time, and rate limits.
const KEYED = new Set(["app/api/v1/businesses/[businessId]/leads/route.ts:POST", "app/api/v1/businesses/[businessId]/leads/route.ts:GET", "app/api/v1/businesses/[businessId]/leads/item/[leadId]/route.ts:GET", "app/api/v1/businesses/[businessId]/leads/item/[leadId]/route.ts:PATCH", "app/api/v1/businesses/[businessId]/invoices/item/[invoiceId]/route.ts:GET", "app/api/v1/businesses/[businessId]/reviews/route.ts:POST", "app/api/v1/businesses/[businessId]/orders/route.ts:POST", "app/api/v1/businesses/[businessId]/royalty/statement/route.ts:POST"]);
// The customer account page and the supplier order page (v177c). Unauthenticated, but each needs a signed link for its own purpose
// ("portal" or "supplier") that names one business and one customer or supplier, and each is rate limited. The supplier confirm route
// also rechecks that the order belongs to that supplier and is still open (lib/accountPortal.ts confirmOrderPlan).
const PORTAL_PUBLIC = new Set(["app/api/portal/route.ts:GET"]);
// Public read of a business's approved testimonials (v190): no sign-in; rate limited; the business must be open; only approved words go out.
const PUBLIC_READ = new Set(["app/api/public/testimonials/route.ts:GET"]);
const SUPPLIER_PUBLIC = new Set(["app/api/supplier/route.ts:GET", "app/api/supplier/confirm/route.ts:POST"]);
const PUBLIC_POSTS = new Set(["app/api/trial-requests/route.ts:POST", "app/api/feedback/route.ts:POST", "app/api/enquiry/route.ts:POST", "app/api/booking/route.ts:POST", "app/api/tickets/route.ts:POST"]);
// The one public GET: the emailed "choose your password" link. It is open by design (the
// customer has no session yet) but it must verify its signed token and be rate limited.
const PUBLIC_LINKS = new Set(["app/api/start/route.ts:GET"]);
// The public POST behind the emailed "confirm your email" link: open by design (the visitor has no
// session), so it must verify its signed token, be rate limited, and verify BEFORE touching data.
const PUBLIC_VERIFY = new Set(["app/api/trial-requests/verify/route.ts:POST"]);
// The public POST behind "Try it now": open by design (a visitor has no account), takes no input,
// and mints a sign-in token only for the verified Demo sandbox — so it must be rate limited, and it
// must not read a business id from the request.
const PUBLIC_DEMO = new Set(["app/api/demo/session/route.ts:POST"]);
// The customer's side of a quote (app/api/quotes/public): open to anyone holding the signed quote link. Each handler must
// rate limit and verify that signed link before it reads or writes anything. Nothing else is accepted through it.
const PUBLIC_QUOTE = new Set(["app/api/quotes/public/route.ts:GET", "app/api/quotes/public/route.ts:POST"]);
// The customer side of one invoice (app/api/invoices/public): the signed invoice link only. GET shows it; POST files a payment claim.
const PUBLIC_INVOICE = new Set(["app/api/invoices/public/route.ts:GET", "app/api/invoices/public/route.ts:POST", "app/api/payments/payhere/checkout/route.ts:POST"]);
// PayHere's server-to-server notice: no visitor, so it is trusted only through its signature. It must check the md5sig and the business.
const PUBLIC_PAYMENT_NOTIFY = new Set(["app/api/payments/payhere/notify/route.ts:POST"]);
// The website enquiry form (app/api/enquiry): open by design. The GET is throttled; the POST is the intake and keeps its honeypot.
const PUBLIC_ENQUIRY_GET = new Set(["app/api/enquiry/route.ts:GET", "app/api/booking/route.ts:GET", "app/api/tickets/route.ts:GET"]);
// The unsubscribe link at the foot of a marketing email: open to the holder of the signed link, which grants one thing (switching that
// customer's offers off). It must be rate limited and verify the token before it reads or writes anything.
const PUBLIC_UNSUBSCRIBE = new Set(["app/api/unsubscribe/route.ts:POST"]);
// The till's routes (app/api/pos/[businessId]/...): no sign-in, but every request must carry the account's POS signature
// (HMAC over timestamp and body, lib/pos-ingest.ts). The signature must be verified before anything is written.
const POS_SIGNED = new Set(["app/api/pos/[businessId]/sales/route.ts:POST", "app/api/pos/[businessId]/reconcile/route.ts:POST"]);
const seenPosSigned = new Set<string>();
const AUTH = /requireAdminPasscode|requireAiContext|requireSignedIn|requireCronSecret|requireFeedOwner/;
// HMRC's OAuth return (app/api/hmrc/callback): the browser comes back from HMRC with no session. It is open only to a state value this
// server issued: the state must match, be looked up once in Firestore, be deleted before the code is exchanged, and be checked for expiry.
const PUBLIC_OAUTH = new Set(["app/api/hmrc/callback/route.ts:GET"]);
const seenOauth = new Set<string>();

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? routeFiles(p) : name === "route.ts" ? [p] : [];
  });
}

function handlers(src: string): { method: string; body: string }[] {
  const re = /export async function (GET|POST|PUT|PATCH|DELETE)\b/g;
  const marks = [...src.matchAll(re)].map((m) => ({ method: m[1], at: m.index! }));
  return marks.map((m, i) => ({ method: m.method, body: src.slice(m.at, marks[i + 1]?.at ?? src.length) }));
}

const files = routeFiles(join(ROOT, "app/api"));
assert(files.length >= 15, `scan is really reading the routes (${files.length} route files)`);
let total = 0;
const seenPublic = new Set<string>();
const seenLinks = new Set<string>();
const seenVerify = new Set<string>();
const seenDemo = new Set<string>();
const seenQuote = new Set<string>();
const seenKeyed = new Set<string>();
const seenLinked = new Set<string>();
const seenInvoice = new Set<string>();
const seenEnquiryGet = new Set<string>();

for (const file of files) {
  const rel = relative(ROOT, file).split("\\").join("/");
  const src = readFileSync(file, "utf8");
  for (const h of handlers(src)) {
    total++;
    const id = `${rel}:${h.method}`;
    if (PUBLIC_OAUTH.has(id)) {
      seenOauth.add(id);
      assert(/STATE_RE\.test\(state\)/.test(h.body), `${id} (HMRC return) checks the state format`);
      assert(h.body.indexOf("stateRef.delete()") > 0 && h.body.indexOf("stateRef.delete()") < h.body.indexOf("exchangeCode("), `${id} (HMRC return) uses the state once, before the code exchange`);
      assert(/st\.expiresAt < Date\.now\(\)/.test(h.body), `${id} (HMRC return) refuses an expired state`);
    } else if (PUBLIC_LINKS.has(id)) {
      seenLinks.add(id);
      assert(/verifyLinkToken\(/.test(h.body), `${id} (public link) verifies its signed token`);
      assert(/isRateLimited\(/.test(h.body), `${id} (public link) is rate limited`);
      assert(h.body.indexOf("verifyLinkToken(") < h.body.indexOf("createPasswordSetLink("), `${id} checks the token before asking Firebase for a link`);
    } else if (PUBLIC_VERIFY.has(id)) {
      seenVerify.add(id);
      assert(/verifyLinkToken\(/.test(h.body), `${id} (public confirm) verifies its signed token`);
      assert(/isRateLimited\(/.test(h.body), `${id} (public confirm) is rate limited`);
      assert(h.body.indexOf("isRateLimited(") < h.body.indexOf("verifyLinkToken("), `${id} rate limits before checking the token`);
      assert(h.body.indexOf("verifyLinkToken(") < h.body.indexOf("runTransaction("), `${id} checks the token before reading or claiming any data`);
    } else if (PUBLIC_DEMO.has(id)) {
      seenDemo.add(id);
      assert(/isRateLimited\(/.test(h.body), `${id} (public demo) is rate limited`);
      assert(/openDemoSession\(/.test(h.body), `${id} (public demo) goes through the verified demo opener`);
      assert(!/req\.json\(|searchParams|businessId/.test(h.body), `${id} (public demo) reads no business id or body from the request`);
    } else if (PUBLIC_READ.has(id)) {
      seenLinked.add(id);
      const src = readFileSync(join(ROOT, id.split(":")[0]), "utf8");
      assert(/isRateLimited\(/.test(src), `${id} (public read) is rate limited`);
      assert(/openBusinessAdmin\(/.test(src), `${id} (public read) checks the business is open`);
    } else if (PORTAL_PUBLIC.has(id) || SUPPLIER_PUBLIC.has(id)) {
      seenLinked.add(id);
      const src = readFileSync(join(ROOT, id.split(":")[0]), "utf8");
      assert(/isRateLimited\(/.test(src), `${id} (signed link) is rate limited`);
      assert(/verifyLinkToken\(/.test(src), `${id} (signed link) checks its link`);
      if (SUPPLIER_PUBLIC.has(id)) assert(/verifyLinkToken\([\s\S]*?"supplier"\)/.test(src), `${id} checks the supplier link purpose`);
      else assert(/verifyLinkToken\([\s\S]*?"portal"\)/.test(src), `${id} checks the account link purpose`);
    } else if (KEYED.has(id)) {
      seenKeyed.add(id);
      // The lead API shares one authorise() helper between its GET and POST, so these checks read the whole route file.
      // The key check lives in one shared module (lib/leadApiAuth.ts), used by every keyed route.
      const src = readFileSync(join(ROOT, id.split(":")[0]), "utf8") + readFileSync(join(ROOT, "lib/leadApiAuth.ts"), "utf8");
      assert(/isRateLimited\(/.test(src), `${id} (lead API) is rate limited`);
      assert(/timingSafeEqual\(/.test(src), `${id} (lead API) compares the key in constant time`);
      assert(/saved\?\.enabled/.test(src) && /openBusinessAdmin\(/.test(src), `${id} (lead API) needs the switch on and an open business`);
    } else if (PUBLIC_QUOTE.has(id)) {
      seenQuote.add(id);
      assert(/isRateLimited\(/.test(h.body), `${id} (customer quote) is rate limited`);
      assert(/verifyLinkToken\(\s*\w+,\s*"quote"\s*\)/.test(h.body), `${id} (customer quote) verifies its signed quote link before reading data`);
    } else if (PUBLIC_PAYMENT_NOTIFY.has(id)) {
      assert(/payhereNoticeIsPaid\(/.test(h.body), `${id} (payment notice) checks the PayHere signature before recording anything`);
      assert(/isValidBusinessId\(/.test(h.body), `${id} (payment notice) checks the business id`);
    } else if (PUBLIC_INVOICE.has(id)) {
      seenInvoice.add(id);
      assert(/isRateLimited\(/.test(h.body), `${id} (customer invoice) is rate limited`);
      assert(/verifyLinkToken\(\s*\w+,\s*"invoice"\s*\)/.test(h.body), `${id} (customer invoice) verifies its signed invoice link before reading data`);
    } else if (PUBLIC_UNSUBSCRIBE.has(id)) {
      assert(/isRateLimited\(/.test(h.body), `${id} (unsubscribe) is rate limited`);
      assert(/verifyLinkToken\(\s*\w+,\s*"unsubscribe"\s*\)/.test(h.body), `${id} (unsubscribe) verifies its signed link`);
      assert(h.body.indexOf("verifyLinkToken(") < h.body.indexOf("getAdminDb("), `${id} checks the link before touching any data`);
    } else if (PUBLIC_ENQUIRY_GET.has(id)) {
      seenEnquiryGet.add(id);
      assert(/isRateLimited\(/.test(h.body), `${id} (enquiry form) is rate limited`);
    } else if (PUBLIC_POSTS.has(id)) {
      seenPublic.add(id);
      assert(/isRateLimited\(/.test(h.body), `${id} (public) is rate limited`);
      assert(/body\?\.website/.test(h.body), `${id} (public) keeps its honeypot check`);
    } else if (POS_SIGNED.has(id)) {
      seenPosSigned.add(id);
      assert(/verifyPosSignature\(/.test(h.body), `${id} verifies the POS signature`);
      const firstWrite = h.body.search(/\.set\(|\.update\(|batch\.commit\(/);
      assert(firstWrite === -1 || h.body.indexOf("verifyPosSignature(") < firstWrite, `${id} verifies the signature before writing`);
    } else {
      assert(AUTH.test(h.body), `${id} authenticates`);
    }
  }
}
assert(total >= 20, `checked ${total} handlers`);
for (const id of PUBLIC_POSTS) assert(seenPublic.has(id), `${id} still exists (allow-list is not stale)`);
for (const id of PUBLIC_LINKS) assert(seenLinks.has(id), `${id} still exists (allow-list is not stale)`);
for (const id of PUBLIC_VERIFY) assert(seenVerify.has(id), `${id} still exists (allow-list is not stale)`);
for (const id of PUBLIC_DEMO) assert(seenDemo.has(id), `${id} still exists (allow-list is not stale)`);
for (const id of KEYED) assert(seenKeyed.has(id), `${id} still exists (allow-list is not stale)`);
for (const id of [...PORTAL_PUBLIC, ...SUPPLIER_PUBLIC, ...PUBLIC_READ]) assert(seenLinked.has(id), `${id} still exists (allow-list is not stale)`);
for (const id of PUBLIC_OAUTH) assert(seenOauth.has(id), `${id} still exists (allow-list is not stale)`);
for (const id of POS_SIGNED) assert(seenPosSigned.has(id), `${id} still exists (allow-list is not stale)`);

if (process.exitCode !== 1) console.log("\nALL CHECKS PASSED");
