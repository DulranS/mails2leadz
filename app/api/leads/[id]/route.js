import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../lib/supabase';
import { requireUser } from '../../../../lib/supabaseServer';
import { getOrCreateAccount } from '../../../../lib/account';

const ALLOWED_STATUSES = ['do_not_contact', 'won', 'lost', 'new'];

// PATCH /api/leads/:id  { "status": "do_not_contact" }
// Manual override — e.g. marking a lead do-not-contact after a phone call,
// or "won" once a deal closes. Deliberately narrow: this is not a general
// lead editor, just the handful of manual controls an SME actually needs.
export async function PATCH(request, { params }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const account = await getOrCreateAccount(user.id);

    const { id } = await params;
    const { status } = await request.json();
    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of ${ALLOWED_STATUSES.join(', ')}` }, { status: 400 });
    }

    const supabase = getSupabase();
    const updates = { status };
    if (status === 'do_not_contact' || status === 'won' || status === 'lost') {
      updates.next_followup_at = null;
    }

    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', id)
      .eq('account_id', account.id)
      .select('*')
      .single();

    if (error || !data) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    return NextResponse.json({ lead: data });
  } catch (err) {
    console.error('leads/[id] PATCH error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
