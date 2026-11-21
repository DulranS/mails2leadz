// The customer-facing half of manual billing: when a trial ends, a renewal
// is overdue or an account is suspended, the app tells the owner to "get in
// touch" — this is how they actually do it. Deliberately just two links
// (WhatsApp / email) read from public env vars, not a ticketing system:
// NEXT_PUBLIC_ is correct here because a support contact is MEANT to be
// public. Renders nothing when neither is configured, so the existing
// wording stands on its own in that case.
import { toWhatsAppNumber } from "@/lib/share";

export default function SupportContact({
  className = "",
  prefill = "Hi, I'd like help with my Balancr account.",
}: {
  className?: string;
  prefill?: string;
}) {
  const wa = toWhatsAppNumber(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "");
  const email = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim();
  // Optional promise, e.g. "We reply within one working day (Mon-Fri, 9am-6pm)".
  // Public by design. Only ever shown next to a real contact link.
  const responseTime = (process.env.NEXT_PUBLIC_SUPPORT_RESPONSE_TIME ?? "").trim();
  if (!wa && !email) return null;

  const link = "text-amber-soft hover:underline underline-offset-2";
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm ${className}`}>
      {responseTime && <span className="basis-full text-center text-xs text-muted">{responseTime}</span>}
      {wa && (
        <a href={`https://wa.me/${wa}?text=${encodeURIComponent(prefill)}`} target="_blank" rel="noreferrer" className={link}>
          Message us on WhatsApp
        </a>
      )}
      {email && (
        <a href={`mailto:${email}?subject=${encodeURIComponent("Balancr account")}`} className={link}>
          {email}
        </a>
      )}
    </div>
  );
}
