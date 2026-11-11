// lib/server/insights.js - patterns in the owner's won and lost customers, and the message critique, through the owner's AI key. Never throws; never sends anything.
import { collection, doc, getDoc, getDocs, query, where, limit } from '../server-firestore.js';
import { spendAuditPrompt, reactivationPrompt } from '../insights.js';
import { callAI } from '../ai-client.js';
import { patternsPrompt, critiquePrompt } from '../insights.js';

const noteText = (n) => String(n?.summary || n?.text || n?.note || '').trim();

export async function patternsFor(db, uid) {
  const deals = (await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(500)))).docs.map((d) => d.data());
  const notes = (await getDocs(query(collection(db, 'users', uid, 'call_notes'), limit(300)))).docs.map((d) => d.data());
  const byEmail = new Map();
  for (const n of notes) {
    const e = String(n.email || '').toLowerCase();
    const text = noteText(n);
    if (!e || !text) continue;
    if (!byEmail.has(e)) byEmail.set(e, []);
    byEmail.get(e).push(text);
  }
  const won = [], lost = [];
  for (const d of deals) {
    const texts = byEmail.get(String(d.email || '').toLowerCase()) || [];
    if (!texts.length) continue;
    if (d.stage === 'closed_won') won.push(...texts.slice(0, 2));
    else if (d.stage === 'closed_lost') lost.push(...texts.slice(0, 2));
  }
  if (won.length + lost.length < 3) return { ok: false, error: 'Not enough call notes yet. Log a few notes on won and lost deals, then try again.' };
  const p = patternsPrompt(won.slice(0, 25), lost.slice(0, 15));
  try {
    const r = await callAI({ uid, feature: 'insights_patterns', tier: 'smart', system: p.system, prompt: p.prompt, maxTokens: 700, json: false });
    return { ok: true, text: r.text, basis: { won: won.length, lost: lost.length } };
  } catch (e) {
    return { ok: false, error: 'The analysis could not run right now. Check your AI key under Integrations, then try again.' };
  }
}

export async function critiqueFor(db, uid, draft, channel = 'general') {
  const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
  const tones = biz.messageStandards || {};
  const p = critiquePrompt(tones[channel] || biz.messageStandard, draft);
  try {
    const r = await callAI({ uid, feature: 'insights_critique', tier: 'fast', system: p.system, prompt: p.prompt, maxTokens: 400, json: false });
    return { ok: true, text: r.text };
  } catch (e) {
    return { ok: false, error: 'The check could not run right now. Check your AI key under Integrations, then try again.' };
  }
}

export async function spendAuditFor(db, uid) {
  const rows = (await getDocs(query(collection(db, 'users', uid, 'marketing_spend'), limit(200)))).docs.map((d) => d.data());
  const deals = (await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(500)))).docs.map((d) => d.data());
  const won = {};
  for (const d of deals) if (d.stage === 'closed_won') { const k = String(d.source || 'unrecorded'); won[k] = (won[k] || 0) + 1; }
  if (!rows.length) return { ok: false, error: 'No ad spend has been synced yet. Connect Google Ads or Meta, then try again.' };
  const p = spendAuditPrompt(rows, won);
  try {
    const r = await callAI({ uid, feature: 'insights_spend_audit', tier: 'smart', system: p.system, prompt: p.prompt, maxTokens: 600, json: false });
    return { ok: true, text: r.text };
  } catch (e) {
    return { ok: false, error: 'The audit could not run right now. Check your AI key under Integrations, then try again.' };
  }
}

export async function reactivationFor(db, uid) {
  const deals = (await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(300)))).docs.map((d) => d.data());
  const notes = (await getDocs(query(collection(db, 'users', uid, 'call_notes'), limit(300)))).docs.map((d) => d.data());
  const byEmail = new Map();
  for (const n of notes) { const e = String(n.email || '').toLowerCase(); const t = noteText(n); if (e && t) { if (!byEmail.has(e)) byEmail.set(e, []); byEmail.get(e).push(t); } }
  const lost = [];
  for (const d of deals) if (d.stage === 'closed_lost') for (const t of (byEmail.get(String(d.email || '').toLowerCase()) || []).slice(0, 2)) lost.push(t);
  if (lost.length < 2) return { ok: false, error: 'Not enough notes on lost deals yet to group them.' };
  const p = reactivationPrompt(lost.slice(0, 40));
  try {
    const r = await callAI({ uid, feature: 'insights_reactivation', tier: 'smart', system: p.system, prompt: p.prompt, maxTokens: 800, json: false });
    return { ok: true, text: r.text, basis: lost.length };
  } catch (e) {
    return { ok: false, error: 'The grouping could not run right now. Check your AI key under Integrations, then try again.' };
  }
}
