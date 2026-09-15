import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../../lib/supabase';
import { requireUser } from '../../../../../lib/supabaseServer';
import { getOrCreateAccount } from '../../../../../lib/account';

// GET /api/leads/:id/messages
// Full conversation history (every draft, sent, rejected, and inbound
// message) for one lead — the "account management" view: an SME owner
// can see exactly what's gone out and what came back, not just the latest
// pending draft. Scoped to the signed-in account, same as everything else.
export async function GET(request, { params }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const account = await getOrCreateAccount(user.id);
    const { id } = await params;

    const supabase = getSupabase();

    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .eq('account_id', account.id)
      .single();
    if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const { data: messages, error: msgErr } = await supabase
      .from('messages')
      .select('*')
      .eq('lead_id', id)
      .eq('account_id', account.id)
      .order('created_at', { ascending: true });
    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

    return NextResponse.json({ lead, messages: messages || [] });
  } catch (err) {
    console.error('leads/[id]/messages error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
