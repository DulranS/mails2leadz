// Defaults for the OPTIONAL environment variables, in one place, so leaving them unset never switches a
// feature off when a sensible value is already available. Pure (takes `env`), so scripts/verify-env-defaults.ts
// proves it offline. Variables that genuinely cannot be defaulted (the Firebase keys, ADMIN_PASSCODE, the
// Resend key and verified sender, the AI key) are NOT handled here: see .env.local.example for which is which.

type Env = Record<string, string | undefined>;

// The public address of this deployment, no trailing slash, or "" when nothing is known.
// Order: NEXT_PUBLIC_SITE_URL, then the production domain Vercel sets by itself on every deployment.
export function configuredSiteUrl(env: Env = process.env): string {
  const explicit = (env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const vercel = (env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return vercel ? `https://${vercel}` : "";
}

// Where "a lead came in", feedback, the morning digest and provider alerts go. ADMIN_NOTIFICATION_EMAIL when set,
// otherwise the public support address you already publish (it is your inbox), otherwise "" (nowhere to send).
export function adminInbox(env: Env = process.env): string {
  const own = (env.ADMIN_NOTIFICATION_EMAIL ?? "").trim();
  if (own) return own;
  const support = (env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim();
  return support.includes("@") ? support : "";
}
