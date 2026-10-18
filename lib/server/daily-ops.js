// lib/server/daily-ops.js - the rest of "run the business": money, the weekly report and the content calendar, once a day per owner.
// Each part is its own switch (Account -> Autopilot) and each is cheap: invoices and reminders use fixed wording (no AI cost),
// the report is arithmetic, and only the weekly content plan calls the AI (one call, and only when the calendar is running empty).
// Rules live in lib/billing-automation.js, lib/autosend.js and lib/owner-report.js (all tested). This file is the I/O around them.
import { collection, doc, addDoc, setDoc, updateDoc, getDoc, getDocs, query, where, limit, isAdminMode } from '../server-firestore.js';
import { AiError } from '../ai-client.js';
import { loadAutopilot } from './prepare-drafts.js';
import { openMailbox } from './autosend.js';
import { buildRawEmail } from '../raw-email.js';
import { inSendWindow, localParts } from '../autosend.js';
import { planSubscriptionInvoices, planReminders, invoiceEmailText } from '../billing-automation.js';
import { buildOwnerReport, loadOwnerRows } from './owner-report.js';
import { draftContentPlan, ContentPlanError } from './content-plan.js';
import { addDays } from '../content.js';
import { DEFAULT_PAYMENT_TERMS_DAYS } from '../billing.js';

const nowIso = () => new Date().toISOString();
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CONTENT_MIN_UPCOMING = 2; // fewer than this many posts in the next 7 days = the calendar is running empty
const CONTENT_EVERY_DAYS = 5; // never draft a new plan more often than this

const rows = async (db, coll, uid, n) => (await getDocs(query(collection(db, coll), where('userId', '==', uid), limit(n)))).docs.map((d) => ({ id: d.id, ...d.data() }));
const patchSettings = (db, uid, patch) => setDoc(doc(db, 'users', uid, 'settings', 'autopilot'), patch, { merge: true }).catch(() => {});

/**
 * @returns {{ invoices: number, invoiceEmails: number, reminders: number, report: boolean, posts: number, notes: string[] }}
 * notes = plain reasons something did not run (shown in the cron summary, never an error).
 */
export async function dailyOpsForUser(db, uid, { settings, now = Date.now(), deadline = Date.now() + 240000, sleep = defaultSleep, send } = {}) {
  const out = { invoices: 0, invoiceEmails: 0, reminders: 0, report: false, posts: 0, notes: [] };
  if (!isAdminMode()) { out.notes.push('no_admin'); return out; }
  const cfg = settings || (await loadAutopilot(db, uid));
  if (!cfg.autoBilling && !cfg.autoContent && !cfg.weeklyReport) return out;

  const bsSnap = await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null);
  const bs = bsSnap?.exists?.() ? bsSnap.data() : {};
  const raw = (await getDoc(doc(db, 'users', uid, 'settings', 'autopilot')).catch(() => null));
  const stored = raw?.exists?.() ? raw.data() : {};
  const { dateKey, dow, hour } = localParts(now, cfg.tzOffsetMin);
  const fromName = cfg.senderName || bs?.profile?.businessName || '';

  let box; // opened once, only if something needs to be emailed
  const mailbox = async () => { if (box === undefined) box = await openMailbox(db, uid, { send }); return box; };
  const mail = async (to, subject, body) => {
    const b = await mailbox();
    if (!b.ok) return { sent: false, why: b.reason };
    await b.sendRaw(buildRawEmail({ from: b.email, fromName, to, subject, body }));
    return { sent: true };
  };

  // ---- money ----
  if (cfg.autoBilling) {
    try {
      const [invoices, deals] = await Promise.all([rows(db, 'invoices', uid, 2000), rows(db, 'deals', uid, 2000)]);
      const currency = bs.currency || 'USD';
      const paymentInfo = String(bs.paymentInstructions || '').slice(0, 400);
      const termsDays = Number.isFinite(Number(bs.paymentTermsDays)) ? Number(bs.paymentTermsDays) : DEFAULT_PAYMENT_TERMS_DAYS;
      const canMail = inSendWindow(now, cfg).ok;

      for (const p of planSubscriptionInvoices({ uid, deals, invoices, now, termsDays })) {
        if (Date.now() > deadline - 20000) { out.notes.push('time'); break; }
        const ref = await addDoc(collection(db, 'invoices'), p.write);
        out.invoices++;
        invoices.push({ id: ref.id, ...p.write }); // so the reminders below see the full list
        if (canMail) {
          const t = invoiceEmailText({ name: p.name, amount: p.write.amount, currency, dueAt: p.write.dueAt, note: p.write.note, senderName: fromName, paymentInfo });
          const r = await mail(p.to, t.subject, t.body).catch(() => ({ sent: false, why: 'send_failed' }));
          if (r.sent) { out.invoiceEmails++; await updateDoc(ref, { emailedAt: nowIso(), emailedBy: 'autopilot' }).catch(() => {}); await sleep(3000); }
          else if (!out.notes.includes(`invoice_email_${r.why}`)) out.notes.push(`invoice_email_${r.why}`);
        }
      }

      if (canMail) {
        for (const r of planReminders({ invoices, now, currency, senderName: fromName, paymentInfo })) {
          if (Date.now() > deadline - 20000) { out.notes.push('time'); break; }
          const res = await mail(r.invoice.email, r.draft.subject, r.draft.body).catch(() => ({ sent: false, why: 'send_failed' }));
          if (!res.sent) { if (!out.notes.includes(`reminder_${res.why}`)) out.notes.push(`reminder_${res.why}`); if (res.why !== 'send_failed') break; continue; }
          await updateDoc(doc(db, 'invoices', r.invoice.id), { reminders: (Number(r.invoice.reminders) || 0) + 1, lastReminderAt: nowIso(), lastReminderBy: 'autopilot' }).catch(() => {});
          out.reminders++;
          await sleep(3000);
        }
      } else out.notes.push('billing_emails_outside_window');
    } catch (e) { console.error('[daily-ops] billing failed:', uid, String(e?.message || '').slice(0, 120)); out.notes.push('billing_error'); }
  }

  // ---- the Monday email to yourself ----
  if (cfg.weeklyReport && dow === 1 && hour >= 6 && stored.lastWeeklyReportDate !== dateKey) {
    try {
      const data = await loadOwnerRows(db, uid);
      const rep = buildOwnerReport({ ...data, settings: bs, now });
      const b = await mailbox();
      if (!b.ok) out.notes.push(`report_${b.reason}`);
      else if (rep.quiet) { await patchSettings(db, uid, { lastWeeklyReportDate: dateKey }); out.notes.push('report_nothing_to_say'); }
      else {
        await b.sendRaw(buildRawEmail({ from: b.email, fromName: 'AutoLeads', to: b.email, subject: rep.subject, body: rep.body }));
        await patchSettings(db, uid, { lastWeeklyReportDate: dateKey });
        out.report = true;
      }
    } catch (e) { console.error('[daily-ops] report failed:', uid, String(e?.message || '').slice(0, 120)); out.notes.push('report_error'); }
  }

  // ---- next week's posts (drafted and scheduled; a person still taps "post") ----
  if (cfg.autoContent && Date.now() < deadline - 40000) {
    try {
      const last = String(stored.lastAutoContentDate || '');
      const recentlyDone = last && addDays(last, CONTENT_EVERY_DAYS) > dateKey;
      if (!recentlyDone) {
        const posts = (await getDocs(collection(db, 'users', uid, 'content_posts'))).docs.map((d) => d.data());
        const horizon = addDays(dateKey, 6);
        const upcoming = posts.filter((p) => p.status === 'scheduled' && String(p.scheduledFor || '') >= dateKey && String(p.scheduledFor || '') <= horizon).length;
        if (upcoming < CONTENT_MIN_UPCOMING) {
          const { posts: drafted } = await draftContentPlan({ uid, platforms: cfg.contentPlatforms, count: 5, today: dateKey });
          for (const p of drafted) await addDoc(collection(db, 'users', uid, 'content_posts'), { ...p, userId: uid, autoDrafted: true, createdAt: nowIso(), updatedAt: nowIso() });
          out.posts = drafted.length;
          await patchSettings(db, uid, { lastAutoContentDate: dateKey });
        }
      }
    } catch (e) {
      if (e instanceof AiError || e instanceof ContentPlanError) out.notes.push(`content_${e.code || 'ai'}`);
      else { console.error('[daily-ops] content failed:', uid, String(e?.message || '').slice(0, 120)); out.notes.push('content_error'); }
    }
  }
  return out;
}
