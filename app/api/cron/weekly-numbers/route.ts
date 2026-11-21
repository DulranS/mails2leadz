// Weekly numbers (v282): on Mondays, emails each business that has switched them on a short summary of the week that just ended. Same gate as the other daily
// jobs. The address is the owner's report address from Settings. Only the sales and expenses dated in that week are used.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { cronAuthMode, requireCronSecret } from "@/lib/cronAuth";
import { claimOpenCronRun } from "@/lib/cronGate";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { weeklyNumbers, previousWeek } from "@/lib/weeklyNumbers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = requireCronSecret(req);
  if (denied) return denied;
  if (cronAuthMode() === "open" && !(await claimOpenCronRun())) return Response.json({ ok: true, ran: false });
  const today = new Date().toISOString().slice(0, 10);
  if (new Date(`${today}T00:00:00Z`).getUTCDay() !== 1) return Response.json({ ok: true, skipped: "Weekly numbers go out on Mondays." });
  if (!isEmailConfigured()) return Response.json({ ok: true, skipped: "Email is not configured, so nothing was sent." });
  const { from, to } = previousWeek(today);
  let sent = 0;
  try {
    const db = getAdminDb();
    const switched = await db.collectionGroup("meta").where("weeklyNumbers", "==", true).get();
    for (const snap of switched.docs) {
      if (snap.id !== "settings") continue;
      const businessId = snap.ref.parent.parent?.id;
      const s = snap.data() as { businessName?: string; reportEmail?: string };
      if (!businessId || !s.reportEmail?.includes("@")) continue;
      const base = db.collection("users").doc(businessId);
      const [sa, ex] = await Promise.all([base.collection("sales").get(), base.collection("expenses").get()]);
      const w = weeklyNumbers({
        businessName: s.businessName || "Your business",
        from, to,
        sales: sa.docs.map((d) => d.data() as { date: string; qty: number; unitPrice: number }),
        expenses: ex.docs.map((d) => d.data() as { startDate: string; amount: number }).map((e) => ({ date: e.startDate, amount: e.amount })),
      });
      if (await sendEmail({ to: s.reportEmail, subject: w.subject, text: w.text })) sent++;
    }
  } catch {
    return Response.json({ error: "The weekly numbers job could not finish." }, { status: 500 });
  }
  return Response.json({ ok: true, sent, week: { from, to } });
}
