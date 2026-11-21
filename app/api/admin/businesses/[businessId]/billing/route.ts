// Writes the billing fields on users/{businessId}/meta/account — the same
// doc and the same rationale as the sibling suspend/route.ts: no payment
// gateway sits anywhere in this project (see AccountStatus in
// lib/types.ts), so this route is the entire "billing system". The admin
// records what actually happened (a plan was agreed, a payment came in)
// by hand; nothing here charges a card or talks to a payment processor.
// firestore.rules already denies client writes to this doc outright, so
// the Admin SDK bypass below is what makes "a suspended/overdue business
// can't touch its own billing record" true, same guarantee as `suspended`.
//
// Payments are RECORDS, not just a moved date: recording one writes the payment
// (amount, method, reference, and what it replaced) to
// users/{id}/meta/billingHistory AND updates meta/account in ONE transaction, so
// the two can never disagree. An identical payment arriving within a minute of the
// last one (a retry after a timeout) is refused by isLikelyDuplicate in lib/billing.ts,
// because each recorded payment moves the renewal a further cycle. The pure rules live in
// lib/billing.ts (verified by scripts/verify-billing.ts).
//
// Request shapes (POST, all admin-passcode gated):
//   { recordPayment: { amount?, plan?, cycle?, method?, reference?,
//                      renewalDueDate?, autoLockOverdue? } }
//   { undoLastPayment: true }
//   { plan?, billingAmount?, billingCycle?, renewalDueDate?, autoLockOverdue?,
//     complimentary?, notes? }            // plain edits, no payment involved
// GET returns { payments } (newest first) for the admin card's payment history.
import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import type { AccountStatus } from "@/lib/types";
import {
  appendPayment,
  buildPayment,
  buildUndo,
  isIsoDate,
  isLikelyDuplicate,
  PAYMENT_METHOD_LABELS,
  type BillingPayment,
  type PaymentMethod,
  type RecordPaymentInput,
} from "@/lib/billing";
import type { BillingCycle } from "@/lib/pricing";
import { paymentReceivedEmail } from "@/lib/lifecycle";
import { emailOwner } from "@/lib/lifecycleServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // reads headers + live data; never prerender or cache

const VALID_CYCLES: BillingCycle[] = ["monthly", "annual"];

class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function assertBusinessExists(businessId: string) {
  const db = getAdminDb();
  // Confirms this is actually a business, same check as suspend/route.ts —
  // no reason to let a typo'd id silently create a stray meta/account doc.
  const membershipSnap = await db.collection("memberships").doc(businessId).get();
  const pointerBusinessId = (membershipSnap.data() as { businessId?: string } | undefined)?.businessId;
  if (!membershipSnap.exists || pointerBusinessId !== businessId) {
    throw new HttpError("No business found with that id.", 404);
  }
}

function toFirestoreUpdate(set: Record<string, unknown>, remove: string[]): Record<string, unknown> {
  const update: Record<string, unknown> = { ...set };
  for (const key of remove) update[key] = FieldValue.delete();
  return update;
}

function parsePaymentInput(raw: unknown): RecordPaymentInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const input: RecordPaymentInput = {};
  if (typeof r.amount === "number") input.amount = r.amount;
  else if (typeof r.amount === "string" && r.amount.trim() !== "") input.amount = Number(r.amount);
  if (typeof r.plan === "string") input.plan = r.plan.trim().slice(0, 80);
  if (VALID_CYCLES.includes(r.cycle as BillingCycle)) input.cycle = r.cycle as BillingCycle;
  if (typeof r.method === "string" && r.method in PAYMENT_METHOD_LABELS) input.method = r.method as PaymentMethod;
  if (typeof r.reference === "string") input.reference = r.reference;
  if (typeof r.renewalDueDate === "string" && r.renewalDueDate.trim() !== "") input.renewalDueDate = r.renewalDueDate.trim();
  if (typeof r.autoLockOverdue === "boolean") input.autoLockOverdue = r.autoLockOverdue;
  return input;
}

export async function GET(req: Request, { params }: { params: { businessId: string } }) {
  try {
    await requireAdminPasscode(req);
    const { businessId } = params;
    if (!businessId) return Response.json({ error: "businessId is required" }, { status: 400 });
    await assertBusinessExists(businessId);
    const snap = await getAdminDb().doc(`users/${businessId}/meta/billingHistory`).get();
    const payments = ((snap.data() as { payments?: BillingPayment[] } | undefined)?.payments ?? []).slice().reverse();
    return Response.json({ payments });
  } catch (err) {
    if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
    return adminErrorResponse(err, "admin/businesses/[businessId]/billing GET");
  }
}

export async function POST(req: Request, { params }: { params: { businessId: string } }) {
  try {
    await requireAdminPasscode(req);
    const { businessId } = params;
    if (!businessId) {
      return Response.json({ error: "businessId is required" }, { status: 400 });
    }
    await assertBusinessExists(businessId);

    const body = await req.json().catch(() => ({}));
    const db = getAdminDb();
    const accountRef = db.doc(`users/${businessId}/meta/account`);
    const historyRef = db.doc(`users/${businessId}/meta/billingHistory`);
    const now = new Date();

    // ---- Record a payment ----------------------------------------------------
    if (body?.recordPayment && typeof body.recordPayment === "object") {
      const input = parsePaymentInput(body.recordPayment);
      const result = await db.runTransaction(async (tx) => {
        const [accountSnap, historySnap] = await Promise.all([tx.get(accountRef), tx.get(historyRef)]);
        const account = (accountSnap.data() as AccountStatus | undefined) ?? { suspended: false };
        const history = (historySnap.data() as { payments?: BillingPayment[] } | undefined)?.payments ?? [];
        const built = buildPayment(account, input, now, randomUUID());
        if (!built.ok) throw new HttpError(built.error, 400);
        if (isLikelyDuplicate(history, built.payment, now)) {
          throw new HttpError(
            "This exact payment was recorded moments ago — check Payment history before recording it again (Undo removes it if it was a mistake).",
            409
          );
        }
        tx.set(accountRef, toFirestoreUpdate(built.set, built.remove), { merge: true });
        tx.set(historyRef, { payments: appendPayment(history, built.payment) });
        return built.payment;
      });
      const updated = (await accountRef.get()).data();
      // The receipt: the customer hears "we got it, you're covered until X" the moment the
      // admin records it, instead of the admin typing that message by hand. Sent AFTER the
      // payment is saved and never able to fail it; the admin can switch it off per payment.
      const receiptEmail =
        body?.notifyCustomer === false
          ? "skipped"
          : await emailOwner(
              businessId,
              (ctx) =>
                paymentReceivedEmail({
                  ...ctx,
                  amount: result.amount,
                  plan: result.plan,
                  cycle: result.cycle,
                  methodLabel: PAYMENT_METHOD_LABELS[result.method],
                  reference: result.reference,
                  coveredUntil: result.coveredUntil,
                }),
              req
            );
      return Response.json({ businessId, account: updated, payment: result, receiptEmail });
    }

    // ---- Undo the latest payment --------------------------------------------
    if (body?.undoLastPayment === true) {
      await db.runTransaction(async (tx) => {
        const [accountSnap, historySnap] = await Promise.all([tx.get(accountRef), tx.get(historyRef)]);
        const account = (accountSnap.data() as AccountStatus | undefined) ?? { suspended: false };
        const history = (historySnap.data() as { payments?: BillingPayment[] } | undefined)?.payments ?? [];
        const last = history[history.length - 1];
        if (!last) throw new HttpError("There is no recorded payment to undo.", 400);
        const undone = buildUndo(account, last);
        if (!undone.ok) throw new HttpError(undone.error, 409);
        tx.set(accountRef, toFirestoreUpdate(undone.set, undone.remove), { merge: true });
        tx.set(historyRef, { payments: history.slice(0, -1) });
      });
      const updated = (await accountRef.get()).data();
      return Response.json({ businessId, account: updated });
    }

    // ---- Plain edits (no payment) -------------------------------------------
    const plan = typeof body?.plan === "string" ? body.plan.trim().slice(0, 80) : undefined;
    const billingAmountRaw = body?.billingAmount;
    const billingAmount =
      typeof billingAmountRaw === "number" && Number.isFinite(billingAmountRaw) && billingAmountRaw >= 0
        ? billingAmountRaw
        : undefined;
    const billingCycle = VALID_CYCLES.includes(body?.billingCycle) ? (body.billingCycle as BillingCycle) : undefined;
    const renewalDueDateRaw = typeof body?.renewalDueDate === "string" ? body.renewalDueDate.trim() : "";
    const autoLockOverdue = typeof body?.autoLockOverdue === "boolean" ? body.autoLockOverdue : undefined;
    const complimentary = typeof body?.complimentary === "boolean" ? body.complimentary : undefined;
    const notesRaw = typeof body?.notes === "string" ? body.notes.trim().slice(0, 2000) : undefined;

    // A malformed date here used to be stored as-is, and every lock check treats an
    // unparseable date as "never locks" — a typo silently switched enforcement off.
    if (renewalDueDateRaw && !isIsoDate(renewalDueDateRaw)) {
      return Response.json({ error: "That renewal date isn't a valid date." }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (plan !== undefined) update.plan = plan || FieldValue.delete();
    if (billingAmount !== undefined) update.billingAmount = billingAmount;
    if (billingCycle !== undefined) update.billingCycle = billingCycle;
    if (renewalDueDateRaw) update.renewalDueDate = renewalDueDateRaw;
    if (autoLockOverdue !== undefined) update.autoLockOverdue = autoLockOverdue ? true : FieldValue.delete();
    if (notesRaw !== undefined) update.notes = notesRaw || FieldValue.delete();
    if (complimentary === true) {
      // Never invoiced: no trial clock, no renewal date to chase or lock on.
      update.complimentary = true;
      update.trialEndsAt = FieldValue.delete();
      update.renewalDueDate = FieldValue.delete();
      update.autoLockOverdue = FieldValue.delete();
    } else if (complimentary === false) {
      update.complimentary = FieldValue.delete();
    }

    if (Object.keys(update).length === 0) {
      return Response.json({ error: "Nothing to update." }, { status: 400 });
    }

    await accountRef.set(update, { merge: true });
    const updatedSnap = await accountRef.get();
    return Response.json({ businessId, account: updatedSnap.data() });
  } catch (err) {
    if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
    return adminErrorResponse(err, "admin/businesses/[businessId]/billing POST");
  }
}
