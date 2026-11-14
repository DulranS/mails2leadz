// lib/server/battle-card.js - prepares a battle card for one customer before a call, from their notes and your catalogue. Nothing is sent. Never throws.
import { collection, doc, getDocs, query, where, limit, setDoc } from '../server-firestore.js';
import { callAI } from '../ai-client.js';
import { buildBattleCard, parseBattleCard } from '../battle-card.js';
import { loadCatalog } from './catalog.js';

export async function battleCardFor(db, uid, email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e.includes('@')) return { ok: false, error: 'Enter the customer\'s email address.' };
  const deal = (await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), where('email', '==', e), limit(1)))).docs[0];
  if (!deal) return { ok: false, error: 'No deal with that email yet. Add the customer first.' };
  const notes = (await getDocs(query(collection(db, 'users', uid, 'call_notes'), limit(200)))).docs.map((d) => d.data())
    .filter((n) => String(n.email || '').toLowerCase() === e).slice(0, 5).map((n) => String(n.summary || n.text || n.note || '')).filter(Boolean).join('\n');
  const data = deal.data();
  const catalogItems = await loadCatalog(db, uid);
  const p = buildBattleCard({ customerName: data.businessName || '', customerMessage: data.lastMessage || '', history: notes, keyword: data.interest || '', catalogItems });
  try {
    const r = await callAI({ uid, feature: 'battle_card', tier: 'smart', system: p.system, prompt: p.prompt, maxTokens: 420, json: false });
    const card = parseBattleCard(r.text);
    await setDoc(doc(db, 'deals', deal.id), { battleCard: card, battleCardAt: new Date().toISOString() }, { merge: true });
    return { ok: true, card };
  } catch (err) {
    return { ok: false, error: 'The battle card could not be written right now. Check your AI key under Integrations, then try again.' };
  }
}
