// SMS reminders (lib/sms.ts): phone clean-up, message text and length, the send call, and how the daily job uses it.
// Run: npx tsx scripts/verify-sms.ts
import fs from "node:fs";
import { isSmsConfigured, plainSmsText, sendSms, smsReminderText, sriLankaMobile, SMS_MAX_CHARS } from "../lib/sms";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) { checks++; if (!cond) { fails++; console.error("FAIL:", msg); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

// ---- phone numbers ----
const phones: [string | undefined | null, string | null][] = [
  ["0771234567", "94771234567"], ["077 123 4567", "94771234567"], ["+94 77 123 4567", "94771234567"], ["94771234567", "94771234567"],
  ["771234567", "94771234567"], ["0094771234567", "94771234567"], ["077-123-4567", "94771234567"],
  ["kasun@x.lk 071-234-5678", "94712345678"], ["0711234567, kasun@x.lk", "94711234567"],
  ["011 234 5678 / 077 123 4567", "94771234567"], ["0771234567 0112345678", "94771234567"],
  ["0112345678", null], ["081 223 4455", null], ["0791234567", null], ["12345", null], ["", null], [undefined, null], [null, null], ["abc@x.lk", null], ["no number here", null],
];
for (const [input, want] of phones) ok(sriLankaMobile(input) === want, `phone ${JSON.stringify(input)} -> ${want}`);

// ---- text ----
ok(plainSmsText("Café – “quoted” 'text'") === 'Caf? - "quoted" \'text\'', "non-ASCII is made safe for a plain text message");
const full = smsReminderText({ businessName: "Lanka Traders", ref: "INV-0042", currency: "LKR", balance: 12500, dueDate: "2026-10-15", link: "https://balancr.example/invoice/abc", paymentInstructions: "BOC 1234567 Lanka Traders" });
ok(full.length <= SMS_MAX_CHARS, "a normal reminder fits one message");
ok(full.includes("Lanka Traders") && full.includes("INV-0042") && full.includes("LKR 12,500.00") && full.includes("2026-10-15"), "it says who, which invoice, how much and since when");
ok(full.includes("https://balancr.example/invoice/abc") && full.includes("BOC 1234567"), "link and payment instructions are included when they fit");
const longLink = "https://balancr.example/invoice/" + "x".repeat(400);
const trimmed = smsReminderText({ businessName: "Lanka Traders", ref: "INV-0042", currency: "LKR", balance: 12500, dueDate: null, link: longLink, paymentInstructions: "p".repeat(500) });
ok(trimmed.length <= SMS_MAX_CHARS, "a very long link and instructions never push it past the limit");
ok(!trimmed.includes("xxxx") && trimmed.includes("INV-0042") && trimmed.includes("LKR 12,500.00"), "the essentials survive and the oversized extras are dropped");
const hugeName = smsReminderText({ businessName: "N".repeat(300), ref: "R".repeat(300), currency: "LKR", balance: 1, dueDate: null });
ok(hugeName.length <= SMS_MAX_CHARS, "even absurd inputs stay within the limit");
ok(!/[^\x20-\x7E]/.test(smsReminderText({ businessName: "Café “Lanka”", ref: "INV-1", currency: "Rs", balance: 5, dueDate: null })), "the reminder is plain ASCII");

// ---- sending ----
const keep = { ...process.env };
const realFetch = globalThis.fetch;
async function run() {
  for (const k of ["NOTIFY_LK_USER_ID", "NOTIFY_LK_API_KEY", "NOTIFY_LK_SENDER_ID"]) delete process.env[k];
  ok(!isSmsConfigured(), "not configured without the three server values");
  let called = 0;
  globalThis.fetch = (async () => { called++; return new Response("{}"); }) as typeof fetch;
  ok((await sendSms({ to: "94771234567", message: "hi" })) === false && called === 0, "an unconfigured server sends nothing and says so");

  process.env.NOTIFY_LK_USER_ID = "u1"; process.env.NOTIFY_LK_API_KEY = "k1"; process.env.NOTIFY_LK_SENDER_ID = "LankaTrd";
  ok(isSmsConfigured(), "configured with all three");
  let seen: { url: string; body: string; method: string } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => { seen = { url, body: String(init.body), method: String(init.method) }; return new Response(JSON.stringify({ status: "success" }), { status: 200 }); }) as typeof fetch;
  ok((await sendSms({ to: "94771234567", message: "Hello café" })) === true, "a successful send returns true");
  ok(seen !== null && (seen as any).url === "https://app.notify.lk/api/v1/send" && (seen as any).method === "POST", "posts to Notify.lk's send endpoint");
  const params = new URLSearchParams((seen as any).body);
  ok(params.get("user_id") === "u1" && params.get("api_key") === "k1" && params.get("sender_id") === "LankaTrd" && params.get("to") === "94771234567", "sends the documented parameters");
  ok(params.get("message") === "Hello caf?", "the text is made plain before sending");

  globalThis.fetch = (async () => new Response(JSON.stringify({ status: "error", message: "Invalid key u1 k1" }), { status: 200 })) as typeof fetch;
  let err = "";
  try { await sendSms({ to: "94771234567", message: "x" }); } catch (e) { err = String((e as Error).message); }
  ok(err.includes("Notify.lk error") && !err.includes("k1") && !err.includes("Invalid key"), "a refusal throws without echoing the key or the gateway's text");
  globalThis.fetch = (async () => new Response("down", { status: 503 })) as typeof fetch;
  err = "";
  try { await sendSms({ to: "94771234567", message: "x" }); } catch (e) { err = String((e as Error).message); }
  ok(err.includes("503"), "an outage throws with the status");
  err = "";
  try { await sendSms({ to: "0771234567", message: "x" }); } catch (e) { err = String((e as Error).message); }
  ok(err.includes("94XXXXXXXXX"), "a number not in 94 form is refused before any call");
  err = "";
  try { await sendSms({ to: "94771234567", message: "   " }); } catch (e) { err = String((e as Error).message); }
  ok(err.length > 0, "an empty message is refused");

  // ---- how the daily job uses it ----
  const route = read("app/api/cron/reminders/route.ts");
  ok(/settings\.smsReminders === true/.test(route) && /ownSms \?\? serverSmsConfig\(\)/.test(route) || /smsConfigFrom\(/.test(route), "the job texts only for businesses that switched it on, with a key to send with");
  ok(/if \(!ok && mobile\)/.test(route), "a text is only the fallback: never an email and a text for the same invoice");
  ok(/SMS_RUN_LIMIT/.test(route), "texts per run are capped");
  ok(/autoReminders", "==", true/.test(route), "texts only go for businesses with reminders on");
  const settingsPage = read("app/settings/page.tsx");
  ok(/smsReminders: autoReminders && smsReminders/.test(settingsPage), "SMS cannot be saved on while reminders are off");
  ok(/NOTIFY_LK_USER_ID/.test(read(".env.local.example")), "the server values are documented");
}
run().finally(() => {
  globalThis.fetch = realFetch;
  for (const k of ["NOTIFY_LK_USER_ID", "NOTIFY_LK_API_KEY", "NOTIFY_LK_SENDER_ID"]) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }
  console.log(`${checks - fails}/${checks} checks passed`);
  if (fails) process.exit(1);
});
