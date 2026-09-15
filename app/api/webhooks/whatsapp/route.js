import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../lib/supabase';

// POST /api/webhooks/whatsapp
// Point EACH account's Twilio WhatsApp sender's "when a message comes in"
// webhook at this same URL — the `To` field (the Twilio number that
// received the message) tells us which account it belongs to, since each
// account has its own Twilio WhatsApp number.
export async function POST(request) {
  try {
    const form = await request.formData();
    const from = (form.get('From') || '').replace('whatsapp:', '');
    const to = (form.get('To') || '').replace('whatsapp:', '');
    const body = form.get('Body') || '';
    const messageSid = form.get('MessageSid') || null;

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing From/To field' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('twilio_whatsapp_number', to)
      .maybeSingle();

    if (account) {
      const { data: lead } = await supabase
        .from('leads')
        .select('id, status')
        .eq('account_id', account.id)
        .eq('phone', from)
        .maybeSingle();

      if (lead) {
        await supabase.from('messages').insert({
          account_id: account.id,
          lead_id: lead.id,
          direction: 'inbound',
          channel: 'whatsapp',
          body,
          provider_message_id: messageSid,
          status: 'received',
        });

        if (lead.status !== 'replied') {
          await supabase
            .from('leads')
            .update({ status: 'replied', replied_at: new Date().toISOString(), next_followup_at: null })
            .eq('id', lead.id);
        }
      }
    }

    return new NextResponse('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (err) {
    console.error('webhooks/whatsapp error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
