// Server only. The steps every inbound lead takes (the website form and the lead API), done with the Admin SDK so they work
// without a signed-in user. The rules are in lib/leadIntake.ts; this file only reads and writes.
import type { DocumentReference } from "firebase-admin/firestore";
import { chooseOwner, findDuplicateId, openCountsByOwner, webhookUrlProblem, type MemberLike } from "@/lib/leadIntake";
import type { AutomationSettings } from "@/lib/types";

// The member a new inbound lead goes to when "give each new lead to the person with the fewest open leads" is on. Otherwise none.
export async function pickOwner(base: DocumentReference, a: Required<AutomationSettings>): Promise<{ uid: string; name: string } | undefined> {
  if (!a.autoAssignInbound) return undefined;
  const membersSnap = await base.collection("members").where("active", "==", true).get();
  const members: MemberLike[] = membersSnap.docs.map((d) => {
    const x = d.data();
    return {
      uid: d.id,
      name: String(x.name ?? x.displayName ?? x.email ?? "Team member"),
      role: String(x.role ?? ""),
      active: x.active === true,
    };
  });
  const eligible = members.filter((m) => m.role === "owner" || m.role === "manager" || m.role === "staff");
  if (eligible.length === 0) return undefined;
  const uids = eligible.map((m) => m.uid).slice(0, 30); // Firestore's "in" takes up to 30 values
  const leadsSnap = await base.collection("leads").where("ownerUid", "in", uids).get();
  const counts = openCountsByOwner(leadsSnap.docs.map((d) => ({ ownerUid: d.data().ownerUid, stage: String(d.data().stage ?? "") })));
  const pick = chooseOwner(members, counts);
  return pick ? { uid: pick.uid, name: pick.name } : undefined;
}

// The lead already on file that shares a phone or email key with this one (up to 10 keys are checked).
export async function findDuplicate(base: DocumentReference, keys: string[]): Promise<{ id: string; notes?: string } | undefined> {
  if (keys.length === 0) return undefined;
  const snap = await base.collection("leads").where("contactKeys", "array-contains-any", keys.slice(0, 10)).limit(10).get();
  const docs = snap.docs.map((d) => ({ id: d.id, contactKeys: (d.data().contactKeys ?? []) as string[], notes: d.data().notes as string | undefined }));
  const id = findDuplicateId(docs, keys);
  return id ? docs.find((d) => d.id === id) : undefined;
}

// The same external id already filed (a calling tool that retries). Undefined when there is none.
export async function findByExternalId(base: DocumentReference, externalId: string | undefined): Promise<string | undefined> {
  if (!externalId) return undefined;
  const snap = await base.collection("leads").where("externalId", "==", externalId).limit(1).get();
  return snap.docs[0]?.id;
}

// Post a new lead to the owner's webhook (e.g. a Zapier catch hook). Best effort, no redirects followed, five-second limit.
// Returns whether the address accepted it. Nothing is retried; a failed post is not a lost lead, which is still on the Leads page.
export async function pushLeadWebhook(url: string | undefined, payload: Record<string, unknown>): Promise<boolean> {
  if (!url || webhookUrlProblem(url)) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    console.error("[lead webhook] post failed", err);
    return false;
  }
}

// Tell the owner about a lead that came in. Best effort: a failed alert never loses the lead itself.
export async function notifyOwner(base: DocumentReference, n: { title: string; message: string; entityId: string; type: string; entityType?: string }) {
  try {
    await base.collection("notifications").add({
      type: n.type,
      priority: "high",
      title: n.title,
      message: n.message,
      entityId: n.entityId,
      entityType: n.entityType ?? "lead",
      isRead: false,
      createdAt: Date.now(),
    });
  } catch (err) {
    console.error("[lead intake] owner alert failed", err);
  }
}
