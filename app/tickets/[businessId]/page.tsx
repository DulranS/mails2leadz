"use client";

// A customer's page to ask for seats at an event. No sign-in. A request is not a ticket: the business confirms it and contacts the
// customer, and no seat is held until it does. Shows seats left, never who has bought.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MAX_SEATS_PER_REQUEST, type PublicEvent } from "@/lib/publicTickets";

export default function RequestSeatsPage() {
  const params = useParams<{ businessId: string }>();
  const businessId = params?.businessId ?? "";
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [eventId, setEventId] = useState("");
  const [seats, setSeats] = useState(1);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tickets?businessId=${encodeURIComponent(businessId)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setLoadError(data.error || "Seat requests are not available.");
        else {
          setBusinessName(String(data.businessName ?? ""));
          const list: PublicEvent[] = Array.isArray(data.events) ? data.events : [];
          setEvents(list);
          setEventId(list.find((e) => e.remaining > 0)?.id ?? "");
        }
      })
      .catch(() => { if (!cancelled) setLoadError("Couldn't load this page. Check your connection and try again."); });
    return () => { cancelled = true; };
  }, [businessId]);

  const chosen = events.find((e) => e.id === eventId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/tickets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ businessId, eventId, seats, name, contact, notes, website }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setSubmitError(data.error || "Couldn't send your request.");
      else setSent(true);
    } catch {
      setSubmitError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  const field = "w-full rounded border border-line bg-panel2 px-3 py-2 text-sm";
  return (
    <main className="min-h-screen flex items-start justify-center p-4 sm:p-8">
      <div className="max-w-lg w-full space-y-4">
        <h1 className="text-xl font-semibold">{businessName ? `${businessName}: events` : "Events"}</h1>
        {loadError ? (
          <p className="text-sm text-bad">{loadError}</p>
        ) : sent ? (
          <div className="rounded-lg border border-line p-4 text-sm">
            <div className="font-medium mb-1">Request sent</div>
            This is a request, not a ticket. {businessName || "The business"} will contact you to confirm your seats and how to pay. No seat is held until they do.
          </div>
        ) : events.length === 0 && businessName !== null ? (
          <p className="text-sm text-muted">There are no events open for requests right now.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-2">
              {events.map((ev) => (
                <label key={ev.id} className={`flex items-start gap-2 rounded border p-3 text-sm ${ev.remaining === 0 ? "opacity-50" : ""} ${eventId === ev.id ? "border-amber-soft" : "border-line"}`}>
                  <input type="radio" name="event" className="mt-1" disabled={ev.remaining === 0} checked={eventId === ev.id} onChange={() => setEventId(ev.id)} />
                  <span>
                    <span className="font-medium">{ev.name}</span>
                    <span className="block text-xs text-muted num">{ev.date} at {ev.startTime} · {ev.ticketPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })} per seat · {ev.remaining === 0 ? "sold out" : `${ev.remaining} left`}</span>
                  </span>
                </label>
              ))}
            </div>
            <label className="block text-sm">Seats
              <input type="number" min={1} max={Math.min(MAX_SEATS_PER_REQUEST, chosen?.remaining ?? MAX_SEATS_PER_REQUEST)} value={seats} onChange={(e) => setSeats(Math.floor(Number(e.target.value)))} className={field} />
            </label>
            <label className="block text-sm">Your name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={field} /></label>
            <label className="block text-sm">Phone or email<input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} className={field} /></label>
            <label className="block text-sm">Anything we should know (optional)<textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className={field} /></label>
            <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden="true" />
            {submitError && <p className="text-sm text-bad">{submitError}</p>}
            <button type="submit" disabled={sending || !eventId} className="px-4 py-2 rounded bg-amber-soft text-black text-sm font-medium disabled:opacity-50">{sending ? "Sending…" : "Request seats"}</button>
            <p className="text-xs text-muted">This sends a request. The business confirms it with you; nothing is bought and no seat is held until then.</p>
          </form>
        )}
      </div>
    </main>
  );
}
