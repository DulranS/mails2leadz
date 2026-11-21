// The shared "Try it now" sandbox, kept usable for the next stranger. Server-only (Admin SDK).
//
// The problem it solves: every visitor signs in to the SAME business, so what the last person did
// is what the next one sees — and the login itself (a public password, an email address) could be
// changed or the whole Firebase user deleted by whoever got there first, which would switch the
// button off for everyone. Four things here fix that:
//
//   1. No shared password. The browser asks POST /api/demo/session for a one-time sign-in token
//      minted here (Admin SDK custom token). Nothing a visitor does to the demo user's password or
//      email affects the next visit, and there is no credential in the page for anyone to read.
//   2. Self-healing login. Before a token is minted the Firebase user is checked and, if it was
//      deleted, disabled or had its email changed, put back — keeping the SAME uid so the business
//      data (which is keyed by uid) is untouched.
//   3. Reset to the sample data (resetDemoBusiness) — when the demo has been used and then left idle
//      (so nobody's books are replaced mid-look), once a day from the cron, and on demand from the
//      admin panel.
//   4. Fail closed. Everything that mints a token or wipes data first checks that the account is a
//      Demo-plan, complimentary business (lib/guardrails.ts). A paying or trial customer can never
//      pass that check, even if NEXT_PUBLIC_DEMO_EMAIL pointed at one by mistake.
//
// State lives in platform/demo ({ uid, lastMintAt, lastResetAt, resetLockUntil }) — a document no
// client can read or write (there is no rule for `platform`), same as platform/automation.
import { randomUUID } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "./firebaseAdmin";
import { DEMO_EMAIL } from "./demoAccount";
import { seedDemoBusiness } from "./demoSeedServer";
import { isDesignatableDemo, isResettableDemo, shouldResetDemo, type DemoState, type KindInput } from "./guardrails";

export const DEMO_STATE_DOC = "platform/demo";
// A reset holds the lock for at most this long, so a crash mid-reset can't wedge it forever.
const RESET_LOCK_MS = 2 * 60 * 1000;

export class DemoError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
  }
}

interface StoredDemoState extends DemoState {
  uid?: string;
  resetLockUntil?: number;
}

type AdminAuth = ReturnType<typeof getAdminAuth>;

const demoEmail = () => DEMO_EMAIL.trim().toLowerCase();
const isNotFound = (err: unknown) => (err as { code?: string })?.code === "auth/user-not-found";

async function loadState(db: Firestore): Promise<StoredDemoState> {
  const snap = await db.doc(DEMO_STATE_DOC).get();
  return (snap.exists ? snap.data() : {}) as StoredDemoState;
}

async function loadAccount(db: Firestore, uid: string): Promise<KindInput | undefined> {
  const snap = await db.doc(`users/${uid}/meta/account`).get();
  return snap.exists ? (snap.data() as KindInput) : undefined;
}

// Which business is the public demo: the one recorded in platform/demo, else the account that owns
// the configured demo email (and that is then recorded, so a later email change can't lose it).
export async function resolveDemoUid(db: Firestore, auth: AdminAuth): Promise<string> {
  const state = await loadState(db);
  if (state.uid) return state.uid;
  try {
    const user = await auth.getUserByEmail(demoEmail());
    return user.uid;
  } catch (err) {
    if (isNotFound(err)) {
      throw new DemoError(
        `No demo account exists for ${demoEmail()}. Create one with Admin → New business → "Create demo business", then set NEXT_PUBLIC_DEMO_EMAIL to its email.`,
        404
      );
    }
    throw err;
  }
}

// Marks the account as THE public demo — but only if it is already a Demo-plan complimentary
// sandbox. Returns the account as it now stands.
export async function ensureDesignated(db: Firestore, uid: string): Promise<KindInput> {
  const account = await loadAccount(db, uid);
  if (isResettableDemo(account)) return account!;
  if (isDesignatableDemo(account)) {
    await db.doc(`users/${uid}/meta/account`).set({ publicDemo: true }, { merge: true });
    await db.doc(DEMO_STATE_DOC).set({ uid }, { merge: true });
    return { ...account!, publicDemo: true };
  }
  throw new DemoError(
    `The account for ${demoEmail()} isn't a Demo business, so it can't be used as the public demo. In Admin → Manage accounts → Edit billing set its plan to "Demo" and mark it complimentary — or create a fresh one with "Create demo business".`,
    409
  );
}

// Puts the Firebase login back the way the demo needs it. The email and password don't matter for
// signing in any more (visitors get a minted token), so a failure to restore the email — say a
// stranger registered that address elsewhere — is logged and ignored rather than breaking the demo.
export async function ensureDemoUser(auth: AdminAuth, uid: string, opts: { rotatePassword?: boolean } = {}): Promise<void> {
  try {
    const user = await auth.getUser(uid);
    const fix: { email?: string; disabled?: boolean; password?: string } = {};
    if (user.disabled) fix.disabled = false;
    if ((user.email ?? "").toLowerCase() !== demoEmail()) fix.email = demoEmail();
    if (opts.rotatePassword) fix.password = randomUUID();
    if (Object.keys(fix).length > 0) {
      try {
        await auth.updateUser(uid, fix);
      } catch (err) {
        console.error("[demo] couldn't restore the demo login", err);
        if (fix.disabled !== undefined) throw err; // a disabled user can't sign in at all — that one matters
      }
    }
  } catch (err) {
    if (!isNotFound(err)) throw err;
    // Deleted: bring it back with the SAME uid, so every document keyed by it is still the demo's.
    await auth.createUser({ uid, email: demoEmail(), password: randomUUID(), displayName: "Demo owner", emailVerified: true });
  }
}

async function claimResetLock(db: Firestore, now: number): Promise<boolean> {
  const ref = db.doc(DEMO_STATE_DOC);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.exists ? snap.data() : {}) as StoredDemoState;
    if ((data.resetLockUntil ?? 0) > now) return false;
    tx.set(ref, { resetLockUntil: now + RESET_LOCK_MS }, { merge: true });
    return true;
  });
}

// Wipes everything in the demo business except the account doc (so the "this is the demo" marker
// survives even if this crashes half way), then writes the sample books back. Returns documents written.
export async function resetDemoBusiness(db: Firestore, auth: AdminAuth, uid: string, now = Date.now()): Promise<number> {
  const account = await loadAccount(db, uid);
  if (!isResettableDemo(account)) {
    // The check that makes it impossible to point this at a real customer.
    throw new DemoError("Refusing to reset: that account isn't marked as the public demo.", 409);
  }

  const root = db.doc(`users/${uid}`);
  for (const col of await root.listCollections()) {
    if (col.id === "meta") {
      for (const d of await col.listDocuments()) if (d.id !== "account") await db.recursiveDelete(d);
    } else {
      await db.recursiveDelete(col);
    }
  }
  // People a visitor "invited" and who then signed up leave a pointer to this business behind.
  const pointers = await db.collection("memberships").where("businessId", "==", uid).get();
  await Promise.all(pointers.docs.filter((d) => d.id !== uid).map((d) => d.ref.delete()));

  const documents = await seedDemoBusiness(db, uid, { email: demoEmail(), publicDemo: true });
  // Rotating the password also retires the one that used to be printed in the page.
  await ensureDemoUser(auth, uid, { rotatePassword: true });
  await db.doc(DEMO_STATE_DOC).set({ uid, lastResetAt: now, resetLockUntil: 0 }, { merge: true });
  return documents;
}

async function resetWithLock(db: Firestore, auth: AdminAuth, uid: string, now: number): Promise<number | null> {
  if (!(await claimResetLock(db, now))) return null; // someone else is already doing it
  try {
    return await resetDemoBusiness(db, auth, uid, now);
  } finally {
    await db.doc(DEMO_STATE_DOC).set({ resetLockUntil: 0 }, { merge: true }).catch(() => {});
  }
}

// What POST /api/demo/session does: make sure the demo is usable and hand back a sign-in token.
//
// `deps` exists so scripts/verify-demo-guardrails.ts can run the whole flow against an in-memory
// stand-in for Firestore and Firebase Auth; production callers pass nothing.
export interface DemoDeps {
  db: Firestore;
  auth: AdminAuth;
}
const realDeps = (): DemoDeps => ({ db: getAdminDb(), auth: getAdminAuth() });

export async function openDemoSession(now = Date.now(), deps: DemoDeps = realDeps()): Promise<{ token: string; uid: string; reset: boolean }> {
  const { db, auth } = deps;
  const uid = await resolveDemoUid(db, auth);
  await ensureDesignated(db, uid);

  let reset = false;
  if (shouldResetDemo(await loadState(db), now)) {
    try {
      reset = (await resetWithLock(db, auth, uid, now)) !== null;
    } catch (err) {
      // A failed reset shouldn't keep a visitor out; they get the demo as it stands.
      console.error("[demo] reset before session failed", err);
    }
  }
  if (!reset) await ensureDemoUser(auth, uid);

  await db.doc(DEMO_STATE_DOC).set({ uid, lastMintAt: now }, { merge: true });
  // The claim lets the browser recognise a demo session without relying on the (changeable) email.
  const token = await auth.createCustomToken(uid, { demo: true });
  return { token, uid, reset };
}

// Admin "Reset demo now": always resets (unless one is already running), idle or not.
export async function resetDemoNow(now = Date.now(), deps: DemoDeps = realDeps()): Promise<{ uid: string; documents: number } | { uid: string; busy: true }> {
  const { db, auth } = deps;
  const uid = await resolveDemoUid(db, auth);
  await ensureDesignated(db, uid);
  const documents = await resetWithLock(db, auth, uid, now);
  return documents === null ? { uid, busy: true } : { uid, documents };
}

export type DailyDemoResult = "not_set_up" | "reset" | "unchanged" | "busy" | "failed";

// The daily cron's part: reset only if there is something to undo (used since the last reset and now
// idle). Never throws.
export async function resetDemoIfNeeded(now = Date.now(), deps?: DemoDeps): Promise<DailyDemoResult> {
  try {
    const { db, auth } = deps ?? realDeps();
    const state = await loadState(db);
    if (!state.uid) return "not_set_up"; // nobody has opened the demo since this shipped
    if (!isResettableDemo(await loadAccount(db, state.uid))) return "not_set_up";
    if (!shouldResetDemo(state, now)) return "unchanged";
    const documents = await resetWithLock(db, auth, state.uid, now);
    return documents === null ? "busy" : "reset";
  } catch (err) {
    console.error("[demo] daily reset failed", err);
    return "failed";
  }
}
