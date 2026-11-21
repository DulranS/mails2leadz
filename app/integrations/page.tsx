"use client";

// Integrations (owner only): fill in the keys for the outside services the business uses. Secret values are written once and then
// shown only with their last four characters. Leaving a secret box empty keeps the saved value; "Remove keys" clears a service.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { collection, deleteDoc, doc, onSnapshot } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import {
  INTEGRATION_CATEGORY_LABEL, INTEGRATION_PROVIDERS, INTEGRATION_STATUS_LABEL, displayValue, integrationStatus, isEncryptedValue,
  type IntegrationProvider, type SavedIntegration,
} from "@/lib/integrations";
import { isCheckable } from "@/lib/integrationTest";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import { Badge, Button, Card, Field, Input, Label, PageHeader, TableCardSkeleton } from "@/components/ui";
import AutomationsCard from "@/components/AutomationsCard";
import LeadApiHelp from "@/components/LeadApiHelp";
import BankFeedCard from "@/components/BankFeedCard";
import HmrcCard from "@/components/HmrcCard";

export default function IntegrationsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner"]);
  const { businessId, user } = useAuth();
  const { settings } = useData();
  const toast = useToast();
  const [saved, setSaved] = useState<Record<string, SavedIntegration>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    const { db } = getFirebase();
    return onSnapshot(collection(db, "users", businessId, "integrations"), (snap) => {
      const next: Record<string, SavedIntegration> = {};
      snap.docs.forEach((d) => {
        next[d.id] = d.data() as SavedIntegration;
      });
      setSaved(next);
      setLoaded(true);
    });
  }, [businessId]);

  const grouped = useMemo(() => {
    const map = new Map<string, IntegrationProvider[]>();
    for (const p of INTEGRATION_PROVIDERS) map.set(p.category, [...(map.get(p.category) ?? []), p]);
    return [...map.entries()];
  }, []);

  if (guardLoading || !allowed) return null;
  if (!loaded) return <TableCardSkeleton />;

  return (
    <>
      <PageHeader title="Integrations" />
      <Card className="mb-5">
        <div className="text-sm">
          Add the keys for any service the business uses. Nothing is sent to an outside service until it is switched on, and only the owner can see these keys.
          Keys are never shown back in full after you save them.
        </div>
      </Card>
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wide text-muted mb-2">Automations</div>
        <AutomationsCard />
      </div>
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wide text-muted mb-2">Banking</div>
        <BankFeedCard />
      </div>
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wide text-muted mb-2">Tax</div>
        <HmrcCard currency={settings.currency} />
      </div>
      {grouped.map(([cat, list]) => (
        <div key={cat} className="mb-6">
          <div className="text-xs uppercase tracking-wide text-muted mb-2">{INTEGRATION_CATEGORY_LABEL[cat as IntegrationProvider["category"]]}</div>
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((p) => (
              <ProviderCard key={p.id} provider={p} saved={saved[p.id]} userName={user?.email ?? "Owner"} businessId={businessId ?? ""} onToast={toast} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function ProviderCard({
  provider,
  saved,
  userName,
  businessId,
  onToast,
}: {
  provider: IntegrationProvider;
  saved: SavedIntegration | undefined;
  userName: string;
  businessId: string;
  onToast: ReturnType<typeof useToast>;
}) {
  const status = integrationStatus(provider, saved);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<boolean>(saved?.enabled ?? false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    setEnabled(saved?.enabled ?? false);
  }, [saved?.enabled]);

  // Asks the server to make one read-only call with the saved key. The result is stored on the service and shown below.
  async function testConnection() {
    if (!user) return;
    setTesting(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/integrations/test", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, ...(businessId ? { [BUSINESS_ID_HEADER]: businessId } : {}) },
        body: JSON.stringify({ provider: provider.id }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Couldn't test the connection.");
      if (payload.ok) onToast.success(`${provider.name} connected`, payload.message);
      else onToast.error(`${provider.name} not connected`, payload.message);
    } catch (err) {
      onToast.error("Couldn't test", toastableErrorMessage(err));
    }
    setTesting(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // The server encrypts the secret fields before they are stored (lib/secretBox.ts); the page never writes keys itself.
      if (!user) throw new Error("Sign in again to save the keys.");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/integrations/save", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, ...(businessId ? { [BUSINESS_ID_HEADER]: businessId } : {}) },
        body: JSON.stringify({ provider: provider.id, values: draft, enabled, userName }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Couldn't save the keys.");
      setDraft({});
      onToast.success(`${provider.name} saved`, payload.enabled ? "Switched on." : "Fill in the required keys to switch it on.");
    } catch (err) {
      onToast.error("Couldn't save", toastableErrorMessage(err));
    }
    setBusy(false);
  }

  async function removeKeys() {
    if (!window.confirm(`Remove the ${provider.name} keys? Balancr will stop using this service until you add them again.`)) return;
    setBusy(true);
    try {
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", businessId, "integrations", provider.id));
      setDraft({});
      onToast.success(`${provider.name} keys removed`);
    } catch (err) {
      onToast.error("Couldn't remove the keys", toastableErrorMessage(err));
    }
    setBusy(false);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <div className="text-sm font-medium">{provider.name}</div>
        <Badge tone={status === "ready" ? "good" : status === "partly_set_up" ? "amber" : "default"}>{INTEGRATION_STATUS_LABEL[status]}</Badge>
      </div>
      <div className="text-xs text-muted mb-3">{provider.purpose}</div>
      <form onSubmit={submit} className="space-y-3">
        {provider.fields.map((f) => {
          const current = saved?.values?.[f.key];
          return (
            <Field key={f.key}>
              <Label>
                {f.label}
                {f.required ? "" : " (optional)"}
                {f.secret && current ? ` · saved: ${isEncryptedValue(current) ? `••••${saved?.hints?.[f.key] ?? ""}` : displayValue(f, current)}` : ""}
              </Label>
              <Input
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                maxLength={300}
                value={f.secret ? draft[f.key] ?? "" : draft[f.key] ?? current ?? ""}
                placeholder={f.secret ? (current ? "Leave empty to keep the saved key" : "Paste the key") : f.placeholder}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
              />
            </Field>
          );
        })}
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 accent-amber" />
          Switched on (only takes effect once the required keys are saved)
        </label>
        {provider.id === "lead_api" && (
          <LeadApiHelp businessId={businessId || null} draftKey={draft.apiKey} onGenerate={(k) => setDraft({ ...draft, apiKey: k })} />
        )}
        {isCheckable(provider.id) && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="text-muted">
              {saved?.lastTest ? (
                <>
                  Last test: {saved.lastTest.message} <span className="text-muted">({new Date(saved.lastTest.at).toLocaleString()})</span>
                </>
              ) : (
                "Not tested yet."
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={testConnection}
              disabled={testing || busy || status === "not_set_up" || status === "partly_set_up"}
            >
              {testing ? "Testing…" : "Test connection"}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          {saved?.values && Object.keys(saved.values).length > 0 ? (
            <Button type="button" variant="danger" onClick={removeKeys} disabled={busy}>Remove keys</Button>
          ) : <span />}
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Card>
  );
}
