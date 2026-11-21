// AutoLeads event sender (v319, lib/autoleads-events.ts): a published HMAC vector, the signature over timestamp and body, the body shape,
// the skip when no AutoLeads user is saved, the 5 second timeout, and that a failed send never throws. fetch is mocked; nothing is sent.
// Also checks that the payment route and the client call are wired. Run: npx tsx scripts/verify-autoleads-events.ts
import fs from "node:fs";
import path from "node:path";
import { buildEvent, eventSkipReason, hmacSha256Hex, sign, sendAutoLeadsEvent, AUTOLEADS_EVENT_TIMEOUT_MS, type AutoLeadsEvent } from "../lib/autoleads-events";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

// The published HMAC-SHA256 vector: key "key", message "The quick brown fox jumps over the lazy dog".
ok(hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog") === "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8", "HMAC-SHA256 matches the published vector");
// The signature a receiver must reproduce: key "s3cret", over "1700000000000." + the body.
const BODY = '{"a":1}';
ok(sign(1700000000000, BODY, "s3cret") === "8a6f992378d0d47b6fcdf1cc8d72e46ba5c789b2c9d3a538be31fe07d598ba6d", "the signature is HMAC over `${timestamp}.${body}` with the secret");
ok(sign(1700000000001, BODY, "s3cret") !== sign(1700000000000, BODY, "s3cret"), "a different timestamp gives a different signature");

const input = { businessId: "biz1", ownerUid: "al-user-7", invoiceId: "INV-0042", customerEmail: "pat@example.com", amount: 1234.5, currency: "GBP", paidOn: "2026-11-18", occurredAt: 1700000000000 };
const ev = buildEvent(input);
ok(ev.id === "INV-0042:paid" && ev.type === "invoice.paid", "the id is <invoiceId>:paid and the type is invoice.paid");
ok(ev.businessId === "biz1" && ev.ownerUid === "al-user-7", "the business and the AutoLeads owner are on the event");
ok(ev.occurredAt === "2023-11-14T22:13:20.000Z", "occurredAt is ISO, from the given time");
ok(JSON.stringify(Object.keys(ev.data)) === JSON.stringify(["invoiceNumber", "customerEmail", "amount", "currency", "paidOn"]), "data holds exactly the five fields, in order");
ok(ev.data.invoiceNumber === "INV-0042" && ev.data.amount === 1234.5 && ev.data.currency === "GBP" && ev.data.paidOn === "2026-11-18", "the data values are the invoice's");
ok(buildEvent({ ...input, customerEmail: null, amount: 10.005 }).data.customerEmail === null, "no customer email is sent as null");
ok(buildEvent({ ...input, amount: 10.005 }).data.amount === 10.01, "the amount is rounded to cents");

// the skip: no AutoLeads user saved, and the missing server settings
const good = { url: "https://autoleads.example/api/balancr-events", secret: "s3cret" };
ok(eventSkipReason({ ownerUid: null, ...good }) !== null, "no AutoLeads user saved: skipped");
ok(eventSkipReason({ ownerUid: "   ", ...good }) !== null, "a blank AutoLeads user is skipped too");
ok(eventSkipReason({ ownerUid: "al-user-7", url: undefined, secret: "s3cret" })?.includes("AUTOLEADS_EVENTS_URL") === true, "no URL is named in the skip reason");
ok(eventSkipReason({ ownerUid: "al-user-7", url: "https://a.example", secret: undefined })?.includes("BALANCR_EVENT_SECRET") === true, "no secret is named in the skip reason");
ok(eventSkipReason({ ownerUid: "al-user-7", url: "not a url", secret: "s" }) !== null, "a bad URL is skipped");
ok(eventSkipReason({ ownerUid: "al-user-7", url: "ftp://a.example", secret: "s" }) !== null, "a non-web URL is skipped");
ok(eventSkipReason({ ownerUid: "al-user-7", ...good }) === null, "everything present: not skipped");

// the send, with a mocked fetch
type Call = { url: string; init: RequestInit };
function mockFetch(respond: (c: Call) => Response | Promise<Response>): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const c = { url: String(url), init };
    calls.push(c);
    return respond(c);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

async function run() {
  const m1 = mockFetch(() => new Response("{}", { status: 200 }));
  const r1 = await sendAutoLeadsEvent(ev, { ...good, now: 1700000000000, fetchImpl: m1.fetchImpl });
  ok(r1.sent === true && r1.status === 200, "a 200 from AutoLeads counts as sent");
  const c = m1.calls[0];
  const headers = c.init.headers as Record<string, string>;
  ok(c.url === good.url && c.init.method === "POST", "POST to the configured events address");
  ok(headers["Content-Type"] === "application/json", "Content-Type is application/json");
  ok(headers["X-Balancr-Timestamp"] === "1700000000000", "the timestamp header is milliseconds since the epoch");
  const body = String(c.init.body);
  ok(headers["X-Balancr-Signature"] === sign(1700000000000, body, "s3cret"), "the signature is over the exact body sent");
  ok(JSON.parse(body).id === "INV-0042:paid", "the body is the event as JSON");
  ok(!body.includes("s3cret") && !headers["X-Balancr-Signature"].includes("s3cret"), "the secret is not in the body or the headers");
  ok(c.init.signal !== undefined && c.init.signal !== null, "the request has a timeout signal");
  ok(AUTOLEADS_EVENT_TIMEOUT_MS === 5000, "the timeout is 5 seconds");

  // a failed send (non-2xx): sent false, reason given, no throw
  const m2 = mockFetch(() => new Response("nope", { status: 500 }));
  const r2 = await sendAutoLeadsEvent(ev, { ...good, now: 1, fetchImpl: m2.fetchImpl });
  ok(r2.sent === false && r2.status === 500 && r2.reason?.includes("500") === true, "a 500 is a failed send with a reason, not a throw");

  // a network failure: no throw
  const m3 = mockFetch(() => { throw new TypeError("fetch failed"); });
  let threw = false;
  let r3: Awaited<ReturnType<typeof sendAutoLeadsEvent>> | null = null;
  try { r3 = await sendAutoLeadsEvent(ev, { ...good, now: 1, fetchImpl: m3.fetchImpl }); } catch { threw = true; }
  ok(!threw && r3 !== null && r3.sent === false && r3.status === null, "a network failure never throws; it comes back as not sent");

  // a timeout: an abort error, no throw, reason mentions 5 seconds
  const m4 = mockFetch(() => { const e = new Error("timed out"); e.name = "TimeoutError"; throw e; });
  const r4 = await sendAutoLeadsEvent(ev, { ...good, now: 1, fetchImpl: m4.fetchImpl });
  ok(r4.sent === false && (r4.reason ?? "").includes("5 seconds"), "a timeout is reported as not answered within 5 seconds");

  // the route and the client are wired, and the route never returns or logs the secret
  const root = path.resolve(process.cwd());
  const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
  const route = read("app/api/autoleads/invoice-paid/route.ts");
  ok(route.includes("eventSkipReason") && route.includes("sendAutoLeadsEvent") && route.includes("logSync"), "the route checks the skip, sends, and logs the outcome");
  ok(route.includes('"not fully paid"') && route.includes('"paid"'), "the route sends only for a fully paid invoice");
  ok(!/Response\.json\([^)]*secret/.test(route) && !/console\.\w+\([^)]*secret/.test(route), "the route never returns or logs the secret");
  ok(read("contexts/DataContext.tsx").includes("postAutoLeadsPayment(user, businessId, ref.id)"), "the payment is sent to AutoLeads from addReceivablePayment");
  ok(read("lib/integrations.ts").includes('id: "autoleads"'), "the AutoLeads user is a saved integration setting");

  console.log(`${checks - fails}/${checks} checks passed`);
  if (fails) { console.error(`${fails} failed`); process.exit(1); }
}

run();
