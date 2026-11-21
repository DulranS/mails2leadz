"use client";

// The enquiry form a business puts on its website, Instagram bio or WhatsApp profile. No sign-in. A submission becomes a
// New lead in that business's Leads page; the business answers it, nothing is sent automatically.
import { useEffect, useState } from "react";
import { HOW_HEARD_OPTIONS } from "@/lib/leadPipeline";
import { useParams } from "next/navigation";

export default function EnquirePage() {
  const params = useParams<{ businessId: string }>();
  const businessId = params?.businessId ?? "";
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot: hidden from people, filled in by some bots
  const [howHeard, setHowHeard] = useState("");
  // Campaign tags from the link they followed (?utm_source=...&utm_campaign=...), read in the browser only.
  const [utm, setUtm] = useState<{ utm_source?: string; utm_campaign?: string }>({});
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setUtm({ utm_source: q.get("utm_source") ?? undefined, utm_campaign: q.get("utm_campaign") ?? undefined });
  }, []);

  // Social proof: the customer words the owner approved for display (cached at the edge; a failure simply shows nothing).
  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/public/testimonials?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.testimonials) setTestimonials(d.testimonials); })
      .catch(() => {});
  }, [businessId]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [testimonials, setTestimonials] = useState<{ quote: string; author: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/enquiry?businessId=${encodeURIComponent(businessId)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setLoadError(data.error || "This form is not available.");
        else setBusinessName(String(data.businessName ?? ""));
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load this form. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId,
          name,
          contact,
          message,
          website,
          howHeard,
          ...utm,
          referrer: document.referrer || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setSubmitError(data.error || "Couldn't send your enquiry. Try again.");
      else setSent(true);
    } catch {
      setSubmitError("Couldn't send your enquiry. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const title = businessName ? `Enquire with ${businessName}` : "Enquire";

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-md">
        {loadError ? (
          <>
            <h1 className="text-lg font-semibold">Enquiries unavailable</h1>
            <p className="text-sm text-muted mt-2">{loadError}</p>
          </>
        ) : sent ? (
          <>
            <h1 className="text-lg font-semibold">Thank you</h1>
            <p className="text-sm text-muted mt-2">
              {businessName || "The business"} has your enquiry and will reply to the number or email you gave.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-sm text-muted mt-1">Tell us what you need and how to reach you. We reply personally; nothing is ordered or charged from this form.</p>
            {testimonials.length > 0 && (
              <div className="mt-5 space-y-3">
                <div className="text-xs uppercase tracking-wide text-muted">What customers say</div>
                {testimonials.map((t, i) => (
                  <blockquote key={i} className="border-l-2 border-line pl-3 text-sm">
                    <p>&ldquo;{t.quote}&rdquo;</p>
                    <footer className="text-xs text-muted mt-1">{t.author}</footer>
                  </blockquote>
                ))}
              </div>
            )}
            <form onSubmit={submit} className="mt-5 space-y-3">
              <label className="block">
                <span className="text-sm text-muted">Your name</span>
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                  className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm text-muted">Phone or email</span>
                <input
                  required
                  minLength={5}
                  maxLength={200}
                  autoComplete="tel"
                  className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm text-muted">What do you need? (optional)</span>
                <textarea
                  maxLength={1000}
                  rows={4}
                  className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm text-muted">How did you hear about us? (optional)</span>
                <select
                  className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm"
                  value={howHeard}
                  onChange={(e) => setHowHeard(e.target.value)}
                >
                  <option value="">Choose one</option>
                  {HOW_HEARD_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              {/* Honeypot: real visitors never see or fill this in. */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                <label>
                  Website
                  <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </label>
              </div>
              {submitError && <p className="text-sm text-bad">{submitError}</p>}
              <button type="submit" disabled={busy || !businessName} className="w-full rounded-md bg-good px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50">
                {busy ? "Sending…" : "Send enquiry"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
