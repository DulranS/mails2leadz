import { NextResponse } from 'next/server';
import { requireUser } from '../../../lib/supabaseServer';
import { getOrCreateAccount } from '../../../lib/account';
import { getSupabase } from '../../../lib/supabase';

const EDITABLE_FIELDS = [
  'name', 'sender_name', 'sender_role', 'offer_type', 'offer_description', 'cta', 'tone',
  'channel_email', 'gmail_client_id', 'gmail_client_secret', 'gmail_refresh_token', 'gmail_sender_email',
  'channel_whatsapp', 'twilio_account_sid', 'twilio_auth_token', 'twilio_whatsapp_number',
  'max_emails_per_day', 'max_whatsapp_per_day', 'min_hours_between_followups', 'max_followups',
];

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const account = await getOrCreateAccount(user.id);
  return NextResponse.json({ account });
}

export async function PUT(request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const account = await getOrCreateAccount(user.id);
  const body = await request.json();

  const updates = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) updates[field] = body[field];
  }
  updates.updated_at = new Date().toISOString();

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('accounts')
    .update(updates)
    .eq('id', account.id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account: data });
}
