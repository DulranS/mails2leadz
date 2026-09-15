import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../lib/supabase';
import { listRecentInboundReplies } from '../../../../lib/gmail';
import { isAuthorizedCronRequest } from '../../../../lib/cronAuth';

export const maxDuration = 30;

// POST /api/inbox/check
// Intended to be hit every 15-30 minutes by a free external scheduler
// (Vercel Cron can't do this on Hobby — capped at once/day). Polling (not a
// Gmail push subscription) is the deliberate choice here — push requires a
// Google Cloud Pub/Sub topic + domain verification, which is real setup
// overhead you don't need to take on until volume justifies it. Polling every
// 15-30 min is indistinguishable from "instant" for a B2B sales inbox.
export async function GET(request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return POST();
}

export async function POST() {
  try {
    const supabase = getSupabase();
    const replies = await listRecentInboundReplies({ sinceMinutesAgo: 45 });

    let matched = 0;
    for (const reply of replies) {
      const { data: msg } = await supabase
        .from('messages')
        .select('lead_id')
        .eq('provider_thread_id', reply.threadId)
        .eq('direction', 'outbound')
        .limit(1)
        .maybeSingle();

      if (!msg) continue; // reply to a thread we didn't start via this system

      matched++;
      await supabase.from('messages').insert({
        lead_id: msg.lead_id,
        direction: 'inbound',
        channel: 'email',
        body: reply.snippet,
        provider_message_id: reply.messageId,
        provider_thread_id: reply.threadId,
        status: 'received',
      });

      // Stop the sequence immediately — a human needs to take over from here.
      await supabase
        .from('leads')
        .update({ status: 'replied', replied_at: new Date().toISOString(), next_followup_at: null })
        .eq('id', msg.lead_id)
        .neq('status', 'replied'); // idempotent if checked twice before the update lands
    }

    return NextResponse.json({ checked: replies.length, matched_to_leads: matched });
  } catch (err) {
    console.error('inbox/check error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
