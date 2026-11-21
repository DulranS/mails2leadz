// Two-step sign-in (v319): the pure helpers behind the Account page's authenticator-app card (components/MfaCard.tsx). Pure, so it is tested
// without Firebase. Firebase's own error codes are turned into plain words; the raw code never reaches the page.

export const MFA_FACTOR_NAME = "Authenticator app";

// A six-digit code from the authenticator app, nothing else.
export const isValidOtp = (code: string) => /^\d{6}$/.test(code.trim());

// What the person sees for a Firebase multi-factor error. The operator-side case says what to switch on, without any key or value.
export function mfaErrorMessage(code: string | undefined | null): string {
  const c = code ?? "";
  if (c.includes("auth/operation-not-allowed")) {
    return "Two-step sign-in isn't switched on for this server yet. The operator needs to enable multi-factor sign-in in the Firebase console first.";
  }
  if (c.includes("auth/requires-recent-login")) return "Sign in again, then set up two-step sign-in.";
  if (c.includes("auth/invalid-verification-code") || c.includes("auth/invalid-multi-factor-session")) {
    return "That code is wrong or has expired. Use the newest code in your authenticator app and try again.";
  }
  if (c.includes("auth/second-factor-already-in-use") || c.includes("auth/maximum-second-factor-count-exceeded")) {
    return "This account already has the maximum two-step sign-in methods. Remove one first.";
  }
  return "Two-step sign-in couldn't be changed. Try again.";
}

// One line for the card: how many authenticator apps are linked, and when the first was added.
export function mfaStatusLine(factors: { displayName?: string | null; enrollmentTime?: string | null }[]): string {
  if (!factors.length) return "Two-step sign-in is off. Turn it on to protect this account with a code from your authenticator app.";
  const first = factors[0];
  const when = first.enrollmentTime ? ` since ${new Date(first.enrollmentTime).toLocaleDateString("en-GB")}` : "";
  return `Two-step sign-in is on (${first.displayName || MFA_FACTOR_NAME}${when}).`;
}

// The name shown for a linked factor, from what Firebase holds for it.
export const mfaFactorName = (f: { displayName?: string | null }) => f.displayName || MFA_FACTOR_NAME;
