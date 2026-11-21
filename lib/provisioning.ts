"use client";

// Admin-side business-owner provisioning — the only way a new top-level
// account (a new business, owned by a fresh login) gets created. There is
// deliberately no public self-serve signup (see app/login/page.tsx and
// app/admin/new-business/page.tsx): every account is created by whoever runs
// the business and handed to the customer as an email address with a "set
// your password" link — never a password an admin typed in on someone
// else's behalf.
//
// The whole activation happens on the SERVER (app/api/admin/provision, Admin
// SDK, admin passcode required): the login, the business, the trial date, the
// plan and price, the lead's "provisioned" mark and the branded welcome email
// with the set-password link — in one request, so nothing can be left half
// done. What stays here is a single safety net: if the server could not send
// the welcome email (email not configured, or the provider was down), Firebase's
// own password-reset email is triggered from the browser instead, so the customer
// ALWAYS gets a way in. sendPasswordResetEmail needs no signed-in user, so the
// admin's own session is never touched.
import { sendPasswordResetEmail } from "firebase/auth";
import { getFirebase } from "@/lib/firebase";

export interface ProvisionInput {
  email: string;
  ownerName: string;
  businessName?: string;
  // Optional: start as a trial of this many days.
  trialDays?: number | null;
  // Optional: a plan id from lib/pricing.ts and its billing cycle. The server looks the
  // price up itself.
  plan?: string | null;
  billingCycle?: "monthly" | "annual";
  // Optional: the trial request this activation answers — marked "provisioned" server-side.
  requestId?: string | null;
  // The admin passcode already verified by the panel's unlock screen; the
  // server checks it again on this request (client checks are not a gate).
  passcode: string;
}

export interface ProvisionResult {
  uid: string;
  email: string;
  // How the customer is being told: "branded" = our welcome email (with the set-password
  // link) went out; "firebase" = it couldn't, so Firebase's password-reset email was sent
  // instead; "none" = neither could be sent (the admin must pass on the sign-in details).
  welcomeVia: "branded" | "firebase" | "none";
  // Why our own welcome email didn't go (shown to the admin so the fix is obvious). Null when it did.
  welcomeError: string | null;
  trialEndsAt: string | null;
  trialDays: number | null;
  plan: string | null;
  billingCycle: "monthly" | "annual" | null;
}

export async function provisionBusinessOwner({
  email,
  ownerName,
  businessName,
  trialDays,
  plan,
  billingCycle,
  requestId,
  passcode,
}: ProvisionInput): Promise<ProvisionResult> {
  const res = await fetch("/api/admin/provision", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-passcode": passcode },
    body: JSON.stringify({ email, ownerName, businessName, trialDays, plan, billingCycle, requestId }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    uid?: string;
    email?: string;
    welcome?: "sent" | "not_configured" | "failed" | "no_owner";
    welcomeError?: string | null;
    trialEndsAt?: string | null;
    trialDays?: number | null;
    plan?: string | null;
    billingCycle?: "monthly" | "annual" | null;
    error?: string;
    code?: string;
  };
  if (!res.ok || !data.uid || !data.email) {
    throw Object.assign(new Error(data.error ?? "Provisioning failed."), { code: data.code });
  }

  let welcomeVia: ProvisionResult["welcomeVia"] = "branded";
  if (data.welcome !== "sent") {
    const auth = getFirebase().auth;
    try {
      await sendPasswordResetEmail(auth, data.email, { url: `${window.location.origin}/login`, handleCodeInApp: false });
      welcomeVia = "firebase";
    } catch {
      // The usual reason is that this site's domain isn't under Firebase → Authentication → Settings →
      // Authorized domains, which makes Firebase refuse the "continue" address. That address is only a
      // convenience, so try once without it before giving up.
      try {
        await sendPasswordResetEmail(auth, data.email);
        welcomeVia = "firebase";
      } catch {
        welcomeVia = "none";
      }
    }
  }
  return {
    uid: data.uid,
    email: data.email,
    welcomeVia,
    welcomeError: data.welcomeError ?? null,
    trialEndsAt: data.trialEndsAt ?? null,
    trialDays: data.trialDays ?? null,
    plan: data.plan ?? null,
    billingCycle: data.billingCycle ?? null,
  };
}
