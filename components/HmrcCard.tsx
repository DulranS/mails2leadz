"use client";

// Making Tax Digital for Income Tax (v319): connect the business to HMRC, save the National Insurance number and business ID, and send
// one quarter's figures. Sending needs the owner to tick "I confirm these figures", the server switch on, and a live connection; the
// server refuses otherwise and says why. Owner only. Without the HMRC settings the card says "Not configured" and names them.
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import { formatMoney } from "@/lib/format";
import { Badge, Button, Card, Field, Input, Label } from "@/components/ui";

interface Status {
  configured: boolean;
  missing: string[];
  submitEnabled: boolean;
  connected: boolean;
  hasBusiness: boolean;
  businessId: string | null;
  lastSubmission: { at: number; taxYear: string; index: number; turnover: number; expenses: number; status: "sent" | "failed"; reason?: string } | null;
}
interface Figures { taxYear: string; quarter: { from: string; to: string; label: string; index: number }; turnover: number; expenses: number; salesCount: number; expenseCount: number; submitEnabled: boolean }

export default function HmrcCard({ currency }: { currency: string }) {
  const { user, businessId } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nino, setNino] = useState("");
  const [hmrcBusiness, setHmrcBusiness] = useState("");
  const [busy, setBusy] = useState(false);
  const thisYear = new Date().getFullYear();
  const [taxYearStart, setTaxYearStart] = useState(String(new Date().getMonth() >= 3 ? thisYear : thisYear - 1));
  const [index, setIndex] = useState("1");
  const [figures, setFigures] = useState<Figures | null>(null);
  const [confirmed, setConfirmed] = useState(false);

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
      if (!res.ok) throw Object.assign(new Error(payload.error || "HMRC didn't respond. Try again."), { payload });
      return payload;
    },
    [user, businessId]
  );

  const refresh = useCallback(async () => {
    try {
      setStatus((await call("/api/hmrc/status")) as Status);
      setError(null);
    } catch (err) {
      setError(toastableErrorMessage(err));
    }
  }, [call]);

  useEffect(() => {
    if (user && businessId) refresh();
    const result = new URLSearchParams(window.location.search).get("hmrc");
    if (result === "connected") toast.success("HMRC connected", "You can now send a quarter.");
    else if (result === "expired") toast.error("The HMRC sign-in took too long", "Try connecting again.");
    else if (result === "denied" || result === "failed") toast.error("HMRC didn't connect", "Try connecting again.");
    else if (result === "not-configured") toast.error("HMRC isn't set up on this server yet", "The operator needs to add the HMRC settings.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, businessId, refresh]);

  async function saveProfile() {
    setBusy(true);
    try {
      await call("/api/hmrc/profile", { method: "POST", body: { nino, businessId: hmrcBusiness } });
      setNino("");
      setHmrcBusiness("");
      toast.success("Saved", "The National Insurance number and business ID are stored securely and not shown again.");
      await refresh();
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    try {
      const out = await call("/api/hmrc/connect", { method: "POST", body: {} });
      window.location.href = out.url;
    } catch (err) {
      toast.error("Couldn't start the HMRC sign-in", toastableErrorMessage(err));
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect HMRC? Balancr will stop using the HMRC link until you connect again. Nothing is sent to HMRC.")) return;
    setBusy(true);
    try {
      await call("/api/hmrc/disconnect", { method: "POST", body: {} });
      toast.success("Disconnected", "The HMRC link is switched off.");
      await refresh();
    } catch (err) {
      toast.error("Couldn't disconnect", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function loadFigures() {
    setBusy(true);
    setConfirmed(false);
    try {
      setFigures((await call(`/api/hmrc/quarter?taxYearStart=${encodeURIComponent(taxYearStart)}&index=${encodeURIComponent(index)}`)) as Figures);
    } catch (err) {
      toast.error("Couldn't load the figures", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    try {
      const out = await call("/api/hmrc/quarter", { method: "POST", body: { taxYearStart: Number(taxYearStart), index: Number(index), confirmed: true } });
      toast.success("Quarter sent to HMRC", `${out.taxYear}, ${out.quarter.label}`);
      setFigures(null);
      await refresh();
    } catch (err) {
      toast.error("Not sent", toastableErrorMessage(err));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <div className="text-sm font-medium">HMRC quarterly updates (Making Tax Digital)</div>
        {status ? <Badge tone={status.configured ? (status.connected ? "good" : "default") : "default"}>{!status.configured ? "Not configured" : status.connected ? "Connected" : "Not connected"}</Badge> : null}
      </div>
      <div className="text-xs text-muted mb-3">
        Sends each quarter&apos;s turnover and expenses for your self-employment business to HMRC. Nothing is sent without your confirmation.
      </div>
      {error && <div className="text-xs text-bad mb-2">{error}</div>}
      {status && !status.configured && (
        <div className="text-xs mb-2">Not configured. The operator needs to set {status.missing.join(", ")} on the server before HMRC can be connected.</div>
      )}
      {status?.configured && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field>
              <Label>National Insurance number{status.hasBusiness ? " (saved; enter again to change)" : ""}</Label>
              <Input value={nino} onChange={(e) => setNino(e.target.value)} maxLength={13} autoComplete="off" placeholder="AB123456C" />
            </Field>
            <Field>
              <Label>Self-employment business ID{status.businessId ? ` (saved: ${status.businessId})` : ""}</Label>
              <Input value={hmrcBusiness} onChange={(e) => setHmrcBusiness(e.target.value)} maxLength={20} autoComplete="off" placeholder="XAIS12345678910" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={saveProfile} disabled={busy || (!nino.trim() && !hmrcBusiness.trim())}>Save details</Button>
            {status.connected ? (
              <Button variant="danger" onClick={disconnect} disabled={busy}>Disconnect HMRC</Button>
            ) : (
              <Button onClick={connect} disabled={busy || !status.hasBusiness}>Connect to HMRC</Button>
            )}
          </div>
          {!status.hasBusiness && <div className="text-xs text-muted">Save the National Insurance number and business ID before connecting.</div>}

          <div className="border-t border-line pt-3 space-y-3">
            <div className="text-xs uppercase tracking-wide text-muted">Send a quarter</div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field>
                <Label>Tax year starting</Label>
                <Input type="number" value={taxYearStart} onChange={(e) => { setTaxYearStart(e.target.value); setFigures(null); }} min={2000} max={2100} />
              </Field>
              <Field>
                <Label>Quarter (1 to 4)</Label>
                <Input type="number" value={index} onChange={(e) => { setIndex(e.target.value); setFigures(null); }} min={1} max={4} />
              </Field>
              <div className="flex items-end"><Button variant="ghost" onClick={loadFigures} disabled={busy}>Show the figures</Button></div>
            </div>
            {figures && (
              <div className="space-y-2 text-xs">
                <div>
                  {figures.taxYear}, {figures.quarter.label}: turnover <span className="num">{formatMoney(figures.turnover, currency)}</span> from {figures.salesCount} sale{figures.salesCount === 1 ? "" : "s"}; expenses <span className="num">{formatMoney(figures.expenses, currency)}</span> from {figures.expenseCount} one-off expense{figures.expenseCount === 1 ? "" : "s"}.
                </div>
                <div className="text-muted">Check these against your books. Cost of goods and recurring expenses are not in the expenses figure, so it may be low.</div>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  <span>I confirm these figures for this quarter, and I want them sent to HMRC.</span>
                </label>
                <Button onClick={send} disabled={busy || !confirmed || !status.connected || !status.submitEnabled}>{busy ? "Sending…" : "Send this quarter to HMRC"}</Button>
                {!status.submitEnabled && <div className="text-muted">Sending is switched off on this server, so this button will not send anything.</div>}
                {!status.connected && <div className="text-muted">Connect to HMRC first.</div>}
              </div>
            )}
            {status.lastSubmission && (
              <div className="text-xs text-muted">
                Last quarter: {status.lastSubmission.taxYear}, quarter {status.lastSubmission.index}, {status.lastSubmission.status === "sent" ? "sent" : "not sent"} on {new Date(status.lastSubmission.at).toLocaleString()}{status.lastSubmission.reason ? `. ${status.lastSubmission.reason}` : ""}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
