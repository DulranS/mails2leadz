import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../../lib/supabase';
import { requireUser } from '../../../../../lib/supabaseServer';
import { getOrCreateAccount } from '../../../../../lib/account';
import { statusForStep } from '../../../../../lib/followup';

// POST /api/messages/:id/reject
// Discards a draft without sending it. The lead becomes eligible for a
// fresh draft on the next campaigns/draft or followups/draft run (or the
// dashboard's manual buttons) — set immediately-due rather than retried
// automatically, so a rejected message never turns into a silent retry loop.
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const account = await getOrCreateAccount(user.id);

    const { id } = await params;
    const supabase = getSupabase();

    const { data: message, error: msgErr } = await supabase
      .from('messages')
      .select('*')
      .eq('id', id)
      .eq('account_id', account.id)
      .single();
    if (msgErr || !message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    if (message.status !== 'draft') {
      return NextResponse.json({ error: `Message already ${message.status}` }, { status: 409 });
    }

    await supabase.from('messages').update({ status: 'rejected' }).eq('id', id);

    const revertStatus = message.sequence_step === 0 ? 'new' : statusForStep(message.sequence_step - 1);
    await supabase
      .from('leads')
      .update({ status: revertStatus, next_followup_at: new Date().toISOString() })
      .eq('id', message.lead_id);

    return NextResponse.json({ rejected: true });
  } catch (err) {
    console.error('messages/reject error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
