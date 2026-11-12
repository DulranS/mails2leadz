// lib/server/social.js - publishes an approved draft to the owner's own Facebook Page and Instagram account, through Meta's Graph API. Never throws.
import { collection, doc, getDoc, getDocs, query, limit, setDoc, addDoc } from '../server-firestore.js';
import { secretsFor } from './integration-secrets.js';
import { facebookDraft, instagramDraft, canPost } from '../social.js';

const GRAPH = 'https://graph.facebook.com/v19.0';

export async function createSocialDraft(db, uid, { channel, text, link, caption, imageUrl }) {
  const ch = channel === 'instagram' ? 'instagram' : 'facebook';
  const check = ch === 'facebook' ? facebookDraft({ text, link }) : instagramDraft({ caption: caption || text, imageUrl });
  if (!check.ok) return check;
  const ref = await addDoc(collection(db, 'users', uid, 'social_drafts'), { channel: ch, ...check.value, status: 'draft', createdAt: new Date().toISOString() });
  return { ok: true, id: ref.id };
}

export async function publishDraft(db, uid, id, confirm, fetchImpl = fetch) {
  const ref = doc(db, 'users', uid, 'social_drafts', String(id));
  const d = (await getDoc(ref).catch(() => null))?.data?.();
  if (!d) return { ok: false, error: 'That draft was not found.' };
  const gate = canPost(d, confirm);
  if (!gate.ok) return gate;
  const s = await secretsFor(db, uid, ['META_PAGE_ACCESS_TOKEN', 'META_PAGE_ID', 'META_IG_USER_ID']).catch(() => ({}));
  if (!s.META_PAGE_ACCESS_TOKEN) return { ok: false, error: 'Connect your Facebook Page under Integrations first.' };
  try {
    let postId = '';
    if (d.channel === 'facebook') {
      const body = new URLSearchParams({ message: d.text, access_token: s.META_PAGE_ACCESS_TOKEN });
      if (d.link) body.set('link', d.link);
      const r = await fetchImpl(`${GRAPH}/${s.META_PAGE_ID}/feed`, { method: 'POST', body });
      if (!r?.ok) return { ok: false, error: 'Facebook did not accept the post. Check the Page connection and try again.' };
      postId = (await r.json())?.id || '';
    } else {
      if (!s.META_IG_USER_ID) return { ok: false, error: 'Connect your Instagram account (linked to your Page) under Integrations first.' };
      const create = await fetchImpl(`${GRAPH}/${s.META_IG_USER_ID}/media`, { method: 'POST', body: new URLSearchParams({ image_url: d.imageUrl, caption: d.caption, access_token: s.META_PAGE_ACCESS_TOKEN }) });
      if (!create?.ok) return { ok: false, error: 'Instagram did not accept the picture. Check the link and try again.' };
      const creationId = (await create.json())?.id;
      const pub = await fetchImpl(`${GRAPH}/${s.META_IG_USER_ID}/media_publish`, { method: 'POST', body: new URLSearchParams({ creation_id: creationId, access_token: s.META_PAGE_ACCESS_TOKEN }) });
      if (!pub?.ok) return { ok: false, error: 'Instagram did not publish the post. Try again.' };
      postId = (await pub.json())?.id || '';
    }
    await setDoc(ref, { status: 'posted', postedAt: new Date().toISOString(), postId }, { merge: true });
    return { ok: true, postId };
  } catch (e) {
    return { ok: false, error: 'The post could not be sent. Try again.' };
  }
}

export async function listSocialDrafts(db, uid) {
  return (await getDocs(query(collection(db, 'users', uid, 'social_drafts'), limit(50)))).docs.map((x) => ({ id: x.id, ...x.data() }));
}
