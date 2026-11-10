// lib/server/gap-tools.js - the rental texts, referral asks and account outreach run from the daily and weekly jobs; the screen data and saves. Never throws.
import { collection, doc, getDoc, getDocs, query, limit, setDoc, addDoc } from '../server-firestore.js';
import { switchState } from '../switches.js';
import { twilioFor } from './twilio-account.js';
import { rentalTextsDue } from '../rental-texts.js';
import { referralAsks } from '../referral.js';
import { abmActions, parseAccounts } from '../abm.js';
import { parseCompetitorLines, positionVs } from '../competitor.js';
import { okrProgress } from '../okr.js';
import { saveJourney as saveJourneyAction, enrol, markStepSent } from './journeys.js';

export async function sendRentalTexts(db, uid, { env = process.env, now = Date.now() } = {}) {
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    const bookings = (await getDocs(query(collection(db, 'users', uid, 'bookings'), limit(200)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const due = rentalTextsDue(bookings, now, { businessName: biz.businessName || 'We' });
    const on = switchState('rentalTexts', biz, env).status === 'on';
    const tw = on ? await twilioFor(db, uid) : null;
    const pending = [];
    for (const d of due) {
      const key = `${d.id}_${d.kind}`;
      const sent = (await getDoc(doc(db, 'users', uid, 'rental_texts', key)).catch(() => null))?.data?.();
      if (sent) continue;
      if (tw) {
        await tw.client.messages.create({ from: tw.from, to: d.to, body: d.text });
        await setDoc(doc(db, 'users', uid, 'rental_texts', key), { sentAt: new Date(now).toISOString(), kind: d.kind });
      } else {
        pending.push(`- A ${d.kind === 'extension' ? 'extension offer' : 'check-out reminder'} text is ready for ${d.id}. Turn on rental texts under Account to send it.`);
      }
    }
    return { due: due.length, pending };
  } catch (e) {
    console.error('[rental-texts] failed:', uid, String(e?.message || '').slice(0, 120));
    return { due: 0, pending: [] };
  }
}

/** Weekly: referral asks (recorded so they are not repeated for 90 days) and accounts gone quiet. */
export async function weeklyOutreach(db, uid, now = Date.now()) {
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    const deals = (await getDocs(query(collection(db, 'deals'), limit(1000)))).docs.map((d) => d.data()).filter((d) => d.userId === uid);
    const tickets = (await getDocs(query(collection(db, 'users', uid, 'support_tickets'), limit(300)))).docs.map((d) => d.data());
    const asked = biz.referralAsked || {};
    const asks = referralAsks(deals, tickets, asked, now).slice(0, 3);
    const lines = asks.map((a) => `- Ask ${a.name} for a referral. Share their code ${a.code}.`);
    if (asks.length) {
      const next = { ...asked };
      for (const a of asks) next[a.email] = new Date(now).toISOString();
      await setDoc(doc(db, 'users', uid, 'settings', 'business'), { referralAsked: next }, { merge: true });
    }
    for (const a of abmActions(biz.abmAccounts || [], now).slice(0, 5)) lines.push(`- Reach out to ${a.name} (${a.why})${a.contact ? `: ${a.contact}` : ''}`);
    return { lines };
  } catch (e) {
    console.error('[outreach] failed:', uid, String(e?.message || '').slice(0, 120));
    return { lines: [] };
  }
}

export async function salesToolsData(db, uid, kpis = {}, money = {}) {
  const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
  const competitors = (await getDocs(query(collection(db, 'users', uid, 'competitor_prices'), limit(200)))).docs.map((d) => d.data());
  return {
    okrs: okrProgress(biz.okrs || [], kpis, money),
    okrText: (biz.okrs || []).map((o) => `${o.objective} | ${(o.keyResults || []).map((k) => `${k.metric} ${k.target}`).join(', ')}`).join('\n'),
    abmText: (biz.abmAccounts || []).map((a) => `${a.name} | ${a.contact || ''}`).join('\n'),
    competitors,
    yourPrice: Number(biz.yourPrice) || null,
  };
}

export async function saveSalesTools(db, uid, action, body = {}) {
  if (action === 'save_okrs') {
    const METRIC_KEYS = ['revenue_month', 'new_customers_month', 'win_rate', 'paid_share', 'ltv'];
    const okrs = String(body.text || '').split(/\r?\n/).map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0] && p[1]).slice(0, 10).map(([objective, krs]) => ({
      objective: objective.slice(0, 160),
      keyResults: krs.split(',').map((k) => k.trim().split(/\s+/)).filter((k) => METRIC_KEYS.includes(k[0]) && Number(k[1]) > 0).slice(0, 5).map(([metric, target]) => ({ metric, target: Number(target) })),
    })).filter((o) => o.keyResults.length);
    await setDoc(doc(db, 'users', uid, 'settings', 'business'), { okrs }, { merge: true });
    return { ok: true, saved: okrs.length };
  }
  if (action === 'save_abm') {
    const abmAccounts = parseAccounts(body.text);
    await setDoc(doc(db, 'users', uid, 'settings', 'business'), { abmAccounts }, { merge: true });
    return { ok: true, saved: abmAccounts.length };
  }
  if (action === 'add_competitors') {
    const { rows, skipped } = parseCompetitorLines(body.text);
    for (const r of rows) await addDoc(collection(db, 'users', uid, 'competitor_prices'), { ...r, addedAt: new Date().toISOString() });
    return { ok: true, saved: rows.length, skipped };
  }
  if (action === 'save_journey') return await saveJourneyAction(db, uid, body);
  if (action === 'enrol') return await enrol(db, uid, body.journeyId, String(body.emails || '').split(/[\s,]+/));
  if (action === 'mark_step_sent') return await markStepSent(db, uid, body.enrolmentId);
  if (action === 'save_your_price') {
    await setDoc(doc(db, 'users', uid, 'settings', 'business'), { yourPrice: Number(body.price) > 0 ? Number(body.price) : null }, { merge: true });
    return { ok: true };
  }
  return { ok: false, error: 'Unknown action.' };
}

export { positionVs };
