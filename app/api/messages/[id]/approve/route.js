import { NextResponse } from 'next/server';
import { getSupabase } from '../../../../../lib/supabase';
import { sendEmail } from '../../../../../lib/gmail';
import { sendWhatsApp } from '../../../../../lib/whatsapp';
import { incrementQuota, remainingQuota } from '../../../../../lib/quota';
import { computeNextFollowup, statusForStep } from '../../../../../lib/followup';
import { unsubscribeUrl } from '../../../../../lib/unsubscribe';
import { requireUser } from '../../../../../lib/supabaseServer';
import { getOrCreateAccount, businessProfileFrom } from '../../../../../lib/account';

// POST /api/messages/:id/approve  { "subject": "...", "body": "..." }
// This is the ONLY place anything actually gets sent to a lead. Optional
// subject/body override lets you edit the AI draft before it goes out.
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const account = await getOrCreateAccount(user.id);
    const business = businessProfileFrom(account);

    const { id } = await params;
    const overrides = await request.json().catch(() => ({}));

    const supabase = getSupabase();
    const { data: message, error: msgErr } = await supabase
      .from('messages')
      .select('*, leads(*)')
      .eq('id', id)
      .eq('account_id', account.id) // ownership check — can't approve another account's message
      .single();
    if (msgErr || !message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    if (message.status !== 'draft') {
      return NextResponse.json({ error: `Message already ${message.status}` }, { status: 409 });
    }

    const lead = message.leads;
    const channel = message.channel;
    const limit = channel === 'email' ? business.limits.maxEmailsPerDay : business.limits.maxWhatsappPerDay;
    const left = await remainingQuota(account.id, channel, limit);
    if (left <= 0) {
      return NextResponse.json({ error: `Daily ${channel} quota reached — try again tomorrow` }, { status: 429 });
    }

    const subject = overrides.subject ?? message.subject;
    let body = overrides.body ?? message.body;

    let providerResult;
    if (channel === 'email') {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
      body += `\n\n---\nDon't want to hear from us again? ${unsubscribeUrl(baseUrl, lead.id)}`;

      providerResult = await sendEmail(
        {
          clientId: account.gmail_client_id,
          clientSecret: account.gmail_client_secret,
          refreshToken: account.gmail_refresh_token,
          senderEmail: account.gmail_sender_email,
        },
        { to: lead.email, subject, body, threadId: message.provider_thread_id }
      );
    } else {
      providerResult = await sendWhatsApp(
        {
          accountSid: account.twilio_account_sid,
          authToken: account.twilio_auth_token,
          whatsappNumber: account.twilio_whatsapp_number,
        },
        { to: lead.phone, body }
      );
    }

    await supabase
      .from('messages')
      .update({
        status: 'sent',
        subject,
        body,
        provider_message_id: providerResult.messageId,
        provider_thread_id: providerResult.threadId || message.provider_thread_id,
        sent_at: new Date().toISOString(),
      })
      .eq('id', id);

    const step = message.sequence_step;
    const nextFollowup = computeNextFollowup(step, business.limits);

    await supabase
      .from('leads')
      .update({
        status: nextFollowup ? statusForStep(step) : 'sequence_exhausted',
        followup_count: step,
        last_contacted_at: new Date().toISOString(),
        next_followup_at: nextFollowup ? nextFollowup.toISOString() : null,
      })
      .eq('id', lead.id);

    await incrementQuota(account.id, channel, 1);

    return NextResponse.json({ sent: true, messageId: providerResult.messageId });
  } catch (err) {
    console.error('messages/approve error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
