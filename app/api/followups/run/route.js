import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../lib/supabase';
import { draftMessage } from '../../../../lib/ai';
import { sendEmail } from '../../../../lib/gmail';
import { sendWhatsApp } from '../../../../lib/whatsapp';
import { remainingQuota, incrementQuota } from '../../../../lib/quota';
import { computeNextFollowup, statusForStep } from '../../../../lib/followup';
import business from '../../../../business.config';

// POST /api/followups/run
// Intended to be hit by a scheduled job (Vercel Cron, cron-job.org, etc.)
// every 1-2 hours. Finds every lead whose next_followup_at has passed and
// who hasn't replied, sends the next follow-up in the sequence, and either
// schedules the next one or marks the sequence exhausted.
const STOP_STATUSES = ['replied', 'won', 'lost', 'do_not_contact'];

export async function GET() {
  return POST();
}

export async function POST() {
  try {
    const supabase = getSupabase();
    const nowIso = new Date().toISOString();

    const { data: due, error } = await supabase
      .from('leads')
      .select('*')
      .lte('next_followup_at', nowIso)
      .not('status', 'in', `(${STOP_STATUSES.join(',')})`)
      .limit(200);

    if (error) throw error;

    const outcome = { followups_sent: 0, sequence_exhausted: 0, skipped_no_quota: 0, failed: [] };

    for (const lead of due || []) {
      const channel = lead.preferred_channel === 'whatsapp' && business.channels.whatsapp
        ? 'whatsapp'
        : 'email';

      const limit = channel === 'email' ? business.limits.maxEmailsPerDay : business.limits.maxWhatsappPerDay;
      const left = await remainingQuota(channel, limit);
      if (left <= 0) {
        outcome.skipped_no_quota++;
        continue;
      }

      const step = lead.followup_count + 1;

      try {
        // Thread the follow-up onto the original email conversation.
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('provider_thread_id, subject')
          .eq('lead_id', lead.id)
          .eq('channel', 'email')
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const draft = await draftMessage({ lead, step, channel });
        let providerResult;

        if (channel === 'email') {
          const subject = lastMsg?.subject ? `Re: ${lastMsg.subject}` : draft.subject;
          providerResult = await sendEmail({
            to: lead.email,
            subject,
            body: draft.body,
            threadId: lastMsg?.provider_thread_id,
          });
        } else {
          providerResult = await sendWhatsApp({ to: lead.phone, body: draft.body });
        }

        await supabase.from('messages').insert({
          lead_id: lead.id,
          direction: 'outbound',
          channel,
          sequence_step: step,
          subject: draft.subject || null,
          body: draft.body,
          provider_message_id: providerResult.messageId,
          provider_thread_id: providerResult.threadId || lastMsg?.provider_thread_id || null,
          status: 'sent',
        });

        const nextFollowup = computeNextFollowup(step);
        await supabase
          .from('leads')
          .update({
            status: nextFollowup ? statusForStep(step) : 'sequence_exhausted',
            followup_count: step,
            last_contacted_at: new Date().toISOString(),
            next_followup_at: nextFollowup ? nextFollowup.toISOString() : null,
          })
          .eq('id', lead.id);

        await incrementQuota(channel, 1);
        outcome.followups_sent++;
        if (!nextFollowup) outcome.sequence_exhausted++;
      } catch (sendErr) {
        console.error(`Follow-up failed for ${lead.email}:`, sendErr.message);
        outcome.failed.push({ email: lead.email, error: sendErr.message });
      }
    }

    return NextResponse.json(outcome);
  } catch (err) {
    console.error('followups/run error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
