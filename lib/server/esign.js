// lib/server/esign.js - sends an agreement for electronic signature through the owner's Dropbox Sign key, and keeps each request's status current. Never throws.
import { collection, doc, getDocs, query, where, limit, setDoc } from '../server-firestore.js';
import { secretsFor } from './integration-secrets.js';
import { textToPdf } from '../pdf-text.js';
import { withSignatureBlock, signatureRequestFields, isComplete, DROPBOX_SIGN } from '../esign.js';

const auth = (key) => ({ Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` });

export async function sendForSignature(db, uid, { text, title, signerEmail, signerName, testMode = false }, fetchImpl = fetch) {
  const s = await secretsFor(db, uid, ['DROPBOX_SIGN_API_KEY']).catch(() => ({}));
  if (!s.DROPBOX_SIGN_API_KEY) return { ok: false, error: 'Connect Dropbox Sign under Integrations first.' };
  const pdf = textToPdf(withSignatureBlock(text, signerName));
  const form = new FormData();
  for (const [k, v] of signatureRequestFields({ title, signerEmail, signerName, testMode })) form.append(k, v);
  form.append('file[0]', new Blob([pdf], { type: 'application/pdf' }), 'agreement.pdf');
  const r = await fetchImpl(`${DROPBOX_SIGN}/signature_request/send`, { method: 'POST', headers: auth(s.DROPBOX_SIGN_API_KEY), body: form }).catch(() => null);
  if (!r?.ok) return { ok: false, error: 'Dropbox Sign did not accept the request. Check the key and the signer email.' };
  const id = (await r.json())?.signature_request?.signature_request_id;
  if (!id) return { ok: false, error: 'Dropbox Sign did not return a request id.' };
  await setDoc(doc(db, 'users', uid, 'esign_requests', String(id)), { signatureRequestId: String(id), title: String(title || 'Agreement').slice(0, 255), signerEmail: String(signerEmail).slice(0, 200), status: 'sent', testMode: !!testMode, createdAt: new Date().toISOString(), checkedAt: null, signedAt: null });
  return { ok: true, id: String(id) };
}

/** Asks Dropbox Sign about requests not yet signed. Run daily; cheap when there is nothing open. */
export async function checkOpenRequests(db, uid, fetchImpl = fetch, now = Date.now()) {
  try {
    const s = await secretsFor(db, uid, ['DROPBOX_SIGN_API_KEY']).catch(() => ({}));
    if (!s.DROPBOX_SIGN_API_KEY) return { checked: 0, signed: [] };
    const open = (await getDocs(query(collection(db, 'users', uid, 'esign_requests'), where('status', '==', 'sent'), limit(20)))).docs;
    const signed = [];
    for (const d of open) {
      const r = await fetchImpl(`${DROPBOX_SIGN}/signature_request/${encodeURIComponent(d.id)}`, { headers: auth(s.DROPBOX_SIGN_API_KEY) }).catch(() => null);
      if (!r?.ok) continue;
      const json = await r.json();
      const done = isComplete(json);
      await setDoc(doc(db, 'users', uid, 'esign_requests', d.id), { checkedAt: new Date(now).toISOString(), ...(done ? { status: 'signed', signedAt: new Date(now).toISOString() } : {}) }, { merge: true });
      if (done) signed.push({ id: d.id, title: d.data().title, signerEmail: d.data().signerEmail });
    }
    return { checked: open.length, signed };
  } catch (e) {
    console.error('[esign] check failed:', uid, String(e?.message || '').slice(0, 120));
    return { checked: 0, signed: [] };
  }
}
