// Sends an email campaign to customers who agreed to offers. Owner and Manager only. Every email carries the customer's own
// one-click unsubscribe link. Capped per send and per day. A campaign changes no sale, payment, stock or balance.
import { getAdminDb, requireSignedIn, AiAuthError } from "@/lib/firebaseAdmin";
import { resolveAccess, type AccessInput } from "@/lib/accountAccess";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { signToken } from "@/lib/signedToken";
import { todayIso } from "@/lib/format";
import {
  campaignRecipients, campaignText, remainingToday, validateCampaign, MARKETING_RUN_LIMIT, UNSUBSCRIBE_LINK_DAYS,
  type CampaignCustomer,
} from "@/lib/marketing";
import type { Role, Settings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export async function POST(req: Request) {
  try {
    const { uid, businessId } = await requireSignedIn(req);
    const db = getAdminDb();
    const base = db.collection("users").doc(businessId);
    const [memberSnap, accountSnap, settingsSnap] = await Promise.all([
      base.collection("members").doc(uid).get(),
      db.doc(`users/${businessId}/meta/account`).get(),
      base.collection("meta").doc("settings").get(),
    ]);
    const role = (memberSnap.data() as { role?: Role } | undefined)?.role;
    if (role !== "owner" && role !== "manager") throw new AiAuthError("Only the owner or a manager can send a campaign.", 403);
    if (resolveAccess(accountSnap.data() as AccessInput | undefined).locked) throw new AiAuthError("This account is locked, so campaigns are paused. Get in touch to continue.", 403);
    if (!isEmailConfigured()) throw new AiAuthError("Email is not set up on this server yet, so nothing can be sent.", 503);

    const body = (await req.json().catch(() => ({}))) as { subject?: unknown; body?: unknown };
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const text = typeof body.body === "string" ? body.body.trim() : "";
    const problem = validateCampaign({ subject, body: text });
    if (problem) throw new AiAuthError(problem, 400);

    const settings = (settingsSnap.data() as Partial<Settings> | undefined) ?? {};
    const origin = new URL(req.url).origin;
    const today = todayIso();
    const logRef = base.collection("marketingLog").doc(today);
    const sentToday = ((await logRef.get()).data() as { sent?: number } | undefined)?.sent ?? 0;
    const room = Math.min(MARKETING_RUN_LIMIT, remainingToday(sentToday));
    if (room <= 0) throw new AiAuthError("The daily limit for campaign emails has been reached. Try again tomorrow.", 429);

    const custSnap = await base.collection("customers").get();
    const customers: CampaignCustomer[] = custSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CampaignCustomer, "id">) }));
    const everyone = campaignRecipients(customers);
    const batch = everyone.slice(0, room);

    let sent = 0;
    let failed = 0;
    for (const r of batch) {
      const token = signToken("unsubscribe", `${businessId}/${r.customerId}`, UNSUBSCRIBE_LINK_DAYS * DAY_MS);
      if (!token) throw new AiAuthError("Links are not set up on this server yet. Ask whoever runs Balancr to set LINK_SIGNING_SECRET.", 500);
      try {
        const ok = await sendEmail({
          to: r.email,
          subject,
          text: campaignText({ businessName: settings.businessName ?? "", customerName: r.name, body: text, unsubscribeUrl: `${origin}/unsubscribe/${token}` }),
          replyTo: settings.replyToEmail?.trim() || undefined,
        });
        if (ok) sent += 1; else failed += 1;
      } catch (err) {
        failed += 1;
        console.error("[marketing/send]", err instanceof Error ? err.message : "failed");
      }
    }
    if (sent > 0) await logRef.set({ sent: sentToday + sent, updatedAt: Date.now() }, { merge: true });
    return Response.json({ sent, failed, eligible: everyone.length, heldBack: Math.max(0, everyone.length - batch.length) });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[marketing/send]", err);
    return Response.json({ error: "Couldn't send the campaign. Try again." }, { status: 500 });
  }
}
