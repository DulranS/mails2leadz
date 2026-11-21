"use client";

// Head office's royalty inbox. Each site it trusts has its own key: a key is shown once when it is made, and only its SHA-256 hash is kept.
// Revoking a site stops its statements at once. Each statement waits here until confirmed; confirming books its royalty as income once.
// Owner and manager only.
import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, orderBy, limit, query, setDoc, updateDoc } from "firebase/firestore";
import { Badge, Button, Card, EmptyState, Field, Input, Label } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { getFirebase } from "@/lib/firebase";
import { periodEnd } from "@/lib/monthClose";
import { formatMoney } from "@/lib/format";
import { SITE_KEY_PREFIX, isSiteId } from "@/lib/royaltyInbox";

interface Statement { id: string; sourceName: string; period: string; currency: string; royaltyDue: number; status: string; rows: { location: string; sales: number; ratePct: number; royalty: number }[] }
interface SiteRow { id: string; label?: string; keyHash?: string; revokedAt?: number; createdAt?: number }

function newSiteKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `${SITE_KEY_PREFIX}${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function RoyaltyInbox() {
  const { businessId } = useAuth();
  const { addExpense, expenses, settings } = useData();
  const toast = useToast();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [siteId, setSiteId] = useState("");
  const [label, setLabel] = useState("");
  const [shownKey, setShownKey] = useState<{ siteId: string; key: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    const { db } = getFirebase();
    const unsubSites = onSnapshot(collection(db, "users", businessId, "royaltyInboxSites"), (snap) => setSites(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SiteRow))));
    const q = query(collection(db, "users", businessId, "royaltyStatements"), orderBy("receivedAt", "desc"), limit(100));
    const unsubStatements = onSnapshot(q, (snap) => setStatements(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Statement))));
    return () => { unsubSites(); unsubStatements(); };
  }, [businessId]);

  async function makeKey(id: string, name: string) {
    if (!businessId) return;
    const key = newSiteKey();
    try {
      const { db } = getFirebase();
      await setDoc(doc(db, "users", businessId, "royaltyInboxSites", id), { label: name.trim().slice(0, 120) || id, keyHash: await sha256Hex(key), createdAt: Date.now() });
      setShownKey({ siteId: id, key });
      toast.success("Key made", "Copy it now: it is shown once and cannot be read again");
    } catch (err) {
      toast.error("Couldn't make the key", toastableErrorMessage(err));
    }
  }

  async function addSite() {
    const id = siteId.trim();
    if (!isSiteId(id)) return toast.error("Check the site", "Enter the business ID of the site, as it appears on its Royalties tab.");
    await makeKey(id, label);
    setSiteId("");
    setLabel("");
  }

  async function revoke(s: SiteRow) {
    if (!businessId || !window.confirm(`Revoke ${s.label ?? s.id}? Its statements stop being accepted at once.`)) return;
    try {
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", businessId, "royaltyInboxSites", s.id), { revokedAt: Date.now(), keyHash: "" });
    } catch (err) {
      toast.error("Couldn't revoke it", toastableErrorMessage(err));
    }
  }

  async function confirm(s: Statement) {
    if (!businessId) return;
    setBusy(s.id);
    try {
      const name = `Royalty income: ${s.sourceName} (${s.period})`;
      // Book the income once: if it is already in the books (an earlier try got that far), do not add it again.
      if (!expenses.some((e) => e.name === name)) {
        await addExpense({ name, amount: s.royaltyDue, category: "Other overhead", kind: "revenue", isRecurring: false, recurrence: "none", startDate: periodEnd(s.period), paymentStatus: "paid" });
      }
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", businessId, "royaltyStatements", s.id), { status: "confirmed", decidedAt: Date.now(), incomeRecordedName: name });
      toast.success("Confirmed", `${formatMoney(s.royaltyDue, s.currency)} booked as income`);
    } catch (err) {
      toast.error("Couldn't confirm it", `${toastableErrorMessage(err)} Press again: nothing is booked twice.`);
    } finally {
      setBusy(null);
    }
  }

  async function decline(s: Statement) {
    if (!businessId || !window.confirm(`Decline the statement from ${s.sourceName} for ${s.period}? Nothing is booked.`)) return;
    try {
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", businessId, "royaltyStatements", s.id), { status: "declined", decidedAt: Date.now() });
    } catch (err) {
      toast.error("Couldn't decline it", toastableErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="text-sm font-medium">Sites that send you royalty statements</div>
        <div className="text-xs text-muted mt-1">Each site gets its own key. Give the key to that site, with your business ID, on its Royalties tab. A site&apos;s statements are accepted only while it has an active key.</div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end mt-3">
          <Field><Label>Site business ID</Label><Input value={siteId} onChange={(e) => setSiteId(e.target.value)} placeholder="from the site's Royalties tab" /></Field>
          <Field><Label>Name (optional)</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="Kandy branch" /></Field>
          <Button onClick={addSite} disabled={!siteId.trim()}>Make a key</Button>
        </div>
        {shownKey && (
          <div className="mt-3 rounded-md border border-line p-3 text-xs space-y-1">
            <div className="font-medium">Key for {shownKey.siteId}. Copy it now; it will not be shown again.</div>
            <div className="num break-all select-all">{shownKey.key}</div>
            <button onClick={() => setShownKey(null)} className="text-muted hover:text-fg min-h-[32px]">Done</button>
          </div>
        )}
        <div className="mt-4 space-y-2">
          {sites.length === 0 && <div className="text-xs text-muted">No sites yet.</div>}
          {sites.map((s) => (
            <div key={s.id} className="flex items-center gap-3 flex-wrap text-sm">
              <span className="font-medium">{s.label ?? s.id}</span>
              <span className="num text-xs text-muted">{s.id}</span>
              {s.revokedAt ? <Badge tone="default">revoked</Badge> : <Badge tone="good">active</Badge>}
              {!s.revokedAt && <button onClick={() => makeKey(s.id, s.label ?? s.id)} className="text-xs text-muted hover:text-fg min-h-[32px]">New key</button>}
              {!s.revokedAt && <button onClick={() => revoke(s)} className="text-xs text-muted hover:text-fg min-h-[32px]">Revoke</button>}
              {s.revokedAt && <button onClick={() => deleteDoc(doc(getFirebase().db, "users", businessId ?? "", "royaltyInboxSites", s.id))} className="text-xs text-muted hover:text-fg min-h-[32px]">Remove</button>}
            </div>
          ))}
        </div>
      </Card>
      {statements.length === 0 ? (
        <EmptyState title="No statements yet" body="When a site sends its royalty statement, it appears here to confirm. Nothing is booked until you confirm it." />
      ) : (
        <div className="space-y-2">
          {statements.map((s) => (
            <Card key={s.id} className="p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{s.sourceName}</span>
                <Badge>{s.period}</Badge>
                <Badge tone={s.status === "confirmed" ? "good" : s.status === "declined" ? "default" : "amber"}>{s.status}</Badge>
              </div>
              <div className="text-xs text-muted mt-1">Royalty <span className="num">{formatMoney(s.royaltyDue, s.currency)}</span> on {s.rows.length} location{s.rows.length === 1 ? "" : "s"}</div>
              {s.status === "pending" && (
                <div className="flex gap-3 mt-2">
                  <Button onClick={() => confirm(s)} disabled={busy === s.id}>{busy === s.id ? "Booking…" : "Confirm and book as income"}</Button>
                  <button onClick={() => decline(s)} className="text-xs text-muted hover:text-fg min-h-[32px]">Decline</button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <div className="text-xs text-muted">Currency: {settings.currency}. A confirmed statement is booked once for its site and month.</div>
    </div>
  );
}
