import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../lib/supabase';
import { draftMessage } from '../../../../lib/ai';
import { requireUser } from '../../../../lib/supabaseServer';
import { getOrCreateAccount, businessProfileFrom } from '../../../../lib/account';
import { isAuthorizedCronRequest } from '../../../../lib/cronAuth';

export const maxDuration = 60;
const DEFAULT_LIMIT = 10;

// GET  /api/campaigns/draft  — Vercel Cron, once/day (see vercel.json).
// Drafts messages but sends NOTHING — safe to automate fully, nothing here
// touches a third party, so there's no compliance/spam risk in running it
// on a schedule with no human in the loop yet.
export async function GET(request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return draftForAllAccounts();
}

// POST /api/campaigns/draft  { "limit": 10 }  — manual trigger from the dashboard,
// scoped to the signed-in user's own account.
export async function POST(request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const account = await getOrCreateAccount(user.id);

    const body = await request.json().catch(() => ({}));
    const limit = Math.min(body.limit || DEFAULT_LIMIT, 25);

    const outcome = await draftForAccount(account, limit);
    return NextResponse.json(outcome);
  } catch (err) {
    console.error('campaigns/draft error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function draftForAllAccounts() {
  const supabase = getSupabase();
  const { data: accounts, error } = await supabase.from('accounts').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = {};
  for (const account of accounts || []) {
    try {
      results[account.id] = await draftForAccount(account, DEFAULT_LIMIT);
    } catch (err) {
      results[account.id] = { error: err.message };
    }
  }
  return NextResponse.json(results);
}

async function draftForAccount(account, limit) {
  const supabase = getSupabase();
  const business = businessProfileFrom(account);

  const { data: candidates, error } = await supabase
    .from('leads')
    .select('*')
    .eq('account_id', account.id)
    .eq('status', 'new')
    .limit(200);
  if (error) throw error;

  const scoreRank = { HOT: 0, WARM: 1, UNSCORED: 2, COLD: 3 };
  const queue = (candidates || [])
    .sort((a, b) => (scoreRank[a.score] ?? 2) - (scoreRank[b.score] ?? 2))
    .slice(0, limit);

  const outcome = { drafted: 0, skipped_no_channel: 0, failed: [] };

  for (const lead of queue) {
    const channel = account.channel_whatsapp && lead.preferred_channel === 'whatsapp' ? 'whatsapp' : 'email';
    if ((channel === 'email' && !account.channel_email) || (channel === 'whatsapp' && !lead.phone)) {
      outcome.skipped_no_channel++;
      continue;
    }

    try {
      const draft = await draftMessage({ lead, step: 0, channel, business });

      await supabase.from('messages').insert({
        account_id: account.id,
        lead_id: lead.id,
        direction: 'outbound',
        channel,
        sequence_step: 0,
        subject: draft.subject || null,
        body: draft.body,
        status: 'draft',
      });

      await supabase.from('leads').update({ status: 'drafted', preferred_channel: channel }).eq('id', lead.id);
      outcome.drafted++;
    } catch (err) {
      console.error(`Draft failed for ${lead.email}:`, err.message);
      outcome.failed.push({ email: lead.email, error: err.message });
    }
  }

  return outcome;
}
