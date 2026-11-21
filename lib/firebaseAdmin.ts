// Server-only. Route handlers under app/api/ai/* use this to (a) verify
// the Firebase ID token the client sends instead of trusting a
// client-supplied businessId, and (b) read/write the same
// users/{businessId}/... tree the client SDK uses, via the Admin SDK's
// elevated (rules-bypassing) access. This mirrors exactly what
// contexts/AuthContext.tsx does client-side (memberships/{uid} →
// businessId → users/{businessId}/members/{uid} → role), so a request can
// never see or act on a different business than the signed-in user
// actually belongs to.

import { BUSINESS_ID_HEADER, pickRequestBusiness } from "./activeBusiness";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import type { Role, Settings, Product } from "./types";
import type { AiChatMessage, AiChatSession, AiMemoryNote } from "./aiTypes";
import { AI_MEMORY_MAX_NOTES } from "./aiTypes";
import { DEFAULT_SETTINGS } from "./types";
import { cacheGet, cacheSet, cacheDelete, maybeSweep } from "./serverCache";
import { resolveAccess, type AccessInput } from "./accountAccess";
import { accountKind, type AccountKind, type KindInput } from "./guardrails";

let app: App | undefined;

function getAdminApp(): App {
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0]!;
    return app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Private keys are usually stored as an env var with literal "\n"
  // sequences (most hosts don't allow real newlines in env values) — this
  // un-escapes them back into a real PEM before handing it to the SDK.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin isn't configured: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY " +
        "(a service account key — Firebase Console → Project settings → Service accounts → Generate new private key) " +
        "as server-side environment variables. These are separate from the NEXT_PUBLIC_FIREBASE_* client config and " +
        "must never be exposed to the browser."
    );
  }

  app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return app;
}

let adminDb: Firestore | undefined;

// Mirrors lib/firebase.ts's client-side `ignoreUndefinedProperties: true` —
// see the comment there for why. Every optional field on a ProposedEntry
// (matchedProductId, customer, supplier, paymentMethod, notes...) is a
// literal `undefined` whenever the model doesn't fill it in — routine, not
// an edge case: a proposed sale/purchase for a product name that didn't
// match anything in the catalog always comes through with
// matchedProductId undefined. The Admin SDK rejects that outright by
// default ("Cannot use \"undefined\" as a Firestore value"), which crashed
// the whole chat turn on the appendMessage write in app/api/ai/chat/route.ts
// instead of just... not writing that one field. The client SDK's init
// already had this covered; the Admin SDK instance the AI routes use never
// did. `settings()` can only be called once per Firestore instance and
// before any other method runs on it, hence the module-level cache below
// instead of calling it fresh on every getAdminDb() invocation.
export function getAdminDb(): Firestore {
  if (adminDb) return adminDb;
  adminDb = getFirestore(getAdminApp());
  adminDb.settings({ ignoreUndefinedProperties: true });
  return adminDb;
}

// Admin-side Firebase Auth (create users, etc.). Used by the passcode-gated
// provisioning route (app/api/admin/provision) so that creating a customer's
// account never has to happen from a browser with public sign-up rights.
export function getAdminAuth() {
  return getAuth(getAdminApp());
}

// ---------------------------------------------------------------------------
// Auth + business resolution
// ---------------------------------------------------------------------------

// Also reused (as-is, not renamed) for the daily usage-limit rejection in
// lib/aiUsageLimit.ts (status 429) — same shape (message + HTTP status,
// caught and passed straight through by lib/apiError.ts), and "this
// request is being refused before it did anything" is the same kind of
// error whether the reason is auth or quota. Not worth a second class for
// one extra status code.
export class AiAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "AiAuthError";
  }
}

export interface AiRequestContext {
  db: Firestore;
  uid: string;
  businessId: string;
  role: Role;
  memberName: string | null;
  // Admin account (pass 308): capped at the standard daily AI limit, never billed. See lib/guardrails.ts aiLimitsFor.
  adminAccount?: boolean;
  // Which kind of account this is (shared public demo / trial / standard) — drives the per-kind
  // limits in lib/guardrails.ts. Computed from meta/account, which no client can write.
  accountKind: AccountKind;
}

// The AI Assistant is scoped to Owner/Manager, the same line drawn for
// Reports/Profitability/Statements elsewhere in this app (see
// lib/permissions.ts). Staff never has read access to cost prices or
// margins, and the assistant can answer questions and propose entries that
// touch both — so rather than build a second, narrower permission surface
// just for this feature, it stays behind the same trust boundary the rest
// of the app already uses for financial visibility.
const ALLOWED_ROLES: Role[] = ["owner", "manager"];

// v316: a route can name the roles it accepts (for example the operations event route also takes staff, for payments only,
// and checks that itself). Without the option the AI Assistant rule applies, so every other caller is unchanged.
export async function requireAiContext(req: Request, opts: { roles?: Role[] } = {}): Promise<AiRequestContext> {
  const allowed = opts.roles ?? ALLOWED_ROLES;
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) throw new AiAuthError("Missing Authorization header.", 401);

  let uid: string;
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    throw new AiAuthError("Your session has expired — please sign in again.", 401);
  }

  const db = getAdminDb();
  const membershipSnap = await db.collection("memberships").doc(uid).get();
  const pointerBusinessId = (membershipSnap.data()?.businessId as string | undefined) ?? undefined;
  if (!pointerBusinessId) throw new AiAuthError("No business found for this account.", 403);
  // A login that belongs to several businesses names the one it is showing in a header (lib/activeBusiness.ts). It is
  // only a request: everything below (active member record, role, suspension) is checked against THAT business.
  const businessId = pickRequestBusiness(pointerBusinessId, req.headers.get(BUSINESS_ID_HEADER));

  const [memberSnap, accountSnap] = await Promise.all([
    db.collection("users").doc(businessId).collection("members").doc(uid).get(),
    db.doc(`users/${businessId}/meta/account`).get(),
  ]);
  const member = memberSnap.data() as { role?: Role; active?: boolean; name?: string } | undefined;
  if (!member || member.active === false || !member.role) {
    throw new AiAuthError("Your account no longer has access to this business.", 403);
  }
  if (!allowed.includes(member.role)) {
    throw new AiAuthError(opts.roles ? "That action is not available to your role." : "The AI Assistant is available to Owners and Managers.", 403);
  }

  // Suspension was previously enforced only in components/AppShell.tsx —
  // a UI gate, which is no gate at all for anything that can send an HTTP
  // request with a valid ID token. Every business-facing API route in this
  // app funnels through this function (chat, auto-confirm, sessions, aging
  // report, stock levels, invoices, recurring generation), so checking it
  // once here is what makes "suspended" actually mean suspended rather
  // than "the navigation is hidden". It matters most for /api/ai/chat,
  // where an un-suspended-in-practice account keeps spending real model
  // API money after the point someone decided it shouldn't.
  //
  // An absent meta/account doc means a normal, never-suspended business —
  // most accounts never get one written at all (see AccountStatus in
  // lib/types.ts) — so absence is explicitly treated as not suspended,
  // never as a failure.
  //
  // Expired trials are locked here too, computed from trialEndsAt by the
  // same function the browser uses (lib/accountAccess.ts) — so an expired
  // trial can't keep spending AI money through direct API calls either.
  const access = resolveAccess(accountSnap.data() as AccessInput | undefined);
  if (access.locked) {
    throw new AiAuthError(
      access.kind === "trial_expired"
        ? "Your free trial has ended. Get in touch to continue — your data is safe."
        : access.kind === "renewal_overdue"
        ? "Your renewal is overdue. Get in touch to continue — your data is safe."
        : "This account is currently suspended. Whoever manages your billing can reactivate it.",
      403
    );
  }

  return {
    db,
    uid,
    businessId,
    role: member.role,
    memberName: member.name ?? null,
    accountKind: accountKind(accountSnap.data() as KindInput | undefined),
    adminAccount: (accountSnap.data() as { adminAccount?: boolean } | undefined)?.adminAccount === true,
  };
}

// ---------------------------------------------------------------------------
// Business context — a compact snapshot handed to the model as part of the
// (cached) system prompt. Deliberately small: id/name/sku/type only, never
// full ledger rows, so the fixed per-turn cost of "what can this business
// sell/buy" stays tiny regardless of how many products exist.
// ---------------------------------------------------------------------------

export interface CompactProduct {
  id: string;
  name: string;
  sku: string;
  type: Product["type"];
  price?: number; // the usual selling price, if set (v262: so support can answer price questions)
  isOffer?: boolean; // a fixed-price offer or bundle with its own cost recipe (a package of items or services)
  reorderLevel?: number; // the stock level that triggers a reorder, if set
}

// Settings and the active product catalog are read on *every* AI Assistant
// chat turn but change rarely — a currency setting or a new product gets
// added maybe a few times a week, not every message. A 30s in-process
// cache means a burst of messages in one conversation costs one Firestore
// read of each instead of one per turn, while staying short enough that an
// edit made mid-session shows up well within the same conversation. See
// lib/serverCache.ts for why this is a plain in-memory cache rather than a
// hosted one.
const BUSINESS_CONTEXT_TTL_MS = 30_000;

export async function loadBusinessContext(
  db: Firestore,
  businessId: string
): Promise<{ settings: Settings; products: CompactProduct[] }> {
  const cacheKey = `businessContext:${businessId}`;
  const cached = cacheGet<{ settings: Settings; products: CompactProduct[] }>(cacheKey);
  if (cached) return cached;

  const [settingsSnap, productsSnap] = await Promise.all([
    db.doc(`users/${businessId}/meta/settings`).get(),
    db.collection(`users/${businessId}/products`).where("active", "==", true).get(),
  ]);

  const settings = { ...DEFAULT_SETTINGS, ...(settingsSnap.data() as Partial<Settings> | undefined) };
  const products: CompactProduct[] = productsSnap.docs.map((d) => {
    const data = d.data() as Product;
    return {
      id: d.id,
      name: data.name,
      sku: data.sku,
      type: data.type,
      price: data.defaultSellPrice,
      isOffer: Array.isArray(data.recipeLines) && data.recipeLines.length > 0,
      reorderLevel: data.minStockLevel,
    };
  });

  const result = { settings, products };
  cacheSet(cacheKey, result, BUSINESS_CONTEXT_TTL_MS);
  maybeSweep();
  return result;
}

// ---------------------------------------------------------------------------
// Long-term memory — a small, capped, fully user-visible list of durable
// facts (see lib/aiTypes.ts). Oldest note is dropped once the cap is hit,
// so this can never grow into an unbounded (and unboundedly expensive)
// context block.
// ---------------------------------------------------------------------------

// Same in-process TTL cache as loadBusinessContext, for the same reason:
// memory notes are read every chat turn but only ever written by the
// remember_note tool, which is used sparingly (see aiChat's REMEMBER_TOOL
// description). Explicitly invalidated in addMemoryNote below rather than
// left to expire, so a note saved mid-conversation is visible to the very
// next turn instead of waiting out the TTL.
const MEMORY_NOTES_TTL_MS = 30_000;

export async function loadMemoryNotes(db: Firestore, businessId: string): Promise<AiMemoryNote[]> {
  const cacheKey = `memoryNotes:${businessId}`;
  const cached = cacheGet<AiMemoryNote[]>(cacheKey);
  if (cached) return cached;

  const snap = await db.collection(`users/${businessId}/aiMemory`).orderBy("createdAt", "asc").get();
  const notes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AiMemoryNote, "id">) }));
  cacheSet(cacheKey, notes, MEMORY_NOTES_TTL_MS);
  maybeSweep();
  return notes;
}

export async function addMemoryNote(db: Firestore, businessId: string, text: string): Promise<void> {
  const trimmed = text.trim().slice(0, 240);
  if (!trimmed) return;
  const col = db.collection(`users/${businessId}/aiMemory`);
  await col.add({ text: trimmed, createdAt: Date.now() });

  const snap = await col.orderBy("createdAt", "asc").get();
  if (snap.size > AI_MEMORY_MAX_NOTES) {
    const excess = snap.docs.slice(0, snap.size - AI_MEMORY_MAX_NOTES);
    await Promise.all(excess.map((d) => d.ref.delete()));
  }
  cacheDelete(`memoryNotes:${businessId}`);
}

// ---------------------------------------------------------------------------
// Chat sessions — server-authoritative history. The client only ever sends
// the newest message; the server reads back the recent tail of the same
// session from Firestore rather than trusting a client-supplied transcript,
// so history can't be tampered with and survives across devices/reloads.
// ---------------------------------------------------------------------------

const RECENT_MESSAGE_LIMIT = 16; // how many prior turns get sent back to the model, for cost/latency control — full history still lives in Firestore for the user to scroll

export async function loadRecentMessages(
  db: Firestore,
  businessId: string,
  sessionId: string
): Promise<AiChatMessage[]> {
  const snap = await db
    .collection(`users/${businessId}/aiChatSessions/${sessionId}/messages`)
    .orderBy("createdAt", "desc")
    .limit(RECENT_MESSAGE_LIMIT)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AiChatMessage, "id">) })).reverse();
}

export async function ensureSession(
  db: Firestore,
  businessId: string,
  sessionId: string,
  uid: string,
  memberName: string | null,
  firstMessageText: string
): Promise<void> {
  const ref = db.doc(`users/${businessId}/aiChatSessions/${sessionId}`);
  const snap = await ref.get();
  if (snap.exists) return;
  const title = firstMessageText.trim().slice(0, 60) || "New conversation";
  const session: Omit<AiChatSession, "id"> = {
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdByUid: uid,
    createdByName: memberName ?? undefined,
  };
  await ref.set(session);
}

export async function appendMessage(
  db: Firestore,
  businessId: string,
  sessionId: string,
  message: AiChatMessage
): Promise<void> {
  const { id, ...rest } = message;
  await db.doc(`users/${businessId}/aiChatSessions/${sessionId}/messages/${id}`).set(rest);
  await db.doc(`users/${businessId}/aiChatSessions/${sessionId}`).update({
    updatedAt: Date.now(),
    lastMessagePreview: message.text.slice(0, 120),
  });
}

// Any active member of a business (any role), for routes whose data is not business-private (for example the public
// exchange-rate reference). Checks the same sign-in and membership as requireAiContext, without the owner/manager limit.
// Suspension and expired-trial rules are not needed here: the route reads and writes nothing about the business.
export async function requireSignedIn(req: Request): Promise<{ uid: string; businessId: string }> {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) throw new AiAuthError("Sign in to continue.", 401);
  let uid: string;
  try {
    uid = (await getAuth(getAdminApp()).verifyIdToken(idToken)).uid;
  } catch {
    throw new AiAuthError("Your session has expired — please sign in again.", 401);
  }
  const db = getAdminDb();
  const pointer = (await db.collection("memberships").doc(uid).get()).data()?.businessId as string | undefined;
  if (!pointer) throw new AiAuthError("No business found for this account.", 403);
  const businessId = pickRequestBusiness(pointer, req.headers.get(BUSINESS_ID_HEADER));
  const member = (await db.collection("users").doc(businessId).collection("members").doc(uid).get()).data() as { role?: Role; active?: boolean } | undefined;
  if (!member || member.active === false || !member.role) throw new AiAuthError("Your account no longer has access to this business.", 403);
  return { uid, businessId };
}
