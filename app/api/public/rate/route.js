// POST /api/public/rate - saves a customer's rating of a resolved request. The private key must match. Public by design, key-checked.
import { doc, getDoc, setDoc } from '../../../../lib/server-firestore.js';
import { getDb } from '../../../../lib/server/route-helpers.js';
import { checkKey } from '../../../../lib/customer-links.js';

const page = (msg) => new Response(`<!doctype html><meta charset="utf-8"><main style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:0 16px"><p>${msg}</p></main>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

export async function POST(request) {
  try {
    const f = await request.formData();
    const uid = String(f.get('uid') || ''), ticketId = String(f.get('ticketId') || ''), k = String(f.get('k') || '');
    const score = Number(f.get('score'));
    const comment = String(f.get('comment') || '').slice(0, 200);
    if (!uid || !ticketId || !(score >= 1 && score <= 5)) return page('Please choose a score from 1 to 5.');
    const ref = doc(getDb(), 'users', uid, 'support_tickets', ticketId);
    const t = (await getDoc(ref).then((s) => s.data()).catch(() => null));
    if (!t || !checkKey(t.accessKey, k) || t.status !== 'resolved') return page('We could not record that rating.');
    await setDoc(ref, { csatScore: Math.round(score), csatComment: comment, csatAt: new Date().toISOString() }, { merge: true });
    return page('Thank you. Your rating has been recorded.');
  } catch (e) {
    return page('Something went wrong. Please try again.');
  }
}
