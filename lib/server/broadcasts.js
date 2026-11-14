// lib/server/broadcasts.js - contacts, segments, draft broadcasts and approved sends. Nothing is sent without the owner's approval. Never throws.
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, addDoc } from '../server-firestore.js';
import { applySegment, broadcastRecipients, smsRecipients, campaignReport, MAX_BROADCAST, DAILY_BROADCAST_CAP } from '../segments.js';
import { twilioFor } from './twilio-account.js';
import { isSuppressed, optOutFor } from './route-helpers.js';
import { creditRisk } from '../credit-risk.js';
import { mailCustomer } from './customer-mail.js';
import { withOptOut } from '../journey-send.js';

export async function loadContacts(db, uid) {
  const deals = (await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(1000)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const leads = (await getDocs(query(collection(db, 'lead_inbox'), where('userId', '==', uid), limit(1000)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const byEmail = new Map();
  for (const d of deals) {
    const e = String(d.email || '').toLowerCase();
    if (!e) continue;
    byEmail.set(e, { email: e, name: d.businessName || '', tags: d.tags || [], source: d.source || '', stage: d.stage || '', city: d.city || '', value: Number(d.value) || 0, lastActiveAt: d.updatedAt || d.stageTimes?.[d.stage] || '', consent: d.marketingConsent === true, phone: d.phone || '', smsConsent: d.smsConsent === true, dealId: d.id, collection: 'deals' });
  }
  for (const l of leads) {
    const e = String(l.email || '').toLowerCase();
    if (!e || byEmail.has(e)) continue;
    byEmail.set(e, { email: e, name: l.name || '', tags: l.tags || [], source: l.source || '', stage: 'new', city: l.city || '', value: 0, lastActiveAt: l.receivedAt || '', consent: l.marketingConsent === true, phone: l.phone || '', smsConsent: l.smsConsent === true, dealId: l.id, collection: 'lead_inbox' });
  }
  return [...byEmail.values()];
}

export async function previewSegment(db, uid, filter = {}) {
  const contacts = await loadContacts(db, uid);
  const matched = applySegment(contacts, filter, Date.now());
  const r = broadcastRecipients(matched, new Set());
  return { matched: matched.length, agreed: r.eligible.length, notAgreed: r.excluded.length };
}

export async function createDraft(db, uid, { name, subject, text, filter = {}, channel = 'email' }) {
  const isSms = channel === 'sms';
  const subj = String(subject || '').trim().slice(0, 150);
  const body = String(text || '').trim().slice(0, 4000);
  if (subj.length < 3) return { ok: false, error: 'Write a subject line.' };
  if (body.length < 20) return { ok: false, error: 'Write the message.' };
  const contacts = await loadContacts(db, uid);
  const matched = applySegment(contacts, filter, Date.now());
  const suppressed = new Set();
  for (const c of matched.filter((m) => m.consent)) if (await isSuppressed(db, uid, c.email).catch(() => true)) suppressed.add(c.email);
  // Customers who owe money for over 30 days are never a marketing target: they cost more than they bring.
  const owing = (await getDocs(query(collection(db, 'users', uid, 'invoices'), limit(1000)))).docs.map((d) => d.data()).catch?.(() => []) || [];
  const problem = new Set(creditRisk(owing, Date.now()).map((c) => c.email));
  const r = isSms ? smsRecipients(matched, suppressed, problem) : broadcastRecipients(matched, suppressed, problem);
  if (!r.eligible.length) return { ok: false, error: isSms ? 'No one in this list has agreed to receive texts, with a valid mobile number.' : 'No one in this list has agreed to hear from you yet.' };
  const ref = await addDoc(collection(db, 'users', uid, 'broadcasts'), {
    name: String(name || subj).slice(0, 80), channel: isSms ? 'sms' : 'email', subject: subj, text: body, recipients: r.eligible.slice(0, MAX_BROADCAST),
    excludedCount: r.excluded.length, filter, status: 'draft', createdAt: new Date().toISOString(),
  });
  return { ok: true, id: ref.id, recipients: Math.min(r.eligible.length, MAX_BROADCAST), excluded: r.excluded.length };
}

export async function sendDraft(db, uid, id, { now = Date.now(), fromName = '' } = {}) {
  const ref = doc(db, 'users', uid, 'broadcasts', String(id));
  const b = (await getDoc(ref).catch(() => null))?.data?.();
  if (!b) return { ok: false, error: 'That broadcast was not found.' };
  if (b.status !== 'draft') return { ok: false, error: 'This broadcast has already been sent.' };
  const day = new Date(now).toISOString().slice(0, 10);
  const dayRef = doc(db, 'users', uid, 'broadcast_daily', day);
  const sentToday = (await getDoc(dayRef).catch(() => null))?.data?.()?.count || 0;
  const room = Math.max(0, DAILY_BROADCAST_CAP - sentToday);
  if (room === 0) return { ok: false, error: `Today's limit of ${DAILY_BROADCAST_CAP} messages is reached. Send the rest tomorrow.` };
  let sent = 0, failed = 0, skipped = 0;
  const batch = (b.recipients || []).slice(0, room);
  if (b.channel === 'sms') {
    const tw = await twilioFor(db, uid);
    if (!tw) return { ok: false, error: 'Connect Twilio under Integrations to send texts.' };
    for (const phone of batch) {
      const r = await tw.client.messages.create({ from: tw.from, to: phone, body: `${b.text} Reply STOP to opt out.` }).then(() => true).catch(() => false);
      if (r) sent++; else failed++;
    }
  } else {
    for (const email of batch) {
      if (await isSuppressed(db, uid, email).catch(() => true)) { skipped++; continue; }
      const r = await mailCustomer(db, uid, { to: email, subject: b.subject, text: withOptOut(b.text, optOutFor(uid, email, email)), fromName, marketing: true }).catch(() => ({ sent: false }));
      if (r.sent) sent++; else failed++;
    }
  }
  await setDoc(ref, { status: 'sent', sentAt: new Date(now).toISOString(), sentCount: sent, failedCount: failed, skippedCount: skipped }, { merge: true });
  await setDoc(dayRef, { count: sentToday + sent, day }, { merge: true });
  return { ok: true, sent, failed, skipped, remaining: Math.max(0, (b.recipients || []).length - batch.length) };
}

export async function recordAgreement(db, uid, email, consented, channel = 'email') {
  const e = String(email || '').trim().toLowerCase();
  const contacts = await loadContacts(db, uid);
  const c = contacts.find((x) => x.email === e);
  if (!c) return { ok: false, error: 'That contact was not found.' };
  const field = channel === 'sms' ? 'smsConsent' : 'marketingConsent';
  await setDoc(doc(db, c.collection, c.dealId), { [field]: consented === true, [`${field}At`]: new Date().toISOString() }, { merge: true });
  return { ok: true };
}

export async function reportFor(db, uid) {
  const broadcasts = (await getDocs(query(collection(db, 'users', uid, 'broadcasts'), limit(100)))).docs.map((d) => d.data());
  const sends = [];
  for (const b of broadcasts) if (b.status === 'sent') for (let i = 0; i < (b.sentCount || 0); i++) sends.push({ campaign: b.name });
  const deals = (await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(1000)))).docs.map((d) => d.data());
  const invoices = (await getDocs(query(collection(db, 'users', uid, 'invoices'), limit(1000)))).docs.map((d) => d.data());
  return campaignReport({ sends, deals, invoices });
}
