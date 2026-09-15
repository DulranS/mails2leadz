import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../lib/supabase';
import { draftMessage } from '../../../../lib/ai';
import { sendEmail } from '../../../../lib/gmail';
import { sendWhatsApp } from '../../../../lib/whatsapp';
import { remainingQuota, incrementQuota } from '../../../../lib/quota';
import { computeNextFollowup, statusForStep } from '../../../../lib/followup';
import { isAuthorizedCronRequest } from '../../../../lib/cronAuth';
import business from '../../../../business.config';

// Vercel Hobby caps function duration and — separately — caps Cron to once a
// day, so 60s is generously more than one daily batch of DEFAULT_LIMIT needs.
export const maxDuration = 60;
const DEFAULT_LIMIT = 10; // keep a single invocation comfortably inside maxDuration

// GET  /api/campaigns/send  — Vercel Cron hits this once/day (see vercel.json).
// Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when
// CRON_SECRET is set, so this doubles as auth for the scheduled run.
export async function GET(request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return POST(new Request('http://internal/', { method: 'POST', body: '{}' }));
}

// POST /api/campaigns/send  { "limit": 10 }   — manual trigger from the dashboard
// Sends the FIRST-touch message to up to `limit` leads with status='new',
// prioritizing HOT then WARM then COLD, respecting daily channel quotas.
// Safe to call repeatedly — never double-sends because it only ever selects
// status='new' leads and flips status immediately after a successful send.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedLimit = Math.min(body.limit || DEFAULT_LIMIT, 25); // hard ceiling protects maxDuration

    const supabase = getSupabase();
    const { data: candidates, error } = await supabase
      .from('leads')
      .select('*')
      .eq('status', 'new')
      .order('score', { ascending: true }) // 'COLD' < 'HOT' < 'WARM' alphabetically is wrong, so re-sort below
      .limit(200);

    if (error) throw error;

    const scoreRank = { HOT: 0, WARM: 1, UNSCORED: 2, COLD: 3 };
    const queue = (candidates || [])
      .sort((a, b) => (scoreRank[a.score] ?? 2) - (scoreRank[b.score] ?? 2))
      .slice(0, requestedLimit);

    const outcome = { sent: 0, skipped_no_quota: 0, skipped_no_channel: 0, failed: [] };

    for (const lead of queue) {
      const channel = business.channels.whatsapp && lead.preferred_channel === 'whatsapp'
        ? 'whatsapp'
        : 'email';

      if (!business.channels[channel]) {
        outcome.skipped_no_channel++;
        continue;
      }
      if (channel === 'whatsapp' && !lead.phone) {
        outcome.skipped_no_channel++;
        continue;
      }

      const limit = channel === 'email' ? business.limits.maxEmailsPerDay : business.limits.maxWhatsappPerDay;
      const left = await remainingQuota(channel, limit);
      if (left <= 0) {
        outcome.skipped_no_quota++;
        continue;
      }

      try {
        const draft = await draftMessage({ lead, step: 0, channel });
        let providerResult;

        if (channel === 'email') {
          providerResult = await sendEmail({ to: lead.email, subject: draft.subject, body: draft.body });
        } else {
          providerResult = await sendWhatsApp({ to: lead.phone, body: draft.body });
        }

        await supabase.from('messages').insert({
          lead_id: lead.id,
          direction: 'outbound',
          channel,
          sequence_step: 0,
          subject: draft.subject || null,
          body: draft.body,
          provider_message_id: providerResult.messageId,
          provider_thread_id: providerResult.threadId || null,
          status: 'sent',
        });

        const nextFollowup = computeNextFollowup(0);
        await supabase
          .from('leads')
          .update({
            status: statusForStep(0),
            last_contacted_at: new Date().toISOString(),
            next_followup_at: nextFollowup ? nextFollowup.toISOString() : null,
            preferred_channel: channel,
          })
          .eq('id', lead.id);

        await incrementQuota(channel, 1);
        outcome.sent++;
      } catch (sendErr) {
        console.error(`Failed to send to ${lead.email}:`, sendErr.message);
        outcome.failed.push({ email: lead.email, error: sendErr.message });
      }
    }

    return NextResponse.json(outcome);
  } catch (err) {
    console.error('campaigns/send error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
