import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../lib/supabase';

// POST /api/webhooks/whatsapp
// Point this at Twilio's WhatsApp sandbox/sender "A message comes in" webhook.
// Unlike email, WhatsApp replies arrive here instantly — no polling needed.
export async function POST(request) {
  try {
    const form = await request.formData();
    const from = (form.get('From') || '').replace('whatsapp:', '');
    const body = form.get('Body') || '';
    const messageSid = form.get('MessageSid') || null;

    if (!from) {
      return NextResponse.json({ error: 'Missing From field' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data: lead } = await supabase
      .from('leads')
      .select('id, status')
      .eq('phone', from)
      .maybeSingle();

    if (lead) {
      await supabase.from('messages').insert({
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

    // Twilio expects a 200 with empty/valid TwiML — empty response is fine
    // when you're not auto-replying via TwiML.
    return new NextResponse('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (err) {
    console.error('webhooks/whatsapp error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
