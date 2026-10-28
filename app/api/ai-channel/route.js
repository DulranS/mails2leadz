// app/api/ai-channel/route.js - a short WhatsApp or SMS draft, or a call brief. Text only: nothing is sent or called from here.
import { NextResponse } from 'next/server';
import { uidFromRequest, NO_STORE, clip } from '../../../lib/server/route-helpers.js';
import { callAI, getBusinessProfile } from '../../../lib/ai-client.js';
import { channelMessages, CHANNEL_KINDS } from '../../../lib/channel-drafts.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  const uid = uidFromRequest(request);
  if (!uid) return json({ success: false, error: 'Please sign in again.' }, 401);
  let input;
  try { input = await request.json(); }
  catch { return json({ success: false, error: 'Send the request as JSON.' }, 400); }
  const kind = String(input?.kind || '');
  if (!CHANNEL_KINDS.includes(kind)) return json({ success: false, error: 'Choose WhatsApp, SMS or a call brief.' }, 400);
  try {
    const profile = await getBusinessProfile(uid);
    if (!profile.offer) return json({ success: false, error: 'Describe what you sell in Account first, so the draft says the right thing.' }, 400);
    const { system, prompt } = channelMessages({
      kind, offer: profile.offer, company: clip(input.company, 120), stage: clip(input.stage, 40), note: clip(input.note, 800),
    });
    const ai = await callAI({ uid, feature: 'customer_checkin', tier: 'fast', system, prompt, maxTokens: 300 });
    const text = String(ai.data?.text || '').trim().slice(0, 1200);
    if (!text) return json({ success: false, error: 'The draft came back empty. Try again.' }, 502);
    return json({ success: true, text });
  } catch (e) {
    console.error('ai-channel failed:', e?.message);
    return json({ success: false, error: 'Could not create the draft right now.' }, 500);
  }
}
