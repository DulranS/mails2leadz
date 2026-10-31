"use client";
// Bookings: the services and working hours that the public booking page offers, the requests that came in, and reminders for tomorrow.
// Confirming a booking moves its deal to "demo". Nothing is sent by this page: reminders and confirmations open in your mail app.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { useAuthUser } from "../components/AuthProvider";
import { WEEKDAYS } from "../../lib/booking.js";
import { quoteMailto } from "../../lib/quote-core.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const solid = `${btn} bg-teal-600 hover:bg-teal-500 text-white`;
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 inline-flex items-center`;
const field = "min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const DAY_NAMES = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };

export default function BookingsPage() {
  const { user, ready } = useAuthUser();
  const [settings, setSettings] = useState({ services: [], hours: {}, staffHours: {}, tzOffsetMin: 330, calendarConnected: false, calendarStaff: {} });
  const [bookings, setBookings] = useState([]);
  const [bookingKey, setBookingKey] = useState("");
  const [owners, setOwners] = useState([]);
  const [hoursStaff, setHoursStaff] = useState("owner");
  const [calendarUrl, setCalendarUrl] = useState("");
  const [staffCal, setStaffCal] = useState({});
  const [feedUrl, setFeedUrl] = useState("");
  const [svc, setSvc] = useState({ name: "", minutes: 60, price: "", staffIds: ["owner"] });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, b, k, o, f] = await Promise.all([fetch("/api/booking/settings"), fetch("/api/bookings"), fetch("/api/inbound-key"), fetch("/api/deals/assignees"), fetch("/api/bookings/feed")]);
      const od = await o.json().catch(() => ({}));
      const fd = await f.json().catch(() => ({}));
      if (o.ok) setOwners(od.owners || []);
      if (f.ok) setFeedUrl(fd.url || "");
      const sd = await s.json().catch(() => ({}));
      const bd = await b.json().catch(() => ({}));
      const kd = await k.json().catch(() => ({}));
      if (s.ok) setSettings({ services: sd.services || [], hours: sd.hours || {}, staffHours: sd.staffHours || {}, tzOffsetMin: sd.tzOffsetMin ?? 330, calendarConnected: !!sd.calendarConnected, calendarStaff: sd.calendarStaff || {} });
      if (b.ok) setBookings(bd.items || []);
      if (k.ok && kd.key) setBookingKey(kd.key);
      if (!s.ok || !b.ok) setError(sd.error || bd.error || "Could not load the bookings.");
    } catch (e) { console.error(e); setError("Could not load the bookings."); }
  }, []);
  useEffect(() => { if (ready && user) load(); }, [ready, user, load]);

  const run = async (fn) => { setBusy(true); setError(""); setNotice(""); try { await fn(); } catch (e) { console.error(e); setError("Something went wrong. Try again."); } finally { setBusy(false); } };
  const post = async (path, body) => {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  };

  const addService = () => run(async () => {
    const r = await post("/api/booking/settings", { action: "service", ...svc, staffIds: svc.staffIds.length ? svc.staffIds : ["owner"] });
    if (!r.ok) { setError(r.data.error || "Could not add the service."); return; }
    setSvc({ name: "", minutes: 60, price: "", staffIds: ["owner"] }); setNotice("Service added."); await load();
  });
  const removeService = (id) => run(async () => {
    const r = await post("/api/booking/settings", { action: "delete", id });
    if (!r.ok) { setError(r.data.error || "Could not remove the service."); return; }
    await load();
  });
  const currentHours = hoursStaff === "owner" ? settings.hours : (settings.staffHours?.[hoursStaff] || {});
  const setDayRange = (day, which, value) => {
    const current = currentHours[day] || ["09:00", "17:00"];
    const next = which === "on" ? (value ? ["09:00", "17:00"] : null) : [which === "start" ? value : current[0], which === "end" ? value : current[1]];
    if (hoursStaff === "owner") setSettings({ ...settings, hours: { ...settings.hours, [day]: next } });
    else setSettings({ ...settings, staffHours: { ...(settings.staffHours || {}), [hoursStaff]: { ...currentHours, [day]: next } } });
  };
  const saveHours = () => run(async () => {
    const r = await post("/api/booking/settings", { action: "hours", staffId: hoursStaff, hours: currentHours, tzOffsetMin: Number(settings.tzOffsetMin) });
    if (!r.ok) { setError(r.data.error || "Could not save the hours."); return; }
    setNotice("Working hours saved."); await load();
  });
  const saveCalendar = (url) => run(async () => {
    const r = await post("/api/booking/settings", { action: "calendar", url });
    if (!r.ok) { setError(r.data.error || "Could not save the calendar address."); return; }
    setCalendarUrl(""); setNotice(url ? "Calendar connected. Its events now block your times." : "Calendar disconnected."); await load();
  });
  const saveStaffCalendar = (staffId, url) => run(async () => {
    const r = await post("/api/booking/settings", { action: "staffCalendar", staffId, url });
    if (!r.ok) { setError(r.data.error || "Could not save that calendar address."); return; }
    setStaffCal({ ...staffCal, [staffId]: "" }); setNotice(url ? "Calendar connected for that person." : "Calendar removed for that person."); await load();
  });
  const setStatus = (b, status) => run(async () => {
    const r = await post("/api/bookings/status", { id: b.id, status });
    if (!r.ok) { setError(r.data.error || "Could not update the booking."); return; }
    setNotice(status === "confirmed" ? "Booking confirmed. Its deal is now in demo." : `Booking ${status}.`); await load();
  });

  const bookingLink = bookingKey && typeof window !== "undefined" ? `${window.location.origin}/book?k=${bookingKey}` : "";
  const requested = bookings.filter((b) => b.status === "requested");
  const tomorrow = useMemo(() => {
    const now = Date.now();
    return bookings.filter((b) => b.status === "confirmed" && Date.parse(b.startIso) > now && Date.parse(b.startIso) - now <= 24 * 3600 * 1000);
  }, [bookings]);
  const reminder = (b) => quoteMailto({ customerEmail: b.email }, {
    subject: `Reminder: ${b.serviceName} tomorrow`,
    text: `Hello ${b.name || ""},\n\nA reminder of your ${b.serviceName} at ${new Date(b.startIso).toLocaleString()}. Reply to this email if you need to change it.\n\n${user?.displayName || ""}`.trim(),
  });

  return (
    <DashboardLayout title="Bookings" subtitle="Services, working hours and requests. A customer picks a free time; you confirm it.">
      <div className="space-y-4">
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-teal-700 dark:text-teal-300">{notice}</p>}

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Your booking link</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Share this with customers. It shows only the free times you allow.</p>
          {bookingLink ? <p className="text-sm break-all text-gray-900 dark:text-white">{bookingLink}</p> : <p className="text-sm text-amber-700 dark:text-amber-300">Set up your enquiry link first (Account), then the booking link appears here.</p>}
        </section>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Services</h2>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 mb-3">
            {settings.services.length === 0 && <li className="py-2 text-sm text-gray-500 dark:text-gray-400">No services yet.</li>}
            {settings.services.map((s) => (
              <li key={s.id} className="py-2 flex justify-between items-center gap-2">
                <span className="text-sm text-gray-900 dark:text-white">{s.name} · {s.minutes} min{s.price !== null && s.price !== undefined ? ` · ${s.price}` : ""} · {(s.staffIds || [s.staffId || "owner"]).map((k) => owners.find((o) => o.key === k)?.label || "You (owner)").join(", ")}</span>
                <button type="button" disabled={busy} onClick={() => removeService(s.id)} className={ghost}>Remove</button>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input className={field} placeholder="Service name" value={svc.name} onChange={(e) => setSvc({ ...svc, name: e.target.value })} />
            <input className={field} type="number" min="5" max="480" value={svc.minutes} onChange={(e) => setSvc({ ...svc, minutes: e.target.value })} aria-label="Minutes" />
            <input className={field} placeholder="Price (optional)" value={svc.price} onChange={(e) => setSvc({ ...svc, price: e.target.value })} />
            <fieldset className="sm:col-span-4 text-sm text-gray-700 dark:text-gray-200"><legend className="mb-1">Who can take this (a customer can choose, or is given any free one)</legend>
              <div className="flex flex-wrap gap-3">{owners.map((o) => (<label key={o.key} className="flex items-center gap-2 min-h-[44px]"><input type="checkbox" checked={svc.staffIds.includes(o.key)} onChange={(e) => setSvc({ ...svc, staffIds: e.target.checked ? [...svc.staffIds, o.key] : svc.staffIds.filter((x) => x !== o.key) })} />{o.label}</label>))}</div>
            </fieldset>
            <button type="button" disabled={busy || !svc.name} onClick={addService} className={solid}>Add service</button>
          </div>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Working hours</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">In your own time zone. One range per day; untick a day to close it. Each person can have their own hours.</p>
          <label className="text-sm text-gray-700 dark:text-gray-200 block mb-3">Hours for<select className={`${field} ml-2`} value={hoursStaff} onChange={(e) => setHoursStaff(e.target.value)}>{owners.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
          <div className="space-y-2">
            {WEEKDAYS.map((d) => {
              const r = currentHours[d];
              return (
                <div key={d} className="grid grid-cols-12 gap-2 items-center">
                  <label className="col-span-4 sm:col-span-3 text-sm text-gray-700 dark:text-gray-200 flex items-center gap-2"><input type="checkbox" checked={!!r} onChange={(e) => setDayRange(d, "on", e.target.checked)} />{DAY_NAMES[d]}</label>
                  {r && <>
                    <input className={`${field} col-span-3 sm:col-span-3`} type="time" value={r[0]} onChange={(e) => setDayRange(d, "start", e.target.value)} aria-label={`${DAY_NAMES[d]} start`} />
                    <input className={`${field} col-span-3 sm:col-span-3`} type="time" value={r[1]} onChange={(e) => setDayRange(d, "end", e.target.value)} aria-label={`${DAY_NAMES[d]} end`} />
                  </>}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <label className="text-sm text-gray-700 dark:text-gray-200">Time zone offset from UTC, in minutes<input className={`${field} ml-2`} style={{ maxWidth: 120 }} type="number" value={settings.tzOffsetMin} onChange={(e) => setSettings({ ...settings, tzOffsetMin: e.target.value })} /></label>
            <button type="button" disabled={busy} onClick={saveHours} className={solid}>Save hours</button>
          </div>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Your own calendar</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Paste your calendar's secret address in iCal format (Google: calendar settings, Integrate calendar). Its events then block your times, so nothing is booked over them. Each team manager's calendar can be added the same way. Calendars are only read.</p>
          <p className="text-sm text-gray-900 dark:text-white mb-2">{settings.calendarConnected ? "Connected." : "Not connected."}</p>
          {owners.filter((o) => o.key !== "owner").map((o) => (
            <div key={o.key} className="mt-3">
              <p className="text-sm text-gray-900 dark:text-white mb-1">{o.label}: {settings.calendarStaff?.[o.key] ? "connected" : "not connected"}</p>
              <div className="flex flex-wrap gap-2 items-end">
                <input className={`${field} flex-1 min-w-[220px]`} placeholder="https://…/basic.ics" value={staffCal[o.key] || ""} onChange={(e) => setStaffCal({ ...staffCal, [o.key]: e.target.value })} aria-label={`Calendar address for ${o.label}`} />
                <button type="button" disabled={busy || !(staffCal[o.key] || "").trim()} onClick={() => saveStaffCalendar(o.key, staffCal[o.key].trim())} className={solid}>Connect</button>
                {settings.calendarStaff?.[o.key] && <button type="button" disabled={busy} onClick={() => saveStaffCalendar(o.key, "")} className={ghost}>Remove</button>}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 items-end">
            <input className={`${field} flex-1 min-w-[220px]`} placeholder="https://…/basic.ics" value={calendarUrl} onChange={(e) => setCalendarUrl(e.target.value)} aria-label="Calendar address" />
            <button type="button" disabled={busy || !calendarUrl.trim()} onClick={() => saveCalendar(calendarUrl.trim())} className={solid}>Connect</button>
            {settings.calendarConnected && <button type="button" disabled={busy} onClick={() => saveCalendar("")} className={ghost}>Disconnect</button>}
          </div>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Calendar</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">In Google, Outlook or Apple Calendar, subscribe to this address by URL. Confirmed bookings then appear, and stay up to date.</p>
          {feedUrl ? <p className="text-sm break-all text-gray-900 dark:text-white">{feedUrl}</p> : <p className="text-sm text-amber-700 dark:text-amber-300">Set NEXT_PUBLIC_BASE_URL to your public https address to get the calendar address.</p>}
        </section>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Requests to confirm ({requested.length})</h2>
          {requested.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No requests waiting.</p>}
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {requested.map((b) => (
              <li key={b.id} className="py-2 flex flex-wrap justify-between gap-2 items-center">
                <span className="text-sm text-gray-900 dark:text-white">{b.name} · {b.serviceName} · {new Date(b.startIso).toLocaleString()} <span className="text-gray-500 dark:text-gray-400">{b.email}</span>{b.needsReview ? <span className="ml-2 text-amber-700 dark:text-amber-300">needs your review: repeat no-shows</span> : null}{b.movedBy ? <span className="ml-2 text-amber-700 dark:text-amber-300">moved by the customer</span> : null}</span>
                <span className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => setStatus(b, "confirmed")} className={solid}>Confirm</button>
                  <button type="button" disabled={busy} onClick={() => setStatus(b, "declined")} className={ghost}>Decline</button>
                  {b.manageLink && <button type="button" onClick={() => navigator.clipboard?.writeText(b.manageLink)} className={ghost}>Copy manage link</button>}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Tomorrow</h2>
          {tomorrow.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">Nothing confirmed in the next 24 hours.</p>}
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {bookings.filter((b) => b.status === "awaiting_payment").length > 0 && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Waiting for card payment: {bookings.filter((b) => b.status === "awaiting_payment").map((b) => b.name).join(", ")}. They are confirmed automatically when paid.</p>}
            {bookings.filter((b) => b.status === "needs_review").map((b) => <p key={b.id} className="text-xs text-red-600 dark:text-red-300 mb-2">{b.name}: {b.reviewNote}</p>)}
            {tomorrow.map((b) => (
              <li key={b.id} className="py-2 flex flex-wrap justify-between gap-2 items-center">
                <span className="text-sm text-gray-900 dark:text-white">{b.name} · {b.serviceName} · {new Date(b.startIso).toLocaleString()}</span>
                <span className="flex gap-2">
                  <a href={reminder(b)} className={ghost}>Draft reminder</a>
                  <button type="button" disabled={busy} onClick={() => setStatus(b, "cancelled")} className={ghost}>Cancel</button>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Record what happened</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">For confirmed bookings that have started. A customer with two or more no-shows pays in advance, or is flagged for your review.</p>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {bookings.filter((b) => b.status === "confirmed" && Date.parse(b.startIso) <= Date.now()).map((b) => (
              <li key={b.id} className="py-2 flex flex-wrap justify-between gap-2 items-center">
                <span className="text-sm text-gray-900 dark:text-white">{b.name} · {b.serviceName} · {new Date(b.startIso).toLocaleString()}</span>
                <span className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => setStatus(b, "completed")} className={solid}>Completed</button>
                  <button type="button" disabled={busy} onClick={() => setStatus(b, "no_show")} className={ghost}>No-show</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </DashboardLayout>
  );
}
