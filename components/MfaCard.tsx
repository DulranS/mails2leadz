"use client";

// Two-step sign-in for the Account page (v319). Firebase's TOTP second factor: the owner scans a key into an authenticator app, then
// confirms it with a six-digit code. Turning it on needs the multi-factor setting switched on in the Firebase console; until then the
// card says so instead of failing silently (see lib/mfa.ts).
import { useState } from "react";
import { multiFactor, TotpMultiFactorGenerator, type TotpSecret } from "firebase/auth";
import { getFirebase } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Card, Field, Input, Label } from "@/components/ui";
import { isValidOtp, mfaErrorMessage, mfaFactorName, mfaStatusLine, MFA_FACTOR_NAME } from "@/lib/mfa";

export default function MfaCard() {
  const { user } = useAuth();
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, bump] = useState(0);
  if (!user) return null;

  const factors = multiFactor(user).enrolledFactors;

  async function startSetup() {
    if (!user) return;
    setBusy(true);
    setMsg(null);
    try {
      const session = await multiFactor(user).getSession();
      setSecret(await TotpMultiFactorGenerator.generateSecret(session));
    } catch (err) {
      setMsg(mfaErrorMessage((err as { code?: string }).code));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    if (!user || !secret) return;
    if (!isValidOtp(code)) {
      setMsg("Enter the six-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code.trim());
      await multiFactor(user).enroll(assertion, MFA_FACTOR_NAME);
      setSecret(null);
      setCode("");
      setMsg("Two-step sign-in is on. You will be asked for a code at your next sign-in.");
      bump((n) => n + 1);
    } catch (err) {
      setMsg(mfaErrorMessage((err as { code?: string }).code));
    } finally {
      setBusy(false);
    }
  }

  async function removeFactor(index: number) {
    if (!user) return;
    if (!window.confirm("Turn off two-step sign-in for this account? The account will be protected by the password only.")) return;
    setBusy(true);
    try {
      await multiFactor(user).unenroll(multiFactor(user).enrolledFactors[index]);
      setMsg("Two-step sign-in is off.");
      bump((n) => n + 1);
    } catch (err) {
      setMsg(mfaErrorMessage((err as { code?: string }).code));
    } finally {
      setBusy(false);
    }
  }

  const qr = secret ? secret.generateQrCodeUrl(user.email ?? "account", "Balancr") : "";

  return (
    <Card className="max-w-md">
      <div className="text-sm font-medium mb-1">Two-step sign-in</div>
      <div className="text-xs text-muted mb-3">{mfaStatusLine(factors)}</div>

      {factors.length > 0 && (
        <ul className="text-xs space-y-2 mb-3">
          {factors.map((f, i) => (
            <li key={f.uid} className="flex items-center justify-between gap-2">
              <span>{mfaFactorName(f)}</span>
              <Button variant="ghost" onClick={() => removeFactor(i)} disabled={busy}>Remove</Button>
            </li>
          ))}
        </ul>
      )}

      {factors.length === 0 && !secret && (
        <Button onClick={startSetup} disabled={busy}>Set up an authenticator app</Button>
      )}

      {secret && (
        <div className="space-y-3">
          <div className="text-xs text-muted">
            Add this account to your authenticator app. Scan the QR code, or type the key in by hand.
          </div>
          <a href={qr} className="text-xs text-info break-all hover:underline">Open the setup link</a>
          <div className="text-xs font-mono break-all">{secret.secretKey}</div>
          <Field>
            <Label htmlFor="mfa-code">Six-digit code from the app</Label>
            <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Button onClick={confirmSetup} disabled={busy}>Confirm and turn on</Button>
        </div>
      )}

      {msg && <div className="text-xs mt-3" role="status">{msg}</div>}
    </Card>
  );
}
