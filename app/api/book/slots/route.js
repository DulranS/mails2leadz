// app/api/book/slots/route.js - PUBLIC (listed in proxy.js). The free times for one service: across every staff member who
// does it (or one, if the customer chose). Read only. The owner's own calendar blocks the owner's times; if it cannot be read,
// the owner's times are not offered at all.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { isAdminMode, collection, doc, getDoc, getDocs, limit, query } from '../../../../lib/server-firestore.js';
import { ownerFromKey } from '../../../../lib/server/owner-key.js';
import { offeredCurrencies } from '../../../../lib/currency.js';
import { slotsAcross, BOOKING_LIMITS } from '../../../../lib/booking.js';
import { availabilityFor } from '../../../../lib/server/availability.js';
import { loadRoster } from '../../../../lib/server/team-store.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const DAY = 86400000;

export async function GET(request) {
  if (!isAdminMode()) return json({ error: 'Booking is not available.' }, 503);
  const sp = request.nextUrl.searchParams;
  const db = getDb();
  const uid = await ownerFromKey(db, sp.get('k'));
  if (!uid) return json({ error: 'This booking link is not active.' }, 404);
  try {
    const [svcs, cfgSnap] = await Promise.all([
      getDocs(query(collection(db, 'users', uid, 'services'), limit(BOOKING_LIMITS.services))),
      getDoc(doc(db, 'users', uid, 'settings', 'booking')),
    ]);
    const services = svcs.docs.map((d) => ({ id: d.id, name: d.data().name, minutes: d.data().minutes, price: d.data().price ?? null, staffIds: d.data().staffIds || [d.data().staffId || 'owner'] }));
    const chosen = services.find((s) => s.id === sp.get('service')) || services[0] || null;
    const cfg = cfgSnap.exists() ? cfgSnap.data() : {};
    const bizSnap = await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null);
    const currencies = offeredCurrencies(bizSnap?.exists?.() ? bizSnap.data() : {});
    if (!chosen) return json({ services, service: null, slots: [], currencies });

    const now = Date.now();
    const roster = await loadRoster(db, uid).catch(() => ({ members: [] }));
    const names = Object.fromEntries([['owner', 'Our team'], ...(roster.members || []).filter((m) => m.role === 'manager').map((m) => [m.uid, m.name || 'Team member'])]);
    const wanted = sp.get('staff') && chosen.staffIds.includes(sp.get('staff')) ? [sp.get('staff')] : chosen.staffIds;
    const staff = [];
    let calendarWarning = '';
    for (const id of wanted) {
      const av = await availabilityFor(db, uid, cfg, id, { from: now, to: now + BOOKING_LIMITS.horizonDays * DAY, now });
      if (av.calendarError) { calendarWarning = 'Some times are hidden: the calendar could not be read. The owner has been told.'; continue; }
      staff.push({ id, hours: av.hours, tzOffsetMin: av.tzOffsetMin, busy: av.busy });
    }
    const slots = slotsAcross({ now, staff, minutes: chosen.minutes, horizonDays: BOOKING_LIMITS.horizonDays })
      .map((s) => ({ ...s, staffName: names[s.staffId] || 'Our team' }));
    return json({ services, service: chosen, slots, staffNames: names, calendarWarning, currencies });
  } catch (e) {
    console.error('[book slots] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not load the times. Try again.' }, 500);
  }
}
