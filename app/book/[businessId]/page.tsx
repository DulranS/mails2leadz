"use client";

// A customer's page to request a booking. No sign-in. A request is not a confirmed booking: the business confirms it and contacts
// the customer. The page shows which times are taken, never who booked them.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PUBLIC_BOOKING_DAYS_AHEAD } from "@/lib/publicBooking";
import { todayIso } from "@/lib/format";

interface Busy { startTime: string; durationMin: number }

const DURATIONS = [30, 60, 90, 120, 180];

export default function RequestBookingPage() {
  const params = useParams<{ businessId: string }>();
  const businessId = params?.businessId ?? "";
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [services, setServices] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [service, setService] = useState("");
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState("10:00");
  const [durationMin, setDurationMin] = useState(60);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState<Busy[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/booking?businessId=${encodeURIComponent(businessId)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setLoadError(data.error || "Booking requests are not available.");
        else {
          setBusinessName(String(data.businessName ?? ""));
          setServices(Array.isArray(data.services) ? data.services : []);
          setService((data.services ?? [])[0] ?? "");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load this page. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  useEffect(() => {
    if (!businessId || !date) return;
    let cancelled = false;
    fetch(`/api/booking?businessId=${encodeURIComponent(businessId)}&date=${encodeURIComponent(date)}`)
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (!cancelled) setBusy(Array.isArray(data.busy) ? data.busy : []);
      })
      .catch(() => {
        if (!cancelled) setBusy([]);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, date]);

  const maxDate = (() => {
    const d = new Date(Date.parse(`${todayIso()}T00:00:00Z`) + PUBLIC_BOOKING_DAYS_AHEAD * 86_400_000);
    return d.toISOString().slice(0, 10);
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId, service, date, startTime, durationMin, name, contact, notes, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setSubmitError(data.error || "Couldn't send your request. Try again.");
      else setSent(true);
    } catch {
      setSubmitError("Couldn't send your request. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  const business = businessName || "the business";

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-md">
        {loadError ? (
          <>
            <h1 className="text-lg font-semibold">Booking requests unavailable</h1>
            <p className="text-sm text-muted mt-2">{loadError}</p>
          </>
        ) : sent ? (
          <>
            <h1 className="text-lg font-semibold">Request received</h1>
            <p className="text-sm text-muted mt-2">
              {business} has your request for {date} at {startTime}. It is not confirmed yet: {business} will check it and contact you on the number or email you gave.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Request a booking with {business}</h1>
            <p className="text-sm text-muted mt-1">Pick a time. {business} confirms each request before it is booked.</p>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <label className="block">
                <span className="text-sm text-muted">Service</span>
                <select required className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm" value={service} onChange={(e) => setService(e.target.value)}>
                  {services.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-muted">Day</span>
                  <input required type="date" min={todayIso()} max={maxDate} className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm num" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-sm text-muted">Start time</span>
                  <input required type="time" className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm num" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </label>
              </div>
              {busy.length > 0 && (
                <div className="text-xs text-muted">
                  Already taken that day: {busy.map((b) => `${b.startTime} (${b.durationMin} min)`).join(", ")}.
                </div>
              )}
              <label className="block">
                <span className="text-sm text-muted">Length</span>
                <select className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))}>
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>{d} min</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-muted">Your name</span>
                <input required minLength={2} maxLength={120} autoComplete="name" className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-sm text-muted">Phone or email</span>
                <input required minLength={5} maxLength={200} className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm" value={contact} onChange={(e) => setContact(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-sm text-muted">Anything we should know? (optional)</span>
                <textarea maxLength={500} rows={3} className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              {/* Honeypot: real visitors never see or fill this in. */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                <label>
                  Website
                  <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </label>
              </div>
              {submitError && <p className="text-sm text-bad">{submitError}</p>}
              <button type="submit" disabled={sending || !service} className="w-full rounded-md bg-good px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50">
                {sending ? "Sending…" : "Send request"}
              </button>
              <p className="text-xs text-muted">Sending a request does not book or charge anything.</p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
