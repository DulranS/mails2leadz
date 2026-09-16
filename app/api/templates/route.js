import { NextResponse } from 'next/server';
import { getSupabase } from '../../../lib/supabase';
import { requireUser } from '../../../lib/supabaseServer';
import { getOrCreateAccount } from '../../../lib/account';
import { listTemplates, saveTemplateFromMessage } from '../../../lib/templates';

// GET /api/templates — this account's saved playbook, newest first.
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const account = await getOrCreateAccount(user.id);
    const templates = await listTemplates(account.id);
    return NextResponse.json({ templates });
  } catch (err) {
    console.error('templates GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/templates  { message_id, name? }
// Saves an already-SENT message (the account's own real copy) as a
// reusable template. Refuses drafts/rejected/failed messages — a template
// is meant to capture what actually worked, not an unreviewed AI guess.
export async function POST(request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const account = await getOrCreateAccount(user.id);

    const { message_id, name } = await request.json().catch(() => ({}));
    if (!message_id) return NextResponse.json({ error: 'message_id is required' }, { status: 400 });

    const supabase = getSupabase();
    const { data: message, error } = await supabase
      .from('messages')
      .select('*')
      .eq('id', message_id)
      .eq('account_id', account.id) // ownership check
      .single();
    if (error || !message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    if (message.status !== 'sent') {
      return NextResponse.json({ error: 'Only a sent message can be saved as a template' }, { status: 409 });
    }

    const template = await saveTemplateFromMessage(account.id, message, name);
    return NextResponse.json({ template });
  } catch (err) {
    console.error('templates POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
