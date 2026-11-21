// The sync log (lib/syncLog.ts and the lead and invoice routes): every AutoLeads call that changes or reads a record in Balancr is logged through the helper;
// the helper never blocks the call; the log stores the action, record, outcome and time. Run: npx tsx scripts/verify-sync-log.ts
import fs from "node:fs";
import { logSync } from "../lib/syncLog";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const written: any[] = [];
const fake = { collection: (name: string) => ({ add: async (d: object) => { if (name === "syncLog") written.push(d); return {}; } }) };
(async () => {
  await logSync(fake as any, { action: "lead.stage", recordId: "L1", ok: true, detail: "won" });
  ok(written.length === 1 && written[0].action === "lead.stage" && written[0].recordId === "L1" && written[0].ok === true, "a sync call is recorded with its action, record and outcome");
  ok(written[0].source === "autoleads" && typeof written[0].at === "number", "the entry says where it came from and when");
  await logSync(fake as any, { action: "invoice.status", recordId: "I1", ok: true, detail: "x".repeat(500) });
  ok(written[1].detail.length === 200, "long detail is cut to 200 characters");
  const broken = { collection: () => ({ add: async () => { throw new Error("down"); } }) };
  let threw = false;
  try { await logSync(broken as any, { action: "lead.stage", recordId: "L2", ok: true }); } catch { threw = true; }
  ok(!threw, "a log that cannot be written does not stop the sync call");
  ok(read("app/api/v1/businesses/[businessId]/leads/item/[leadId]/route.ts").includes("logSync(auth.found.base"), "the single-lead route logs each stage change");
  ok(read("app/api/v1/businesses/[businessId]/invoices/item/[invoiceId]/route.ts").includes("logSync(auth.found.base"), "the invoice route logs each status read");
  console.log(`${checks - fails}/${checks} checks passed`);
  if (fails) process.exit(1);
})();
