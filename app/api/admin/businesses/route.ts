// Lists every business for the "Manage accounts" tab of
// app/admin/new-business/page.tsx. Admin SDK reads bypass firestore.rules
// entirely (there is no client-side path that could list every business —
// see the memberships/{uid} read rule, which only ever allows reading your
// own pointer), which is exactly why this has to be a server route gated
// by requireAdminPasscode rather than something the page could do with the
// client SDK directly.
//
// There's no top-level "businesses" collection to query directly (see the
// data-model comment atop firestore.rules — a business is just whatever
// exists under users/{businessId}, and that path is never guaranteed to
// have a doc of its own). What every business DOES have exactly one of is
// an owner pointer at memberships/{uid} where the businessId field equals
// the doc's own id — that's the provisioning-time signature of "this uid
// is a business owner, not someone who joined one" (see
// lib/provisioning.ts). Scanning that collection for self-pointing docs is
// the only reliable way to enumerate every business that exists.
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { readHealthSnapshot, type HealthSnapshot } from "@/lib/healthSnapshot";
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import type { AccountStatus } from "@/lib/types";
import { resolveAccess } from "@/lib/accountAccess";
import { readAiMonthUsage, type AiMonthUsage } from "@/lib/aiUsageLimit";

export const runtime = "nodejs";
// Reads request headers and live data on every call — never prerender or cache it.
export const dynamic = "force-dynamic";

interface AdminBusinessSummary {
  adminAccount: boolean;
  businessId: string;
  ownerName: string;
  ownerEmail: string;
  businessName: string | null;
  createdAt: number | null;
  suspended: boolean;
  suspendedAt: number | null;
  // True when the account is locked by an expired trial (computed, not stored).
  autoLocked: boolean;
  autoLockKind: "trial_expired" | "renewal_overdue" | null;
  autoLockOverdue: boolean;
  complimentary: boolean;
  trialLockDate: string | null;
  reason: string | null;
  plan: string | null;
  billingAmount: number | null;
  billingCycle: AccountStatus["billingCycle"] | null;
  lastPaidAt: number | null;
  renewalDueDate: string | null;
  trialEndsAt: string | null;
  convertedAt: number | null;
  // Timestamp of the newest audit-log entry (any entry, sale/purchase/expense/etc.)
  // — the "is this customer actually using it?" signal. Null = nothing logged yet.
  lastActiveAt: number | null;
  // When the owner last signed in (Firebase Auth). Null together with signedIn === false means
  // "has never signed in" — the customers most likely to need a nudge. signedIn is null when
  // the lookup failed (unknown), never a guess.
  lastSignInAt: number | null;
  signedIn: boolean | null;
  // This UTC month's AI Assistant use and a conservative cost estimate (lib/aiUsageLimit.ts).
  // Null = the assistant hasn't been used this month.
  aiMonth: AiMonthUsage | null;
  // Active logins (owner included). Null = the count failed (unknown), never a guess.
  activeLogins: number | null;
  // The owner's own daily summary (lib/healthSnapshot.ts); null = none yet (new account, or the owner has not opened the app).
  health: HealthSnapshot | null;
  notes: string | null;
}

// Firebase Auth's last-sign-in time for every owner, in batches of 100 (the API's limit). A
// failed batch just leaves those owners "unknown" — it never fails the whole list.
async function loadSignIns(ownerIds: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const auth = getAdminAuth();
  for (let i = 0; i < ownerIds.length; i += 100) {
    const chunk = ownerIds.slice(i, i + 100);
    try {
      const res = await auth.getUsers(chunk.map((uid) => ({ uid })));
      for (const u of res.users) {
        const t = u.metadata.lastSignInTime ? Date.parse(u.metadata.lastSignInTime) : NaN;
        out.set(u.uid, Number.isFinite(t) ? t : null);
      }
    } catch (err) {
      console.error("[admin/businesses] sign-in lookup failed for a batch", err);
    }
  }
  return out;
}

export async function GET(req: Request) {
  try {
    await requireAdminPasscode(req);
    const db = getAdminDb();

    const membershipsSnap = await db.collection("memberships").get();
    const ownerIds = membershipsSnap.docs
      .filter((d) => (d.data() as { businessId?: string }).businessId === d.id)
      .map((d) => d.id);

    const signIns = await loadSignIns(ownerIds);

    // Batches of 10 customers (about 60 reads in flight) so a long list never opens hundreds of reads at once.
    const BATCH = 10;
    const businesses: AdminBusinessSummary[] = [];
    for (let i = 0; i < ownerIds.length; i += BATCH) {
      const chunk = await Promise.all(
        ownerIds.slice(i, i + BATCH).map(async (businessId): Promise<AdminBusinessSummary> => {
        const [memberSnap, accountSnap, settingsSnap, lastActivitySnap, aiUsageSnap, loginsSnap, healthSnap] = await Promise.all([
          db.doc(`users/${businessId}/members/${businessId}`).get(),
          db.doc(`users/${businessId}/meta/account`).get(),
          db.doc(`users/${businessId}/meta/settings`).get(),
          // Best-effort: a failed lookup just means "unknown", never a failed list.
          db
            .collection(`users/${businessId}/auditLog`)
            .orderBy("at", "desc")
            .limit(1)
            .get()
            .catch(() => null),
          // Best-effort as well: no usage document just means "none this month".
          db.doc(`users/${businessId}/meta/aiUsage`).get().catch(() => null),
          // Active logins, counted server-side (one aggregate read, no documents transferred).
          db.collection(`users/${businessId}/members`).where("active", "==", true).count().get().catch(() => null),
          db.doc(`users/${businessId}/meta/healthSnapshot`).get().catch(() => null),
        ]);
        const lastActiveAt = (lastActivitySnap?.docs[0]?.data() as { at?: number } | undefined)?.at ?? null;
        const member = memberSnap.data() as { name?: string; email?: string; createdAt?: number } | undefined;
        const account = accountSnap.data() as AccountStatus | undefined;
        const settings = settingsSnap.data() as { businessName?: string } | undefined;

        return {
          businessId,
          ownerName: member?.name ?? "(unknown)",
          ownerEmail: member?.email ?? "(unknown)",
          businessName: settings?.businessName ?? null,
          createdAt: member?.createdAt ?? null,
          suspended: !!account?.suspended,
          suspendedAt: account?.suspendedAt ?? null,
          autoLocked: !account?.suspended && resolveAccess(account).locked,
          autoLockKind: (!account?.suspended && (resolveAccess(account).kind as "trial_expired" | "renewal_overdue" | null)) || null,
          autoLockOverdue: account?.autoLockOverdue === true,
          complimentary: account?.complimentary === true,
          adminAccount: account?.adminAccount === true,
          trialLockDate: resolveAccess(account).trialLockDate,
          reason: account?.reason ?? null,
          plan: account?.plan ?? null,
          billingAmount: account?.billingAmount ?? null,
          billingCycle: account?.billingCycle ?? null,
          lastPaidAt: account?.lastPaidAt ?? null,
          renewalDueDate: account?.renewalDueDate ?? null,
          trialEndsAt: account?.trialEndsAt ?? null,
          lastActiveAt,
          lastSignInAt: signIns.get(businessId) ?? null,
          signedIn: signIns.has(businessId) ? signIns.get(businessId) !== null : null,
          convertedAt: account?.convertedAt ?? null,
          aiMonth: readAiMonthUsage(aiUsageSnap?.data()),
          activeLogins: loginsSnap ? loginsSnap.data().count : null,
          health: readHealthSnapshot(healthSnap?.data()),
          notes: account?.notes ?? null,
        };
      })
      );
      businesses.push(...chunk);
    }

    businesses.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    return Response.json({ businesses });
  } catch (err) {
    return adminErrorResponse(err, "admin/businesses GET");
  }
}
