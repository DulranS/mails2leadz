import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../lib/supabase';
import { listRecentInboundReplies } from '../../../../lib/gmail';
import { isAuthorizedCronRequest } from '../../../../lib/cronAuth';
import { requireUser } from '../../../../lib/supabaseServer';
import { getOrCreateAccount } from '../../../../lib/account';

export const maxDuration = 55;

// GET /api/inbox/check — Vercel Cron, once/day (see vercel.json). Checks
// EVERY account's Gmail inbox in turn (each with its own credentials) and
// flags replies. Since sending is manual/approval-gated in this product,
// a daily check is enough to stop stale follow-up drafts — no external
// scheduler needed.
export async function GET(request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('channel_email', true)
    .not('gmail_refresh_token', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = {};
  for (const account of accounts || []) {
    try {
      results[account.id] = await checkAccount(account);
    } catch (err) {
      results[account.id] = { error: err.message };
    }
  }
  return NextResponse.json(results);
}

// POST /api/inbox/check — manual "check now" button on the dashboard,
// scoped to the signed-in user's own account.
export async function POST() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const account = await getOrCreateAccount(user.id);
    const result = await checkAccount(account);
    return NextResponse.json(result);
  } catch (err) {
    console.error('inbox/check error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function checkAccount(account) {
  const supabase = getSupabase();
  const credentials = {
    clientId: account.gmail_client_id,
    clientSecret: account.gmail_client_secret,
    refreshToken: account.gmail_refresh_token,
  };
  const replies = await listRecentInboundReplies(credentials, { sinceMinutesAgo: 60 * 25 }); // covers a day + buffer

  let matched = 0;
  for (const reply of replies) {
    const { data: msg } = await supabase
      .from('messages')
      .select('lead_id')
      .eq('account_id', account.id)
      .eq('provider_thread_id', reply.threadId)
      .eq('direction', 'outbound')
      .limit(1)
      .maybeSingle();
    if (!msg) continue;

    matched++;
    await supabase.from('messages').insert({
      account_id: account.id,
      lead_id: msg.lead_id,
      direction: 'inbound',
      channel: 'email',
      body: reply.snippet,
      provider_message_id: reply.messageId,
      provider_thread_id: reply.threadId,
      status: 'received',
    });

    await supabase
      .from('leads')
      .update({ status: 'replied', replied_at: new Date().toISOString(), next_followup_at: null })
      .eq('id', msg.lead_id)
      .neq('status', 'replied');
  }

  return { checked: replies.length, matched_to_leads: matched };
}
