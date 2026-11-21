// Empirical check for the free-account guardrails: the shared public demo and trial accounts.
//   - pure rules (lib/guardrails.ts): account kinds, AI limits, when the demo is reset
//   - the UI permission clamp (lib/permissions.ts)
//   - the DESTRUCTIVE paths in lib/demoServer.ts, run against an in-memory stand-in for Firestore
//     and Firebase Auth: it must refuse to wipe anything that isn't the demo, wipe everything else
//     in the demo, survive a deleted/changed login, and never mint a token for a non-demo account
//   - source-structure checks that the rules, routes and client are wired as designed
//
// What this CANNOT prove: Firestore/Storage security rules are checked structurally only (this
// environment has no emulator), and nothing here talks to real Firebase.
//
// Run: npx tsx scripts/verify-demo-guardrails.ts

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import {
  DEMO_AI_DAILY_TURNS,
  DEMO_AI_MAX_MESSAGE_CHARS,
  DEMO_AI_PER_IP_DAILY_TURNS,
  DEMO_IDLE_RESET_MS,
  DEMO_MIN_RESET_GAP_MS,
  TRIAL_AI_DAILY_TURNS,
  accountKind,
  aiLimitsFor,
  isDesignatableDemo,
  isResettableDemo,
  shouldResetDemo,
} from "../lib/guardrails";
import { DEMO_BLOCKED_PERMISSIONS, can, setDemoRestrictions } from "../lib/permissions";
import { buildDemoWrites } from "../lib/demoSeedServer";
import { DEMO_STATE_DOC, DemoError, openDemoSession, resetDemoIfNeeded, resetDemoNow, type DemoDeps } from "../lib/demoServer";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

// ---- account kinds ---------------------------------------------------------------------------
{
  assert(accountKind(undefined) === "standard" && accountKind({}) === "standard", "no account doc = standard");
  assert(accountKind({ publicDemo: true, complimentary: true, plan: "Demo" }) === "public_demo", "publicDemo flag = public demo");
  assert(accountKind({ complimentary: true, plan: "Demo" }) === "standard", "a PRIVATE demo (no flag) is not the shared sandbox");
  assert(accountKind({ trialEndsAt: "2026-10-16" }) === "trial", "an end date nobody has paid for = trial");
  assert(accountKind({ trialEndsAt: "2026-10-16", lastPaidAt: 1 }) === "standard", "paid = no longer a trial, even with a stale end date");
  assert(accountKind({ trialEndsAt: "2026-10-16", complimentary: true }) === "standard", "complimentary is never a trial");
  assert(accountKind({ publicDemo: true, trialEndsAt: "2026-10-16" }) === "public_demo", "the demo flag wins over a trial date");
}

// ---- AI limits ---------------------------------------------------------------------------------
{
  const demo = aiLimitsFor("public_demo");
  const trial = aiLimitsFor("trial");
  const std = aiLimitsFor("standard");
  assert(demo.dailyTurns === DEMO_AI_DAILY_TURNS && demo.perIpDailyTurns === DEMO_AI_PER_IP_DAILY_TURNS, "demo has a shared daily cap AND a per-IP cap");
  assert(demo.maxMessageChars === DEMO_AI_MAX_MESSAGE_CHARS && demo.maxMessageChars < std.maxMessageChars, "demo messages are shorter");
  assert(!demo.allowRememberNote && !demo.allowCreateProduct, "demo can't persist notes or products via the assistant");
  assert(trial.dailyTurns === TRIAL_AI_DAILY_TURNS && trial.dailyTurns < std.dailyTurns, "trial gets a lower daily default than a paying business");
  assert(trial.allowRememberNote && trial.allowCreateProduct && trial.perIpDailyTurns === 0, "trial keeps the full assistant (it is evaluating it)");
  assert(aiLimitsFor("trial", 200).dailyTurns === 200 && aiLimitsFor("standard", 0).dailyTurns === 0, "an admin's per-business override still applies to trial/standard (0 = unlimited)");
  assert(aiLimitsFor("public_demo", 100000).dailyTurns === DEMO_AI_DAILY_TURNS, "...but never to the shared demo");
  assert(demo.dailyTurns < trial.dailyTurns && trial.dailyTurns < std.dailyTurns, "limits tighten as accounts get freer: demo < trial < standard");
}

// ---- when the demo is reset ----------------------------------------------------------------------
{
  const t0 = 1_800_000_000_000;
  const min = 60 * 1000;
  assert(shouldResetDemo({}, t0), "never reset before -> reset (first run; also retires the old shared password)");
  assert(!shouldResetDemo({ lastResetAt: t0, lastMintAt: t0 - 5 }, t0 + 40 * min), "reset and untouched since -> leave it alone");
  assert(!shouldResetDemo({ lastResetAt: t0, lastMintAt: t0 + 1 * min }, t0 + 20 * min), "used 19 minutes ago -> a visitor may still be in it, don't reset");
  assert(shouldResetDemo({ lastResetAt: t0, lastMintAt: t0 + 1 * min }, t0 + 1 * min + DEMO_IDLE_RESET_MS), "used, then idle past the session cap -> reset");
  assert(!shouldResetDemo({ lastResetAt: t0, lastMintAt: t0 + 1 }, t0 + DEMO_MIN_RESET_GAP_MS - 1), "never twice inside the minimum gap, however the clocks look");
  assert(DEMO_IDLE_RESET_MS > 30 * min, "idle window is longer than the 30-minute demo session cap");
}

// ---- the sandbox test --------------------------------------------------------------------------
{
  assert(isResettableDemo({ publicDemo: true, complimentary: true, plan: "Demo" }), "flagged + Demo + complimentary = resettable");
  assert(!isResettableDemo({ publicDemo: true, complimentary: true, plan: "Growth — monthly" }), "a flagged account on a paid plan name is NOT resettable");
  assert(!isResettableDemo({ publicDemo: true, plan: "Demo" }), "not complimentary (i.e. billable) is NOT resettable");
  assert(!isResettableDemo({ complimentary: true, plan: "Demo" }), "an unflagged demo is NOT resettable (only designated ones are)");
  assert(!isResettableDemo({ trialEndsAt: "2026-10-16" }) && !isResettableDemo(undefined), "a trial customer / empty account is never resettable");
  assert(isDesignatableDemo({ complimentary: true, plan: " demo " }), "designation accepts Demo + complimentary (case/space tolerant)");
  assert(!isDesignatableDemo({ plan: "Demo" }) && !isDesignatableDemo({ complimentary: true, plan: "Starter" }), "designation refuses anything that isn't a free Demo");
}

// ---- UI permission clamp -------------------------------------------------------------------------
{
  setDemoRestrictions(false);
  const before = DEMO_BLOCKED_PERMISSIONS.map((p) => can("owner", p));
  assert(before.every(Boolean), "normal owner keeps every permission the clamp lists");
  setDemoRestrictions(true);
  assert(DEMO_BLOCKED_PERMISSIONS.every((p) => !can("owner", p)), "in the demo the owner loses delete / correct / team / settings / payroll");
  assert(can("owner", "manage:sales") && can("owner", "view:settings") && can("owner", "view:reports") && can("owner", "create:sale"), "...but can still look at everything and log sales (that is the demo)");
  assert(!can(null, "view:dashboard"), "no role still means no access");
  setDemoRestrictions(false);
  assert(can("owner", "delete:records"), "turning the clamp off restores a normal account (nothing leaks between sessions)");
}

// ---- seed content ------------------------------------------------------------------------------
{
  const writes = buildDemoWrites("demo-uid", { email: "demo@example.com", publicDemo: true }, 1, "2026-10-03");
  const acct = writes.find((w) => w.path === "users/demo-uid/meta/account")!;
  assert(acct.data.publicDemo === true && acct.data.complimentary === true && acct.data.plan === "Demo", "public demo's account doc carries all three markers");
  const priv = buildDemoWrites("p", { email: "p@example.com" }, 1, "2026-10-03").find((w) => w.path === "users/p/meta/account")!;
  assert(priv.data.publicDemo === undefined, "a private demo made by the admin does NOT get the public-demo flag");
  const settings = writes.find((w) => w.path === "users/demo-uid/meta/settings")!;
  assert(!("logoUrl" in settings.data) || !settings.data.logoUrl, "re-seeded settings carry no logo (a visitor's uploaded image is dropped)");
  assert(writes.some((w) => w.path === "memberships/demo-uid") && writes.some((w) => w.path === "users/demo-uid/members/demo-uid"), "seed restores the owner's membership pointer and member doc");
  assert(writes.every((w) => w.path.startsWith("users/demo-uid/") || w.path === "memberships/demo-uid"), "seeding writes only inside this one business");
}

// ---- in-memory Firestore + Auth stand-ins ----------------------------------------------------------
type Doc = Record<string, unknown>;
function makeFake() {
  const store = new Map<string, Doc>();
  const deletes: string[] = [];
  const ref = (path: string): any => ({
    path,
    id: path.split("/").pop()!,
    async get() {
      return { exists: store.has(path), data: () => store.get(path) };
    },
    async set(data: Doc, opts?: { merge?: boolean }) {
      store.set(path, opts?.merge ? { ...(store.get(path) ?? {}), ...data } : { ...data });
    },
    async delete() {
      deletes.push(path);
      store.delete(path);
    },
    async listCollections() {
      const prefix = path + "/";
      const names = new Set<string>();
      for (const k of store.keys()) if (k.startsWith(prefix)) names.add(k.slice(prefix.length).split("/")[0]);
      return [...names].map((n) => colRef(`${path}/${n}`));
    },
  });
  const colRef = (path: string): any => ({
    path,
    id: path.split("/").pop()!,
    async listDocuments() {
      const prefix = path + "/";
      const ids = new Set<string>();
      for (const k of store.keys()) if (k.startsWith(prefix)) ids.add(k.slice(prefix.length).split("/")[0]);
      return [...ids].map((i) => ref(`${path}/${i}`));
    },
    where(field: string, _op: string, value: unknown) {
      return {
        async get() {
          const docs = [...store.entries()]
            .filter(([k, v]) => k.startsWith(prefix_(path)) && k.split("/").length === path.split("/").length + 1 && v[field] === value)
            .map(([k]) => ({ id: k.split("/").pop()!, ref: ref(k) }));
          return { docs };
        },
      };
    },
  });
  const prefix_ = (p: string) => p + "/";
  const db: any = {
    doc: ref,
    collection: colRef,
    async recursiveDelete(r: { path: string }) {
      for (const k of [...store.keys()]) if (k === r.path || k.startsWith(r.path + "/")) { deletes.push(k); store.delete(k); }
    },
    batch() {
      const ops: [string, Doc][] = [];
      return { set: (r: { path: string }, d: Doc) => ops.push([r.path, d]), commit: async () => ops.forEach(([p, d]) => store.set(p, { ...d })) };
    },
    async runTransaction(fn: (tx: any) => Promise<unknown>) {
      return fn({
        get: (r: { get(): Promise<unknown> }) => r.get(),
        set: (r: { set(d: Doc, o?: { merge?: boolean }): Promise<void> }, d: Doc, o?: { merge?: boolean }) => void r.set(d, o),
      });
    },
  };

  const users = new Map<string, { uid: string; email?: string; disabled?: boolean; password?: string }>();
  const tokens: { uid: string; claims: Record<string, unknown> }[] = [];
  const authCalls: string[] = [];
  const auth: any = {
    async getUser(uid: string) {
      const u = users.get(uid);
      if (!u) throw Object.assign(new Error("nf"), { code: "auth/user-not-found" });
      return u;
    },
    async getUserByEmail(email: string) {
      const u = [...users.values()].find((x) => x.email === email);
      if (!u) throw Object.assign(new Error("nf"), { code: "auth/user-not-found" });
      return u;
    },
    async updateUser(uid: string, patch: Record<string, unknown>) {
      authCalls.push(`update:${Object.keys(patch).join(",")}`);
      users.set(uid, { ...users.get(uid)!, ...patch } as any);
    },
    async createUser(u: { uid: string; email: string; password: string }) {
      authCalls.push("create");
      users.set(u.uid, { ...u });
    },
    async createCustomToken(uid: string, claims: Record<string, unknown>) {
      tokens.push({ uid, claims });
      return `token-for-${uid}`;
    },
  };
  return { store, deletes, db, users, tokens, auth, authCalls, deps: { db, auth } as DemoDeps };
}

const NOW = 1_800_000_000_000;
const MIN = 60 * 1000;
const DEMO_EMAIL_FOR_TEST = "admin@gmail.com"; // the default in lib/demoAccount.ts

async function main() {
  // ---- a business that is NOT a demo must never be wiped or given a token -----------------------
  {
    const f = makeFake();
    f.users.set("cust", { uid: "cust", email: DEMO_EMAIL_FOR_TEST });
    f.store.set("users/cust/meta/account", { plan: "Growth — monthly", trialEndsAt: "2026-10-16" });
    f.store.set("users/cust/sales/s1", { total: 100 });
    f.store.set("users/cust/sales/s2", { total: 200 });
    let err: unknown;
    try {
      await openDemoSession(NOW, f.deps);
    } catch (e) {
      err = e;
    }
    assert(err instanceof DemoError && err.status === 409, "the demo email pointing at a customer is refused (409), not served");
    assert(f.tokens.length === 0, "NO sign-in token is minted for a non-demo account");
    assert(f.deletes.length === 0 && f.store.has("users/cust/sales/s1") && f.store.has("users/cust/sales/s2"), "and nothing of the customer's was deleted");
    let err2: unknown;
    try {
      await resetDemoNow(NOW, f.deps);
    } catch (e) {
      err2 = e;
    }
    assert(err2 instanceof DemoError && f.deletes.length === 0, "an admin reset aimed at a customer is also refused with nothing deleted");

    // Even if somebody hand-sets the flag but it's on a paid plan, the wipe still refuses.
    f.store.set("users/cust/meta/account", { plan: "Growth — monthly", publicDemo: true });
    f.store.set(DEMO_STATE_DOC, { uid: "cust" });
    let err3: unknown;
    try {
      await resetDemoNow(NOW, f.deps);
    } catch (e) {
      err3 = e;
    }
    assert(err3 instanceof DemoError && f.deletes.length === 0 && f.store.has("users/cust/sales/s1"), "a flagged account that is on a paid plan can't be wiped either");
    assert((await resetDemoIfNeeded(NOW, f.deps)) === "not_set_up" && f.deletes.length === 0, "the daily pass also leaves it alone");
  }

  // ---- the real demo ------------------------------------------------------------------------------
  const f = makeFake();
  f.users.set("demo", { uid: "demo", email: DEMO_EMAIL_FOR_TEST, password: "old-shared-password" });
  f.store.set("users/demo/meta/account", { suspended: false, complimentary: true, plan: "Demo", notes: "x" });
  f.store.set("users/demo/meta/settings", { businessName: "Trashed by a visitor", logoUrl: "https://evil.example/x.png" });
  f.store.set("users/demo/sales/mine", { total: 1 });
  f.store.set("users/demo/customers/c1", { name: "rude name" });
  f.store.set("users/demo/invites/i1", { email: "troll@example.com" });
  f.store.set("users/demo/aiMemory/n1", { text: "remember this rubbish" });
  f.store.set("users/demo/aiChatSessions/s1/messages/m1", { text: "nested" });
  f.store.set("memberships/troll", { businessId: "demo" });
  f.store.set("memberships/innocent", { businessId: "someone-else" });
  f.store.set("users/someone-else/sales/keep", { total: 9 });

  const r1 = await openDemoSession(NOW, f.deps);
  assert(r1.reset === true && r1.token === "token-for-demo", "first visit after shipping: the demo is reset, then a token is minted");
  assert(f.tokens[0].uid === "demo" && f.tokens[0].claims.demo === true, "the token is for the demo uid and carries the demo claim");
  assert(f.store.get("users/demo/meta/account")?.publicDemo === true, "the account got designated as the public demo");
  assert(!f.store.has("users/demo/sales/mine") && !f.store.has("users/demo/customers/c1"), "the visitor-made records are gone");
  assert(!f.store.has("users/demo/invites/i1") && !f.store.has("users/demo/aiMemory/n1") && !f.store.has("users/demo/aiChatSessions/s1/messages/m1"), "invites, assistant memory and nested chat history are gone too");
  const settings = f.store.get("users/demo/meta/settings")!;
  assert(settings.businessName !== "Trashed by a visitor" && !settings.logoUrl, "settings (name, logo) are back to the originals");
  assert(!f.store.has("memberships/troll") && f.store.has("memberships/demo") && f.store.has("memberships/innocent"), "a stranger's pointer to the demo is removed; the owner's is restored; other businesses' pointers untouched");
  assert(f.store.has("users/someone-else/sales/keep"), "another business's data is untouched");
  assert([...f.store.keys()].filter((k) => k.startsWith("users/demo/sales/")).length > 0, "sample sales were written back");
  assert(f.authCalls.some((c) => c.includes("password")), "the old password was rotated (retires the one that used to be public)");
  const stateAfterReset = f.store.get(DEMO_STATE_DOC)!;
  assert(stateAfterReset.lastResetAt === NOW && stateAfterReset.lastMintAt === NOW && stateAfterReset.resetLockUntil === 0, "state recorded; the reset lock is released");

  // an immediate second visitor shares the same session (no reset under their feet)
  f.deletes.length = 0;
  const r2 = await openDemoSession(NOW + 2 * MIN, f.deps);
  assert(r2.reset === false && f.deletes.length === 0, "a second visitor 2 minutes later does NOT reset the demo under the first");

  // the troll does damage; the first person to come back after an idle gap gets a clean demo
  f.store.set("users/demo/sales/vandal", { total: 999999 });
  f.store.delete("users/demo/customers/c-keep");
  const r3 = await openDemoSession(NOW + 2 * MIN + DEMO_IDLE_RESET_MS + MIN, f.deps);
  assert(r3.reset === true && !f.store.has("users/demo/sales/vandal"), "after an idle gap the next visitor gets a clean demo again");

  // visitor deletes / changes the login itself
  f.users.delete("demo");
  const t = NOW + 3 * 60 * MIN;
  const r4 = await openDemoSession(t, f.deps);
  assert(f.users.has("demo") && f.users.get("demo")!.uid === "demo" && r4.token === "token-for-demo", "a deleted Firebase user is recreated with the SAME uid, and the visitor is let in");
  f.users.set("demo", { ...f.users.get("demo")!, email: "hijacked@example.com", disabled: true });
  f.authCalls.length = 0;
  const r5 = await openDemoSession(t + 5 * MIN, f.deps);
  assert(f.users.get("demo")!.disabled === false && f.users.get("demo")!.email === DEMO_EMAIL_FOR_TEST, "a disabled / re-addressed demo login is put back before the token is minted");
  assert(r5.token === "token-for-demo", "and the button still works");

  // the daily pass
  assert((await resetDemoIfNeeded(t + 6 * MIN, f.deps)) === "unchanged", "daily pass: nothing used since the last reset -> left alone");
  f.store.set("users/demo/sales/vandal2", { total: 5 });
  const last = f.store.get(DEMO_STATE_DOC)!;
  f.store.set(DEMO_STATE_DOC, { ...last, lastMintAt: (last.lastResetAt as number) + MIN });
  assert((await resetDemoIfNeeded((last.lastResetAt as number) + 4 * 60 * MIN, f.deps)) === "reset" && !f.store.has("users/demo/sales/vandal2"), "daily pass: used then idle -> reset");

  // a held lock means no second reset starts
  f.store.set(DEMO_STATE_DOC, { ...f.store.get(DEMO_STATE_DOC)!, resetLockUntil: t + 999 * 60 * MIN });
  const busy = await resetDemoNow(t + 10 * MIN, f.deps);
  assert("busy" in busy, "a reset already running makes a second one back off");

  // ---- source-structure checks ----------------------------------------------------------------------
  const ROOT = join(__dirname, "..");
  const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
  const stripComments = (s: string) => s.replace(/\/\/.*$/gm, "");

  const server = read("lib/demoServer.ts");
  const reset = server.slice(server.indexOf("export async function resetDemoBusiness"), server.indexOf("async function resetWithLock"));
  assert(reset.indexOf("isResettableDemo(") > -1 && reset.indexOf("isResettableDemo(") < reset.indexOf("recursiveDelete("), "the sandbox check runs BEFORE anything is deleted");
  assert(/d\.id !== "account"/.test(reset), "the wipe keeps meta/account, so the 'this is the demo' marker survives a crash mid-reset");
  const open = server.slice(server.indexOf("export async function openDemoSession"), server.indexOf("// Admin \"Reset demo now\""));
  assert(open.indexOf("ensureDesignated(") > -1 && open.indexOf("ensureDesignated(") < open.indexOf("createCustomToken("), "a token is only minted after the account is verified as a demo");
  assert(/createCustomToken\(uid, \{ demo: true \}\)/.test(open), "the token carries the demo claim");

  const noPassword = (rel: string) => !/adminsfr248|DEMO_PASSWORD/.test(read(rel).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""));
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      if (n === "node_modules" || n === ".next" || n === ".git") return [];
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mjs|js)$/.test(n) ? [p] : [];
    });
  // (This script is excluded from its own scan: it has to name the thing it is looking for.)
  const offenders = walk(ROOT).filter((p) => !p.endsWith("verify-demo-guardrails.ts") && /adminsfr248/.test(readFileSync(p, "utf8")));
  assert(offenders.length === 0, "the old public demo password appears nowhere in the code any more");
  assert(noPassword("lib/demoAccount.ts") && noPassword("components/TryDemoButton.tsx"), "no demo password constant is exported or imported");

  const auth = read("contexts/AuthContext.tsx");
  const signInDemo = auth.slice(auth.indexOf("signInDemo: async"), auth.indexOf("sendPasswordReset: async"));
  assert(/signInWithCustomToken\(/.test(signInDemo) && !/signInWithEmailAndPassword/.test(signInDemo), "the demo signs in with a server token, never a password");
  assert(/setDemoRestrictions\(isPublicDemo && !!user\)/.test(auth), "the UI clamp follows the server-set publicDemo flag");

  const rules = stripComments(read("firestore.rules"));
  const allows = [...rules.matchAll(/allow ([a-z, ]+): if ([^;]*);/g)].map((m) => ({ methods: m[1], expr: m[2].trim() }));
  const deleteRules = allows.filter((a) => /\bdelete\b/.test(a.methods));
  assert(deleteRules.length >= 25, `rules scan really found the delete rules (${deleteRules.length})`);
  assert(deleteRules.every((a) => a.expr === "false" || a.expr.includes("isPublicDemo(")), "EVERY delete rule is either `false` or refuses the public demo");
  assert(
    !allows.some((a) => /delete/.test(a.methods) && /update|create/.test(a.methods) && a.expr !== "false"),
    "no OPEN rule lumps delete in with create/update (so the demo guard can't be skipped); only `false` rules do"
  );
  const settingsRule = rules.slice(rules.indexOf("match /meta/settings"), rules.indexOf("match /meta/budgets"));
  assert(/allow write: if isOwner\(businessId\) && !isPublicDemo\(businessId\)/.test(settingsRule), "settings can't be edited in the demo");
  const membersInvites = rules.slice(rules.indexOf("match /members/{uid}"), rules.indexOf("match /auditLog/{docId}"));
  assert((membersInvites.match(/!isPublicDemo\(businessId\)/g) ?? []).length >= 5, "team members and invites can't be created or changed in the demo");
  const helper = rules.slice(rules.indexOf("function isPublicDemo"), rules.indexOf("function isPublicDemo") + 420);
  assert(helper.indexOf("exists(") > -1 && helper.indexOf("exists(") < helper.indexOf("get("), "isPublicDemo checks exists() before get(), so a business with no account doc isn't denied");
  const positive = [...rules.matchAll(/(.)isPublicDemo\(/g)].filter((m) => m[1] !== "!" && m[1] !== " ");
  assert(positive.length === 0, "isPublicDemo is only ever used negated, as an extra condition — it can deny more but never allow more");
  assert(!/allow [a-z, ]+: if (true|signedIn\(\));/.test(rules), "no rule is blanket-open");

  const storage = stripComments(read("storage.rules"));
  assert(!/\{fileName\}/.test(storage) && /logos\/\{businessId\}\/logo\.png/.test(storage), "storage: the logo path is pinned to logo.png (no unlimited uploads under random names)");

  const chat = read("app/api/ai/chat/route.ts");
  assert(/aiLimitsFor\(ctx\.accountKind\)/.test(chat) && /enforceAiDailyLimit\(db, businessId, settings, turnLimits\.dailyTurns\)/.test(chat), "chat applies the per-kind daily limit");
  assert(/demo-ai/.test(chat) && chat.indexOf('"demo-ai"') < chat.indexOf("enforceAiDailyLimit(db"), "chat checks the per-IP demo allowance before spending a shared turn");
  assert((chat.match(/toolsFor\(limits, /g) ?? []).length === 2, "both model calls use the filtered tool list");
  assert(/use\.name === "create_product" && !limits\.allowCreateProduct/.test(chat) && /use\.name === "remember_note" && !limits\.allowRememberNote/.test(chat), "the handlers refuse persisting tools in the demo even if the model asks");
  const price = read("app/api/ai/suggest-price/route.ts");
  assert(/aiLimitsFor\(accountKind/.test(price) && /demo-ai/.test(price), "suggest-price can't be used to get around the demo/trial caps");

  const daily = read("lib/dailyJob.ts");
  assert(/if \(!opts\.dryRun\) result\.demo = await resetDemoIfNeeded/.test(daily), "the daily job resets the demo if needed, and never on a dry run");
  const adminReset = read("app/api/admin/demo/reset/route.ts");
  assert(adminReset.indexOf("requireAdminPasscode") > -1 && adminReset.indexOf("requireAdminPasscode") < adminReset.indexOf("resetDemoNow"), "the admin reset requires the passcode first");
  const session = read("app/api/demo/session/route.ts");
  assert(session.indexOf("isRateLimited(") < session.indexOf("openDemoSession("), "the public session route rate limits before doing any work");
  assert(!/err\.message|error: String\(err/.test(session), "the public route never echoes an internal error to the visitor");

  if (process.exitCode === 1) console.error("\nSOME CHECKS FAILED");
  else console.log("\nALL CHECKS PASSED");
}

main().catch((e) => {
  console.error("FAIL: script crashed", e);
  process.exitCode = 1;
});
