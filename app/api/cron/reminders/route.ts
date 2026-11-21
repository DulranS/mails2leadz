// Daily: sends each customer with an overdue invoice one reminder, at most once per invoice per interval, for businesses that
// have switched automatic reminders on (Settings). Uses the same cron secret and open-mode gate as /api/cron/daily.
// The reminder goes by email when the customer has an email address. A business that also switched on SMS reminders reaches
// customers with a Sri Lankan mobile number and no email (or whose email could not be sent) by text through Notify.lk.
// Never both for one invoice in one interval. Emails come from Balancr's sender address; the business's reply address, if set,
// is used as the reply-to.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { cronAuthMode, requireCronSecret } from "@/lib/cronAuth";
import { claimOpenCronRun } from "@/lib/cronGate";
import { configuredSiteUrl } from "@/lib/envDefaults";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { sendSms, smsConfigFrom, smsReminderText, sriLankaMobile, serverSmsConfig, SMS_RUN_LIMIT, type SmsConfig } from "@/lib/sms";
import { groupSalesByInvoice } from "@/lib/calculations";
import { summariseInvoice, invoiceRefFor } from "@/lib/invoicePortal";
import { signToken } from "@/lib/signedToken";
import { customerEmail, clampReminderDays, reminderDue, reminderText, REMINDER_RUN_LIMIT } from "@/lib/overdueReminders";
import { todayIso } from "@/lib/format";
import { smsAllowedAt } from "@/lib/quietHours";
import type { Discount, ReceivablePayment, Sale, SaleReturn, Settings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LINK_DAYS = 60;

// True when at least one business has switched its own SMS entry on, so the job should run even if the server has no texting settings.
async function anyBusinessHasSms(): Promise<boolean> {
  const snap = await getAdminDb().collectionGroup("integrations").where("enabled", "==", true).get();
  return snap.docs.some((d: { id: string; data: () => unknown }) => d.id === "sms" && smsConfigFrom(d.data() as { enabled?: boolean; values?: Record<string, string> }) !== null);
}

export async function GET(req: Request) {
  const denied = requireCronSecret(req);
  if (denied) return denied;
  const open = cronAuthMode() === "open";
  const origin = configuredSiteUrl();
  if (open) {
    if (!origin) {
      return Response.json({ error: "The reminder job needs the site address for its links. Set NEXT_PUBLIC_SITE_URL." }, { status: 503 });
    }
    if (!(await claimOpenCronRun())) return Response.json({ ok: true, ran: false });
  }
  const emailOn = isEmailConfigured();
  // Texts go out through each business's own SMS entry (Integrations), or the server's settings; nothing here is needed for that to work.
  if (!emailOn && !serverSmsConfig() && !(await anyBusinessHasSms())) return Response.json({ ok: true, skipped: "Neither email nor SMS is configured, so no reminders were sent." });
  if (!origin) return Response.json({ error: "The reminder job needs the site address for its links. Set NEXT_PUBLIC_SITE_URL." }, { status: 503 });

  const today = todayIso();
  let considered = 0;
  let sent = 0;
  let smsSent = 0;
  try {
    const db = getAdminDb();
    const switchedOn = await db.collectionGroup("meta").where("autoReminders", "==", true).get();
    for (const snap of switchedOn.docs) {
      if (snap.id !== "settings" || sent >= REMINDER_RUN_LIMIT) continue;
      const businessId = snap.ref.parent.parent?.id;
      if (!businessId) continue;
      const settings = snap.data() as Settings;
      const everyDays = clampReminderDays(settings.reminderEveryDays);
      // Quiet hours: outside the business's text window no SMS goes out, and nothing is logged, so the next daily run retries it.
      const base = db.collection("users").doc(businessId);
      const ownSms: SmsConfig | null = smsConfigFrom((await base.collection("integrations").doc("sms").get()).data() as { enabled?: boolean; values?: Record<string, string> } | undefined);
      const smsWanted = !!(ownSms ?? serverSmsConfig()) && settings.smsReminders === true && smsAllowedAt(settings.automations, new Date());
      const [salesSnap, paySnap, retSnap, discSnap] = await Promise.all([
        base.collection("sales").where("paymentMethod", "==", "credit").get(),
        base.collection("receivablePayments").get(),
        base.collection("saleReturns").get(),
        base.collection("discounts").get(),
      ]);
      const sales = salesSnap.docs.map((d) => ({ ...(d.data() as Sale), id: d.id }));
      const payments = paySnap.docs.map((d) => ({ ...(d.data() as ReceivablePayment), id: d.id }));
      const returns = retSnap.docs.map((d) => ({ ...(d.data() as SaleReturn), id: d.id }));
      const discounts = discSnap.docs.map((d) => ({ ...(d.data() as Discount), id: d.id }));

      for (const group of groupSalesByInvoice(sales)) {
        if (sent >= REMINDER_RUN_LIMIT) break;
        const ids = new Set(group.sales.map((s) => s.id));
        const summary = summariseInvoice({
          sales: group.sales,
          returns: returns.filter((r) => ids.has(r.saleId)),
          discounts: discounts.filter((d) => ids.has(d.saleId)),
          payments: payments.filter((p) => ids.has(p.saleId)),
          today,
        });
        if (summary.status !== "overdue") continue;
        const to = emailOn ? customerEmail(group.primary.customerContact) : null;
        const mobile = smsWanted && smsSent < SMS_RUN_LIMIT ? sriLankaMobile(group.primary.customerContact) : null;
        if (!to && !mobile) continue;
        considered += 1;

        const key = group.invoiceId ?? group.primary.id;
        const logRef = base.collection("reminderLog").doc(key);
        const last = (await logRef.get()).data() as { lastSentAt?: string } | undefined;
        if (!reminderDue(last?.lastSentAt, today, everyDays)) continue;

        const token = signToken("invoice", `${businessId}/${key}`, LINK_DAYS * 86_400_000);
        if (!token) continue;
        const message = reminderText({
          ref: invoiceRefFor(key),
          businessName: settings.businessName ?? "",
          currency: settings.currency,
          balance: summary.balance,
          dueDate: summary.dueDate,
          link: `${origin}/invoice/${token}`,
          paymentInstructions: settings.paymentInstructions ?? null,
        });
        let ok = false;
        if (to) {
          try {
            ok = await sendEmail({ to, subject: message.subject, text: message.text, replyTo: settings.replyToEmail?.trim() || undefined });
          } catch (err) {
            console.error("[cron/reminders] email", err instanceof Error ? err.message : "failed");
          }
        }
        // A text is the fallback: no email address on the sale, or the email could not be sent.
        if (!ok && mobile) {
          try {
            ok = await sendSms({
              to: mobile,
              message: smsReminderText({
                businessName: settings.businessName ?? "",
                ref: invoiceRefFor(key),
                currency: settings.currency,
                balance: summary.balance,
                dueDate: summary.dueDate,
                link: `${origin}/invoice/${token}`,
                paymentInstructions: settings.paymentInstructions ?? null,
              }),
            }, ownSms);
            if (ok) smsSent += 1;
          } catch (err) {
            console.error("[cron/reminders] sms", err instanceof Error ? err.message : "failed");
          }
        }
        if (ok) {
          await logRef.set({ lastSentAt: today, sentAt: Date.now() }, { merge: true });
          sent += 1;
        }
      }
    }
    return Response.json({ ok: true, ran: true, considered, sent, smsSent });
  } catch (err) {
    console.error("[cron/reminders]", err);
    return Response.json({ error: "The reminder job failed. Check the server logs." }, { status: 500 });
  }
}
