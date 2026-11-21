// Server wrapper: reads the real email rule (TRIAL_EMAIL_DOMAINS, see lib/emailPolicy.ts) so the form's
// hint never tells people "use Gmail" after the owner has widened the allowed domains.
import RequestTrialForm from "./RequestTrialForm";
import { trialEmailConfig } from "@/lib/emailPolicy";

export const dynamic = "force-dynamic";

export default function RequestTrialPage() {
  const cfg = trialEmailConfig();
  const gmailOnly = cfg.allowedDomains !== null && cfg.allowedDomains.size > 0 && [...cfg.allowedDomains].every((d) => d === "gmail.com" || d === "googlemail.com");
  return <RequestTrialForm gmailOnly={gmailOnly} />;
}
