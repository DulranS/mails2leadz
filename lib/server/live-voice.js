// lib/server/live-voice.js - issues a short-lived voice key so the owner's browser can talk to the voice service. Never throws.
import { realtimeSessionBody } from '../realtime-voice.js';

export async function createLiveSession({ apiKey, instructions, fetchImpl = fetch } = {}) {
  if (!apiKey) return { ok: false, reason: 'no_key' };
  try {
    const r = await fetchImpl('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(realtimeSessionBody({ instructions })),
    });
    if (!r?.ok) return { ok: false, reason: 'refused' };
    const j = await r.json();
    return { ok: true, clientSecret: j.value, expiresAt: j.expires_at, model: realtimeSessionBody({ instructions }).session.model };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
