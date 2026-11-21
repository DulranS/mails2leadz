// Daily: sends each business's routine customer messages (booking confirmations and reminders, quote follow-ups, thank-yous, welcomes, and optional review
// asks), worked out by lib/customerMessages.ts. Same cron secret and open-mode gate as the other daily jobs. Only businesses that have switched customer
// messages on are read. Each message goes by email when the customer has an email address, otherwise by text to a Sri Lankan mobile number; texts only
// within the business's quiet-hours window; at most CUSTOMER_MESSAGE_RUN_LIMIT per run; and each event is logged once, so a repeat run never sends it twice.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { cronAuthMode, requireCronSecret } from "@/lib/cronAuth";
import { claimOpenCronRun } from "@/lib/cronGate";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { sendSms, serverSmsConfig, sriLankaMobile, smsConfigFrom, type SmsConfig } from "@/lib/sms";
import { smsAllowedAt } from "@/lib/quietHours";
import { dueMessages, CUSTOMER_MESSAGE_RUN_LIMIT } from "@/lib/customerMessages";
import type { Settings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;


export async function GET(req: Request) {
  const denied = requireCronSecret(req);
  if (denied) return denied;
  if (cronAuthMode() === "open" && !(await claimOpenCronRun())) return Response.json({ ok: true, ran: false });
  const emailOn = isEmailConfigured();
  if (!emailOn && !serverSmsConfig()) return Response.json({ ok: true, skipped: "Neither email nor SMS is configured, so no customer messages were sent." });
  const now = Date.now();
  let considered = 0, sent = 0;
  try {
    const db = getAdminDb();
    const switchedOn = await db.collectionGroup("meta").where("customerMessages", "==", true).get();
    for (const snap of switchedOn.docs) {
      if (snap.id !== "settings" || sent >= CUSTOMER_MESSAGE_RUN_LIMIT) continue;
      const businessId = snap.ref.parent.parent?.id;
      if (!businessId) continue;
      const settings = snap.data() as Settings & { customerMessages?: boolean; reviewRequests?: boolean };
      const base = db.collection("users").doc(businessId);
      const name = settings.businessName || "our business";
      const ownSms: SmsConfig | null = smsConfigFrom((await base.collection("integrations").doc("sms").get()).data() as { enabled?: boolean; values?: Record<string, string> } | undefined);
      const smsWanted = !!(ownSms ?? serverSmsConfig()) && smsAllowedAt(settings.automations, new Date(now));
      const [bk, es, pj, cu, sa, lg] = await Promise.all([
        base.collection("bookings").get(), base.collection("estimates").get(), base.collection("projects").get(),
        base.collection("customers").get(), base.collection("sales").get(), base.collection("customerMessageLog").get(),
      ]);
      const sent_ = new Set(lg.docs.map((d) => d.id));
      const customers = new Map(cu.docs.map((d) => [String((d.data() as { name?: string }).name ?? "").trim().toLowerCase(), d.data() as { contact?: string; marketingOptIn?: boolean; messagesRefused?: boolean }]));
      const cFor = (n: string) => customers.get(n.trim().toLowerCase()) ?? {};
      const firstSaleAt = new Map<string, number>();
      for (const d of sa.docs) {
        const s = d.data() as { customer?: string; date?: string };
        if (!s.customer || !s.date) continue;
        const k = s.customer.trim().toLowerCase();
        const t = Date.parse(`${s.date}T00:00:00`);
        if (!firstSaleAt.has(k) || t < (firstSaleAt.get(k) as number)) firstSaleAt.set(k, t);
      }
      const due = dueMessages({
        bookings: bk.docs.map((d) => { const b = d.data() as { customerName: string; contact?: string; date: string; startTime: string; status: string; createdAt?: number }; const c = cFor(b.customerName); return { id: d.id, customer: b.customerName, contact: b.contact ?? c.contact, startsAt: Date.parse(`${b.date}T${b.startTime}:00`), createdAt: b.createdAt ?? 0, status: b.status, optedOut: c.messagesRefused, marketingOut: c.marketingOptIn === false }; }),
        estimates: es.docs.map((d) => { const e = d.data() as { customer?: string; customerContact?: string; sentAt?: number; status: string }; const c = cFor(e.customer ?? ""); return { id: d.id, customer: e.customer ?? "", contact: e.customerContact ?? c.contact, sentAt: e.sentAt ?? 0, status: e.status, optedOut: c.messagesRefused, marketingOut: c.marketingOptIn === false }; }),
        projects: pj.docs.map((d) => { const p = d.data() as { client?: string; status: string; completedDate?: string }; if (p.status !== "completed" || !p.completedDate) return null; const c = cFor(p.client ?? ""); return { id: d.id, customer: p.client ?? "", contact: c.contact, completedAt: Date.parse(`${p.completedDate}T00:00:00`), optedOut: c.messagesRefused, marketingOut: c.marketingOptIn === false }; }).filter((x): x is NonNullable<typeof x> => x !== null),
        firstSales: [...firstSaleAt.entries()].map(([k, at]) => ({ id: k, customer: k, at, optedOut: cFor(k).messagesRefused, marketingOut: cFor(k).marketingOptIn === false })),
      }, sent_, now, name, settings.reviewRequests === true);
      for (const m of due) {
        if (sent >= CUSTOMER_MESSAGE_RUN_LIMIT) break;
        considered++;
        const contact = (m.contact ?? cFor(m.customer).contact ?? "").trim();
        let ok = false;
        if (contact.includes("@") && emailOn) {
          ok = await sendEmail({ to: contact, subject: `Message from ${name}`, text: m.text, replyTo: undefined });
        } else if (!contact.includes("@") && smsWanted && sriLankaMobile(contact)) {
          ok = await sendSms({ to: sriLankaMobile(contact) as string, message: m.text }, ownSms ?? serverSmsConfig());
        }
        if (!ok) continue;
        sent++;
        await base.collection("customerMessageLog").doc(m.key).set({ ruleId: m.ruleId, customer: m.customer, sentAt: now });
      }
    }
  } catch {
    return Response.json({ error: "The customer message job could not finish. Try again later." }, { status: 500 });
  }
  return Response.json({ ok: true, considered, sent });
}
