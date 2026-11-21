"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Input, Label } from "@/components/ui";
import TryDemoButton from "@/components/TryDemoButton";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [view, setView] = useState<"signin" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(readableAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block py-1 font-display text-2xl font-bold tracking-tight">Balancr</Link>
          <div className="text-sm text-muted mt-1">Inventory, invoicing &amp; financial statements — in one place.</div>
        </div>

        {view === "signin" ? (
          <>
            <div className="bg-panel border border-line rounded-lg p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.com"
                  />
                </div>
                <div>
                  <Label>Password</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                      className="pr-16"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 right-0 px-3 text-xs text-muted hover:text-fg"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                {error && <div role="alert" className="text-xs text-bad bg-bad/10 border border-bad/30 rounded-md px-3 py-2">{error}</div>}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? "Please wait…" : "Sign in"}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setView("reset");
                  }}
                  className="w-full text-center text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-0"
                >
                  Forgot your password?
                </button>
              </form>
            </div>
            {/* Just browsing? One tap into the shared sample business, no typing. */}
            <div className="mt-3">
              <TryDemoButton
                label="Just looking? Try it now — no signup"
                className="inline-flex items-center justify-center min-h-[44px] w-full px-3.5 py-2 rounded-md text-sm font-medium bg-transparent border border-line text-fg hover:border-muted transition-all active:scale-[0.98]"
              />
            </div>
            <p className="text-xs text-muted text-center mt-4">
              Your data is private to your business — visible only to you and anyone you&apos;ve
              added to your team.
            </p>
            <p className="text-xs text-muted text-center mt-2">
              New here?{" "}
              <Link href="/request-trial" className="text-fg hover:underline">
                Request a free trial
              </Link>
              . Accounts are set up by our team, not created here. Once yours is ready, use the
              link we email you, or &ldquo;Forgot your password?&rdquo; above, to sign in for the
              first time.
            </p>
          </>
        ) : (
          <ResetPasswordView onBack={() => setView("signin")} />
        )}
      </div>
    </div>
  );
}

function ResetPasswordView({ onBack }: { onBack: () => void }) {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    // Deliberately shown whether or not the address has an account —
    // Firebase's own error for "no such user" would otherwise let anyone
    // typing emails into this box find out which ones are real businesses
    // on the platform. See lib/provisioning.ts for the rest of the
    // account-creation story this reset link is part of.
    try {
      await sendPasswordReset(email);
    } catch {
      // Intentionally ignored — see comment above.
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  return (
    <div className="bg-panel border border-line rounded-lg p-6">
      {sent ? (
        <div className="text-sm text-fg text-center py-2">
          If <span className="font-medium">{email}</span> has an account, a link to set a new
          password is on its way — check spam if it doesn&apos;t show up shortly.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="text-sm text-muted -mt-1 mb-1">
            Enter the email your account was set up with and we&apos;ll send a link to set a
            password — this is also how a new login is activated for the first time.
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@business.com"
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <button type="button" onClick={onBack} className="w-full text-center text-xs text-muted hover:text-fg mt-4">
        Back to sign in
      </button>
    </div>
  );
}

function readableAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/user-not-found": "No account with that email.",
    "auth/wrong-password": "Wrong password.",
    "auth/invalid-credential": "Email or password is incorrect.",
  };
  return map[code] ?? "Something went wrong. Please try again.";
}
