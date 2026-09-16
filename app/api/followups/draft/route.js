import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../lib/supabase';
import { draftMessage } from '../../../../lib/ai';
import { trackUsage } from '../../../../lib/aiUsage';
import { getBestTemplates } from '../../../../lib/templates';
import { businessProfileFrom } from '../../../../lib/account';
import { isAuthorizedCronRequest } from '../../../../lib/cronAuth';

export const maxDuration = 60;
const BATCH_LIMIT = 30;
const STOP_STATUSES = ['replied', 'won', 'lost', 'do_not_contact', 'sequence_exhausted', 'drafted'];

// GET /api/followups/draft — Vercel Cron, once/day. Only DRAFTS the next
// follow-up for leads that are due — nothing sends until a human approves
// it (app/api/messages/[id]/approve), so this is safe to run unattended.
// Drafting pauses the lead's schedule (next_followup_at -> null) so it
// won't get re-drafted daily while a draft sits unreviewed.
export async function GET(request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from('leads')
    .select('*, accounts(*)')
    .lte('next_followup_at', nowIso)
    .not('status', 'in', `(${STOP_STATUSES.join(',')})`)
    .limit(BATCH_LIMIT);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const outcome = { drafted: 0, sequence_exhausted: 0, failed: [] };

  for (const lead of due || []) {
    const account = lead.accounts;
    if (!account) continue;
    const business = businessProfileFrom(account);
    const step = lead.followup_count + 1;

    if (step > business.limits.maxFollowups) {
      await supabase.from('leads').update({ status: 'sequence_exhausted', next_followup_at: null }).eq('id', lead.id);
      outcome.sequence_exhausted++;
      continue;
    }

    const channel = lead.preferred_channel === 'whatsapp' && account.channel_whatsapp ? 'whatsapp' : 'email';

    try {
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('provider_thread_id, subject')
        .eq('lead_id', lead.id)
        .eq('channel', 'email')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const templateExamples = await getBestTemplates(account.id, channel, step);
      const draft = await draftMessage({ lead, step, channel, business, templateExamples });
      await trackUsage(account.id, draft.usage);
      const subject = channel === 'email' && lastMsg?.subject ? `Re: ${lastMsg.subject}` : draft.subject;

      await supabase.from('messages').insert({
        account_id: account.id,
        lead_id: lead.id,
        direction: 'outbound',
        channel,
        sequence_step: step,
        subject: subject || null,
        body: draft.body,
        provider_thread_id: lastMsg?.provider_thread_id || null,
        status: 'draft',
      });

      await supabase.from('leads').update({ status: 'drafted', next_followup_at: null }).eq('id', lead.id);
      outcome.drafted++;
    } catch (err) {
      console.error(`Follow-up draft failed for lead ${lead.id}:`, err.message);
      outcome.failed.push({ leadId: lead.id, error: err.message });
    }
  }

  return NextResponse.json(outcome);
}
