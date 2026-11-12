// lib/social.js - drafts for your own Facebook Page and Instagram: limits, what each platform needs, and the approval step. Pure.
export const FB_MAX = 5000;      // characters
export const IG_MAX = 2200;      // caption characters

/** A Page post needs text. A link is optional and must be a web address. */
export function facebookDraft({ text = '', link = '' } = {}) {
  const t = String(text || '').trim();
  if (t.length < 3) return { ok: false, error: 'Write the post first.' };
  if (t.length > FB_MAX) return { ok: false, error: `Facebook posts are at most ${FB_MAX} characters.` };
  const l = String(link || '').trim();
  if (l && !/^https:\/\/[^\s]+$/.test(l)) return { ok: false, error: 'The link must start with https://.' };
  return { ok: true, value: { text: t, link: l } };
}

/** Instagram needs a picture, reachable over https, and a caption of at most 2,200 characters. */
export function instagramDraft({ caption = '', imageUrl = '' } = {}) {
  const c = String(caption || '').trim();
  if (c.length < 1) return { ok: false, error: 'Write a caption.' };
  if (c.length > IG_MAX) return { ok: false, error: `Instagram captions are at most ${IG_MAX} characters.` };
  const u = String(imageUrl || '').trim();
  if (!/^https:\/\/[^\s]+\.(jpg|jpeg|png)(\?[^\s]*)?$/i.test(u)) return { ok: false, error: 'Instagram needs a picture: paste an https link to a JPG or PNG.' };
  return { ok: true, value: { caption: c, imageUrl: u } };
}

/** Posting is a second, deliberate step: the draft must be typed POST to go live. */
export function canPost(draft, confirm) {
  if (!draft || draft.status !== 'draft') return { ok: false, error: 'This draft has already been posted.' };
  if (String(confirm || '') !== 'POST') return { ok: false, error: 'Type POST to publish this draft.' };
  return { ok: true };
}
