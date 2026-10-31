// app/api/voice/recording/route.js - PUBLIC (listed in proxy.js). Twilio calls this as a call's recording progresses. The signed token
// names the call; the recording's place is kept on it. The audio itself is fetched later, by the owner, through the app.
import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/server/route-helpers.js';
import { getDoc, updateDoc, doc } from '../../../../lib/server-firestore.js';
import { verifyVoiceToken } from '../../../../lib/server/voice-agent.js';

export async function POST(request) {
  const who = verifyVoiceToken(new URL(request.url).searchParams.get('t') || '');
  if (!who) return new NextResponse('', { status: 403 });
  const form = await request.formData().catch(() => null);
  const sid = String(form?.get('RecordingSid') || '').slice(0, 64);
  if (!sid) return new NextResponse('', { status: 400 });
  const url = String(form?.get('RecordingUrl') || '').slice(0, 400);
  const ref = doc(getDb(), 'voice_calls', who.callId);
  const snap = await getDoc(ref).catch(() => null);
  if (!snap || !snap.exists() || snap.data().userId !== who.uid) return new NextResponse('', { status: 404 });
  await updateDoc(ref, {
    recording: {
      sid,
      status: String(form?.get('RecordingStatus') || '').slice(0, 20),
      duration: Number(form?.get('RecordingDuration') || 0) || 0,
      url: url ? `${url}.mp3` : (snap.data().recording?.url || ''),
      updatedAt: new Date().toISOString(),
    },
  }).catch(() => {});
  return new NextResponse('', { status: 200 });
}
