// lib/booking.js - a service booking calendar, as pure logic: which times are free for a service, and whether a requested time is allowed.
// Working hours are per weekday, in the owner's local time (tzOffsetMin = minutes east of UTC). Busy time is requested or confirmed bookings.
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const BOOKING_LIMITS = { services: 20, minMinutes: 5, maxMinutes: 480, horizonDays: 21, leadMinutes: 60, nameLen: 120 };
const MIN = 60000;
const DAY = 86400000;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function sanitizeService(raw) {
  const name = clean(raw?.name, 80);
  if (!name) return { error: 'Give the service a name.' };
  const minutes = Math.floor(Number(raw?.minutes));
  if (!Number.isFinite(minutes) || minutes < BOOKING_LIMITS.minMinutes || minutes > BOOKING_LIMITS.maxMinutes) return { error: `The length must be between ${BOOKING_LIMITS.minMinutes} and ${BOOKING_LIMITS.maxMinutes} minutes.` };
  const price = raw?.price === '' || raw?.price === undefined || raw?.price === null ? null : Number(raw.price);
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 1e7)) return { error: 'Check the price.' };
  return { service: { name, minutes, price: price === null ? null : Math.round(price * 100) / 100 } };
}

/** Working hours: one range per weekday, e.g. { mon: ['09:00','17:00'], sat: null }. Invalid times or ranges are refused. */
export function sanitizeHours(raw) {
  const hours = {};
  for (const d of WEEKDAYS) {
    const r = raw?.[d];
    if (r === null || r === undefined || r === '' || (Array.isArray(r) && r.length === 0)) { hours[d] = null; continue; }
    if (!Array.isArray(r) || r.length !== 2 || !HHMM.test(String(r[0])) || !HHMM.test(String(r[1]))) return { error: `Check the hours for ${d} (use 24-hour times such as 09:00 and 17:00).` };
    if (toMin(String(r[0])) >= toMin(String(r[1]))) return { error: `The end of ${d} must be after its start.` };
    hours[d] = [String(r[0]), String(r[1])];
  }
  return { hours };
}

const localParts = (ms, tzOffsetMin) => { const d = new Date(ms + tzOffsetMin * MIN); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; };
const pad = (n) => String(n).padStart(2, '0');

/** The free start times for a service over the horizon. Each slot is a start time in UTC (ISO) with a local label. */
export function slotsFor({ now = Date.now(), hours = {}, tzOffsetMin = 0, minutes, busy = [], horizonDays = 14 }) {
  const len = Number(minutes);
  if (!Number.isFinite(len) || len <= 0) return [];
  const { y, m, d } = localParts(now, tzOffsetMin);
  const earliest = now + BOOKING_LIMITS.leadMinutes * MIN;
  const out = [];
  for (let i = 0; i <= horizonDays; i += 1) {
    const dayStart = Date.UTC(y, m, d + i);
    const weekday = WEEKDAYS[new Date(dayStart).getUTCDay()];
    const range = hours[weekday];
    if (!range) continue;
    const open = toMin(range[0]);
    const close = toMin(range[1]);
    for (let t = open; t + len <= close; t += len) {
      const startMs = dayStart + t * MIN - tzOffsetMin * MIN;
      const endMs = startMs + len * MIN;
      if (startMs < earliest) continue;
      if (busy.some(([bs, be]) => startMs < be && bs < endMs)) continue;
      out.push({ startIso: new Date(startMs).toISOString(), label: `${new Date(dayStart).toISOString().slice(0, 10)} ${pad(Math.floor(t / 60))}:${pad(t % 60)}` });
    }
  }
  return out.slice(0, 300);
}

/** Whether one specific start time is still offered. Used before a request is accepted, so a stale page cannot book a taken slot. */
export function isSlotAllowed({ startIso, now = Date.now(), hours, tzOffsetMin, minutes, busy = [] }) {
  const ms = Date.parse(startIso);
  if (!Number.isFinite(ms)) return false;
  return slotsFor({ now, hours, tzOffsetMin, minutes, busy, horizonDays: BOOKING_LIMITS.horizonDays }).some((s) => Date.parse(s.startIso) === ms);
}

/** A booking request from a customer. The honeypot must be empty (a filled field means a bot). */
export function sanitizeRequest(raw) {
  if (clean(raw?.honeypot, 200)) return { bot: true };
  const name = clean(raw?.name, BOOKING_LIMITS.nameLen);
  if (!name) return { error: 'Enter your name.' };
  const email = clean(raw?.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
  const startMs = Date.parse(String(raw?.startIso || ''));
  if (!Number.isFinite(startMs)) return { error: 'Choose a time.' };
  return { request: { name, email, phone: clean(raw?.phone, 40), startIso: new Date(startMs).toISOString() } };
}

/** The interval a booking occupies, for overlap checks. */
export const intervalOf = (startIso, minutes) => { const s = Date.parse(startIso); return [s, s + Number(minutes) * MIN]; };

/** Two bookings clash when they overlap and use the same staff member. A cancelled or declined booking clashes with nothing. */
export function clashes(booking, others = []) {
  const [s, e] = intervalOf(booking.startIso, booking.minutes);
  return others.some((o) => o.id !== booking.id && (o.staffId || 'owner') === (booking.staffId || 'owner') && ['confirmed', 'awaiting_payment'].includes(o.status) && (() => {
    const [os, oe] = intervalOf(o.startIso, o.minutes);
    return s < oe && os < e;
  })());
}

const icsText = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n').slice(0, 300);
const icsDate = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** An iCalendar feed of the confirmed bookings. Calendars that subscribe to a URL (Google, Outlook, Apple) read it. */
export function icsFor({ bookings = [], now = Date.now(), businessName = 'Bookings' }) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AutoLeads//Bookings//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsText(businessName)}`];
  for (const b of bookings) {
    if (b.status !== 'confirmed' || !b.startIso) continue;
    const end = b.endIso || new Date(Date.parse(b.startIso) + Number(b.minutes || 60) * 60000).toISOString();
    lines.push('BEGIN:VEVENT', `UID:${icsText(b.id)}@autoleads`, `DTSTAMP:${icsDate(new Date(now).toISOString())}`,
      `DTSTART:${icsDate(b.startIso)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${icsText(`${b.serviceName || 'Booking'} - ${b.name || ''}`)}`,
      `DESCRIPTION:${icsText(`${b.email || ''}${b.phone ? ` ${b.phone}` : ''}`)}`, 'STATUS:CONFIRMED', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/** The working hours that apply to one staff member: their own if set, otherwise the account's shared hours. */
export function hoursFor(cfg = {}, staffId = 'owner') {
  const per = cfg?.staffHours && Object.prototype.hasOwnProperty.call(cfg.staffHours, staffId) ? cfg.staffHours[staffId] : undefined;
  if (per !== undefined) return per || {};
  return cfg?.hours || {};
}

/** Free times across several staff members: one list, each slot tagged with who takes it; the earliest offer wins a shared start. */
export function slotsAcross({ now = Date.now(), staff = [], minutes, horizonDays = 14 }) {
  const seen = new Map();
  for (const s of staff) {
    for (const slot of slotsFor({ now, hours: s.hours, tzOffsetMin: s.tzOffsetMin, minutes, busy: s.busy, horizonDays })) {
      if (!seen.has(slot.startIso)) seen.set(slot.startIso, { ...slot, staffId: s.id });
    }
  }
  return [...seen.values()].sort((a, b) => a.startIso.localeCompare(b.startIso)).slice(0, 300);
}

/** True when [start, start+minutes) overlaps any busy interval. */
export function overlapsBusy(busy = [], startIso, minutes) {
  const [s, e] = intervalOf(startIso, minutes);
  return busy.some(([bs, be]) => s < be && bs < e);
}
