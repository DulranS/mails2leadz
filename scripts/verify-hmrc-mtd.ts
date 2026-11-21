// Making Tax Digital for Income Tax, quarterly updates (v319): the settings and "not configured" state, the sign-in address, the quarters,
// the books' figures, the update builder, the NINO and business ID checks, the refusal order, the fraud-prevention headers, the token and
// submit calls with a mocked fetch (nothing reaches HMRC), and the wiring of the routes and the card. Run: npx tsx scripts/verify-hmrc-mtd.ts
import fs from "node:fs";
import path from "node:path";
import {
  hmrcSettings, authorizeUrl, taxYearLabel, quarterPeriods, quarterFigures, buildQuarterlyUpdate, normaliseNino, normaliseBusinessId, submitRefusal, govHeaders, HMRC_SANDBOX_API,
} from "../lib/hmrcMtd";
import { exchangeCode, refreshTokens, usableTokens, submitQuarterlyUpdate, HmrcError, type FetchImpl } from "../lib/hmrcClient";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

const KEYS = { HMRC_CLIENT_ID: "cid-111", HMRC_CLIENT_SECRET: "csec-SECRET-999", HMRC_REDIRECT_URI: "https://app.example/api/hmrc/callback" };
const none = hmrcSettings({});
ok(none.configured === false && none.missing.includes("HMRC_CLIENT_ID") && none.missing.includes("HMRC_CLIENT_SECRET") && none.missing.includes("HMRC_REDIRECT_URI"), "no keys: not configured, and the missing settings are named");
ok(none.apiBase === HMRC_SANDBOX_API && none.submitEnabled === false, "no keys: the sandbox is the default, and sending is off");
ok(hmrcSettings({ ...KEYS, HMRC_API_BASE: "not a url" }).missing.includes("HMRC_API_BASE"), "a bad API address is named");
ok(hmrcSettings({ ...KEYS }).configured === true, "all keys set: configured");
ok(hmrcSettings({ ...KEYS, HMRC_SUBMIT_ENABLED: "true" }).submitEnabled === true && hmrcSettings({ ...KEYS, HMRC_SUBMIT_ENABLED: "yes" }).submitEnabled === false, "only the word true switches sending on");
ok(hmrcSettings({ ...KEYS, HMRC_API_BASE: "https://api.example/" }).apiBase === "https://api.example", "a custom API address is used, without a trailing slash");

const url = authorizeUrl({ authBase: "https://auth.example", clientId: "cid-111", redirectUri: "https://app.example/api/hmrc/callback", state: "st123" });
ok(url.startsWith("https://auth.example/oauth/authorize?") && url.includes("client_id=cid-111") && url.includes("state=st123") && url.includes("redirect_uri=https%3A%2F%2Fapp.example%2Fapi%2Fhmrc%2Fcallback"), "the sign-in address has the client, state and encoded redirect");
ok(url.includes("response_type=code") && url.includes("scope=read%3Aself-assessment+write%3Aself-assessment"), "the sign-in asks for the code and the self-assessment scopes");
ok(!url.includes("CSEC") && !url.includes("csec-SECRET"), "the client secret is never in the sign-in address");

ok(taxYearLabel(2026) === "2026-27" && taxYearLabel(2099) === "2099-00", "the tax year label is the start year and the next year's last two digits");
const qs = quarterPeriods(2026);
ok(qs.length === 4 && qs[0].from === "2026-04-06" && qs[0].to === "2026-07-05", "quarter 1 runs 6 April to 5 July");
ok(qs[2].from === "2026-10-06" && qs[2].to === "2027-01-05", "quarter 3 crosses the new year");
ok(qs[3].to === "2027-04-05", "quarter 4 ends on 5 April of the next year");

const q1 = qs[0];
const figs = quarterFigures(q1, [
  { date: "2026-04-06", qty: 2, unitPrice: 100 },
  { date: "2026-07-05", qty: 1, unitPrice: 50 },
  { date: "2026-07-06", qty: 9, unitPrice: 999 },
  { date: "2026-04-05", qty: 9, unitPrice: 999 },
], [
  { startDate: "2026-05-01", amount: 40 },
  { startDate: "2026-05-02", amount: 500, isRecurring: true },
  { startDate: "2026-08-01", amount: 700 },
]);
ok(figs.turnover === 250 && figs.salesCount === 2, "turnover is quantity times unit price for the sales in the quarter, edges included");
ok(figs.expenses === 40 && figs.expenseCount === 1, "expenses are the one-off costs in the quarter; recurring and later ones are left out");

const built = buildQuarterlyUpdate({ from: "2026-04-06", to: "2026-07-05", turnover: 1234.567, expenses: 88 });
ok("body" in built && built.body.periodDates.periodStartDate === "2026-04-06" && built.body.periodDates.periodEndDate === "2026-07-05", "the body carries the period dates");
ok("body" in built && built.body.periodIncome.turnover === 1234.57 && built.body.periodExpenses.consolidatedExpenses === 88, "the body carries the figures, rounded to pence");
ok("error" in buildQuarterlyUpdate({ from: "2026-07-05", to: "2026-04-06", turnover: 1, expenses: 1 }), "a period that ends before it starts is refused");
ok("error" in buildQuarterlyUpdate({ from: "2026-04-06", to: "2026-07-05", turnover: -1, expenses: 0 }), "a negative turnover is refused");
ok("error" in buildQuarterlyUpdate({ from: "2026-04-06", to: "2026-07-05", turnover: NaN, expenses: 0 }), "a non-number is refused");

ok(normaliseNino("ab 12 34 56 c") === "AB123456C", "a NINO is accepted with spaces and lower case");
ok(normaliseNino("QQ123456C") === null && normaliseNino("AB123456E") === null && normaliseNino("AB12345") === null, "a NINO with a barred first letter, a bad last letter or too few digits is refused");
ok(normaliseBusinessId("xais12345678910") === "XAIS12345678910" && normaliseBusinessId("XAIS1234") === null, "a business ID is checked for its shape");

ok(submitRefusal({ submitEnabled: false, confirmed: true, connected: true, hasBusiness: true })?.includes("HMRC_SUBMIT_ENABLED") === true, "the server switch is checked first");
ok(submitRefusal({ submitEnabled: true, confirmed: false, connected: true, hasBusiness: true })?.includes("Confirm") === true, "no confirmation is refused");
ok(submitRefusal({ submitEnabled: true, confirmed: true, connected: false, hasBusiness: true })?.includes("Connect") === true, "not connected is refused");
ok(submitRefusal({ submitEnabled: true, confirmed: true, connected: true, hasBusiness: false })?.includes("National Insurance") === true, "no NINO or business ID is refused");
ok(submitRefusal({ submitEnabled: true, confirmed: true, connected: true, hasBusiness: true }) === null, "every check passed: not refused");

const gh = govHeaders({ appVersion: "319", userId: "uid 1" });
ok(gh["Gov-Vendor-Product-Name"] === "Balancr" && gh["Gov-Vendor-Version"] === "balancr=319" && gh["Gov-Client-User-IDs"] === "balancr=uid%201", "the vendor and user headers are set from what the server knows");
ok(Object.values(gh).every((v) => typeof v === "string" && v.length > 0), "no fraud-prevention header is set to an empty or missing value");

// calls, with a mocked fetch
type Call = { url: string; init: RequestInit };
function mock(respond: (c: Call) => Response): { f: FetchImpl; calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => { const c = { url: String(url), init }; calls.push(c); return respond(c); }) as unknown as FetchImpl;
  return { f, calls };
}
const s = hmrcSettings({ ...KEYS, HMRC_AUTH_BASE: "https://auth.example", HMRC_API_BASE: "https://api.example", HMRC_SUBMIT_ENABLED: "true" });

async function run() {
  const now = 1_700_000_000_000;
  const tokOk = mock(() => new Response(JSON.stringify({ access_token: "ACC-1", refresh_token: "REF-1", expires_in: 14400 }), { status: 200 }));
  const t = await exchangeCode(s, "code-xyz", tokOk.f, now);
  ok(t.accessToken === "ACC-1" && t.refreshToken === "REF-1" && t.expiresAt === now + 14400 * 1000, "the code is exchanged for tokens, with an expiry time");
  const body = String(tokOk.calls[0].init.body);
  ok(tokOk.calls[0].url === "https://auth.example/oauth/token" && body.includes("grant_type=authorization_code") && body.includes("code=code-xyz"), "the exchange posts the code to the token address");
  ok(!tokOk.calls[0].url.includes("csec") && body.includes("client_secret=csec-SECRET-999"), "the secret goes in the body, never in the address");

  const tokBad = mock(() => new Response(JSON.stringify({ code: "INVALID_GRANT", message: "ACC-1 REF-1 csec-SECRET-999" }), { status: 400 }));
  let e1: unknown = null;
  try { await exchangeCode(s, "bad", tokBad.f, now); } catch (e) { e1 = e; }
  ok(e1 instanceof HmrcError && (e1 as HmrcError).code === "INVALID_GRANT" && !(e1 as Error).message.includes("csec") && !(e1 as Error).message.includes("ACC-1"), "a refused code is a plain error with HMRC's code, and no secret or token in it");

  const stored = { accessToken: "OLD", refreshToken: "REF-OLD", expiresAt: now + 3600_000 };
  const fresh = mock(() => new Response("{}", { status: 500 }));
  const u1 = await usableTokens(s, stored, fresh.f, now);
  ok(u1.refreshed === false && fresh.calls.length === 0, "a token that is still valid is used as it is, with no call");
  const expired = { accessToken: "OLD", refreshToken: "REF-OLD", expiresAt: now + 30_000 };
  const refreshCall = mock(() => new Response(JSON.stringify({ access_token: "NEW", refresh_token: "REF-NEW", expires_in: 14400 }), { status: 200 }));
  const u2 = await usableTokens(s, expired, refreshCall.f, now);
  ok(u2.refreshed === true && u2.tokens.accessToken === "NEW" && String(refreshCall.calls[0].init.body).includes("grant_type=refresh_token"), "a token within a minute of expiry is refreshed first");

  const subOk = mock(() => new Response("{}", { status: 200 }));
  const headers = govHeaders({ appVersion: "319", userId: "u1" });
  const r = await submitQuarterlyUpdate(s, { accessToken: "ACC-1", nino: "AB123456C", businessId: "XAIS12345678910", taxYear: "2026-27", from: "2026-04-06", to: "2026-07-05", turnover: 250, expenses: 40, headers }, subOk.f);
  ok(r.status === 200 && subOk.calls.length === 1, "a valid quarter is sent once");
  const c = subOk.calls[0];
  const h = c.init.headers as Record<string, string>;
  ok(c.url === "https://api.example/individuals/business/self-employment/AB123456C/XAIS12345678910/periods?taxYear=2026-27", "the period goes to the business's address for that tax year");
  ok(h.Authorization === "Bearer ACC-1" && h.Accept === "application/vnd.hmrc.1.0+json" && h["Gov-Vendor-Product-Name"] === "Balancr", "the request has the token, the accept version and the fraud-prevention headers");
  ok(JSON.parse(String(c.init.body)).periodIncome.turnover === 250, "the body is the built quarter");

  const subBad = mock(() => new Response(JSON.stringify({ code: "FORBIDDEN_ACCESS" }), { status: 403 }));
  let e2: unknown = null;
  try { await submitQuarterlyUpdate(s, { accessToken: "ACC-1", nino: "AB123456C", businessId: "XAIS12345678910", taxYear: "2026-27", from: "2026-04-06", to: "2026-07-05", turnover: 1, expenses: 1, headers }, subBad.f); } catch (err) { e2 = err; }
  ok(e2 instanceof HmrcError && (e2 as HmrcError).status === 403 && (e2 as Error).message.includes("FORBIDDEN_ACCESS") && !(e2 as Error).message.includes("ACC-1"), "a refused quarter says why by HMRC's code, and shows no token");

  const subNone = mock(() => new Response("{}", { status: 200 }));
  let e3: unknown = null;
  try { await submitQuarterlyUpdate(s, { accessToken: "ACC-1", nino: "AB123456C", businessId: "XAIS12345678910", taxYear: "2026-27", from: "2026-07-05", to: "2026-04-06", turnover: 1, expenses: 1, headers }, subNone.f); } catch (err) { e3 = err; }
  ok(e3 instanceof HmrcError && subNone.calls.length === 0, "a bad period is refused before any call is made");

  // the routes: the switch is checked before anything else, the state is used once, every route is owner only
  const root = path.resolve(process.cwd());
  const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
  const quarter = read("app/api/hmrc/quarter/route.ts");
  const swIdx = quarter.indexOf("if (!s.submitEnabled)");
  ok(swIdx > 0 && swIdx < quarter.indexOf("usableTokens(") && swIdx < quarter.indexOf("submitQuarterlyUpdate(") && swIdx < quarter.indexOf("quarterFromBooks(ctx.db, ctx.businessId, q);\n    const usable"), "the quarter route checks the switch before it reads tokens, reads the books, or calls HMRC");
  ok(quarter.includes("submitRefusal(") && quarter.includes("confirmed: body.confirmed === true"), "the quarter route needs the owner's confirmation");
  const cb = read("app/api/hmrc/callback/route.ts");
  ok(cb.indexOf("stateRef.delete()") > 0 && cb.indexOf("stateRef.delete()") < cb.indexOf("exchangeCode(") && cb.includes("st.expiresAt < Date.now()"), "the sign-in state is deleted before the exchange, and an expired one is refused");
  for (const f of ["status", "profile", "connect", "disconnect", "quarter"]) {
    ok(read(`app/api/hmrc/${f}/route.ts`).includes("requireFeedOwner"), `app/api/hmrc/${f} is owner only`);
  }
  for (const f of ["status", "profile", "connect", "callback", "disconnect", "quarter"]) {
    const src = read(`app/api/hmrc/${f}/route.ts`);
    ok(!/console\.\w+\([^)]*(SECRET|secret|TOKEN|token|nino)/.test(src) && !/Response\.json\([^)]*(accessToken|refreshToken|ninoSealed)/.test(src), `app/api/hmrc/${f} never returns or logs a token, secret or NINO`);
  }
  const card = read("components/HmrcCard.tsx");
  ok(card.includes("I confirm these figures") && card.includes("Not configured") && card.includes("Sending is switched off"), "the card asks for confirmation, says Not configured, and says when sending is off");
  ok(read("app/integrations/page.tsx").includes("HmrcCard"), "the HMRC card is on the Integrations page");

  console.log(`${checks - fails}/${checks} checks passed`);
  if (fails) { console.error(`${fails} failed`); process.exit(1); }
}

run();
