import { NextResponse } from 'next/server';
import { getSupabase } from '../../../lib/supabase';
import { verifyUnsubscribeToken } from '../../../lib/unsubscribe';

// GET /api/unsubscribe?lead=<id>&token=<hmac>
// Every outbound email includes this link (added in the approve route, not
// left to the AI to draft — this text must always be exact and present).
// One click, no login, no external unsubscribe-management platform needed.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get('lead');
  const token = searchParams.get('token');

  if (!leadId || !token || !verifyUnsubscribeToken(leadId, token)) {
    return new NextResponse('Invalid or expired unsubscribe link.', { status: 400 });
  }

  const supabase = getSupabase();
  await supabase
    .from('leads')
    .update({ status: 'do_not_contact', next_followup_at: null })
    .eq('id', leadId);

  return new NextResponse(
    '<html><body style="font-family:system-ui;padding:40px;text-align:center;">' +
      "<h2>You've been unsubscribed.</h2><p>You won't receive further messages from us.</p>" +
      '</body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}
