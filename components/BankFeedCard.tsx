"use client";

// Automatic bank feed (Plaid, v319): connect a bank through Plaid Link, then read its new transactions as unmatched statement lines.
// Reading never moves money; each line is still matched by a person on the Reconcile page. Owner only. Without the server keys the card
// says "not configured" and names the missing settings (by name, never value).
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import { Badge, Button, Card } from "@/components/ui";

const PLAID_LINK_SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

interface FeedItem {
  id: string;
  institutionName: string;
  accounts: Array<{ name: string; mask: string | null }>;
  lastSyncAt: number | null;
  lastSyncAdded: number | null;
  lastError: string | null;
}
interface FeedState {
  configured: boolean;
  missing: string[];
  items: FeedItem[];
}

type PlaidLinkHandler = { open: () => void };
type PlaidGlobal = { create: (cfg: { token: string; onSuccess: (publicToken: string, meta: { institution?: { name?: string } | null }) => void; onExit: () => void }) => PlaidLinkHandler };

function loadPlaidLink(): Promise<PlaidGlobal> {
  const w = window as unknown as { Plaid?: PlaidGlobal };
  if (w.Plaid) return Promise.resolve(w.Plaid);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PLAID_LINK_SCRIPT;
    s.async = true;
    s.onload = () => (w.Plaid ? resolve(w.Plaid) : reject(new Error("The bank picker didn't load. Try again.")));
    s.onerror = () => reject(new Error("The bank picker couldn't be reached. Check the connection and try again."));
    document.head.appendChild(s);
  });
}

export default function BankFeedCard() {
  const { user, businessId } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<FeedState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const call = useCallback(
    async (path: string, init?: { method?: string; body?: unknown }) => {
      if (!user) throw new Error("Sign in again to continue.");
      const idToken = await user.getIdToken();
      const res = await fetch(path, {
        method: init?.method ?? "GET",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, ...(businessId ? { [BUSINESS_ID_HEADER]: businessId } : {}) },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "The bank feed didn't respond. Try again.");
      return payload;
    },
    [user, businessId]
  );

  const refresh = useCallback(async () => {
    try {
      setState((await call("/api/bank-feed")) as FeedState);
      setError(null);
    } catch (err) {
      setError(toastableErrorMessage(err));
    }
  }, [call]);

  useEffect(() => {
    if (user && businessId) refresh();
  }, [user, businessId, refresh]);

  async function connect() {
    setBusy("connect");
    try {
      const { linkToken } = await call("/api/bank-feed/link-token", { method: "POST", body: {} });
      const Plaid = await loadPlaidLink();
      const handler = Plaid.create({
        token: linkToken,
        onExit: () => setBusy(null),
        onSuccess: async (publicToken, meta) => {
          try {
            const out = await call("/api/bank-feed/exchange", { method: "POST", body: { publicToken, institutionName: meta.institution?.name ?? "Bank" } });
            toast.success("Bank connected", `${out.accountCount} account${out.accountCount === 1 ? "" : "s"} linked. Read new transactions to bring them in.`);
            await refresh();
          } catch (err) {
            toast.error("Couldn't connect the bank", toastableErrorMessage(err));
          } finally {
            setBusy(null);
          }
        },
      });
      handler.open();
    } catch (err) {
      toast.error("Couldn't open the bank picker", toastableErrorMessage(err));
      setBusy(null);
    }
  }

  async function sync(itemId: string) {
    setBusy(itemId);
    try {
      const out = await call("/api/bank-feed/sync", { method: "POST", body: { itemId } });
      const parts = [`${out.added} new`, `${out.duplicates} already here`];
      if (out.skipped.pending) parts.push(`${out.skipped.pending} pending (later)`);
      if (out.skipped.otherCurrency) parts.push(`${out.skipped.otherCurrency} in another currency (not imported)`);
      toast.success("Bank read", parts.join(" · ") + (out.hasMore ? ". More to read: press again." : ""));
      await refresh();
    } catch (err) {
      toast.error("Couldn't read the bank", toastableErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <div className="text-sm font-medium">Automatic bank feed</div>
        {state ? (
          <Badge tone={state.configured ? "good" : "default"}>{state.configured ? "Set up on this server" : "Not configured"}</Badge>
        ) : null}
      </div>
      <div className="text-xs text-muted mb-3">
        Brings your bank&apos;s transactions into Reconcile automatically, read-only: nothing is sent or paid. Each one still needs matching by you.
      </div>
      {error && <div className="text-xs text-bad mb-2">{error}</div>}
      {state && !state.configured && (
        <div className="text-xs mb-2">
          Not configured. The operator needs to set {state.missing.join(", ")} on the server before a bank can be connected. Keys are never shown here.
        </div>
      )}
      {state?.configured && (
        <>
          {state.items.length === 0 ? (
            <div className="text-xs text-muted mb-2">No bank connected yet.</div>
          ) : (
            <div className="space-y-2 mb-3">
              {state.items.map((it) => (
                <div key={it.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="text-fg">{it.institutionName}</div>
                    <div className="text-muted">
                      {it.accounts.map((a) => `${a.name}${a.mask ? ` ••${a.mask}` : ""}`).join(", ") || "No accounts"}
                      {it.lastSyncAt ? ` · last read ${new Date(it.lastSyncAt).toLocaleString()} (${it.lastSyncAdded ?? 0} new)` : " · not read yet"}
                    </div>
                    {it.lastError && <div className="text-bad">{it.lastError}</div>}
                  </div>
                  <Button variant="ghost" onClick={() => sync(it.id)} disabled={busy !== null}>
                    {busy === it.id ? "Reading…" : "Read new transactions"}
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Button onClick={connect} disabled={busy !== null}>{busy === "connect" ? "Opening…" : "Connect a bank"}</Button>
        </>
      )}
    </Card>
  );
}
