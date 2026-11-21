"use client";

// Read-only status of the outside services this app can use. Keys are added in the hosting provider's environment settings,
// never here, and this card only shows whether each one is on and which setting is still missing (names, never values).
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import type { ConnectionStatus } from "@/lib/connections";
import { Badge, Card } from "@/components/ui";

export default function ConnectionsCard() {
  const { user, businessId } = useAuth();
  const [items, setItems] = useState<ConnectionStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/connections", {
          headers: { authorization: `Bearer ${idToken}`, ...(businessId ? { [BUSINESS_ID_HEADER]: businessId } : {}) },
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || "Couldn't load connections.");
        if (!cancelled) setItems(payload.connections as ConnectionStatus[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load connections.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, businessId]);

  return (
    <Card className="max-w-md">
      <div className="text-sm font-medium mb-1">Connections</div>
      <div className="text-xs text-muted mb-3">
        Outside services the app can use. Keys are added in your hosting settings, not in this app. Anything you have not connected
        just stays off.
      </div>
      {error && <div className="text-xs text-bad">{error}</div>}
      {!items && !error && <div className="text-xs text-muted">Checking…</div>}
      <div className="space-y-3">
        {items?.map((c) => (
          <div key={c.id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm">{c.name}</div>
              <div className="text-[11px] text-muted">{c.unlocks}</div>
              {!c.configured && c.missing.length > 0 && (
                <div className="text-[11px] text-muted mt-0.5">To turn on, add: {c.missing.join(", ")}</div>
              )}
            </div>
            <Badge tone={c.configured ? "good" : "default"}>{c.configured ? "Connected" : "Not connected"}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
