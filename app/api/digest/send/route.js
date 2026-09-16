import { NextResponse } from 'next/server';
import { sendDailyDigests, buildDigestForAccount } from '../../../../lib/digest';
import { isAuthorizedCronRequest } from '../../../../lib/cronAuth';
import { requireUser } from '../../../../lib/supabaseServer';
import { getOrCreateAccount } from '../../../../lib/account';
import { sendEmail } from '../../../../lib/gmail';

export const maxDuration = 30;

// GET /api/digest/send — Vercel Cron, once/day (see vercel.json). Emails
// each account owner a summary of drafts waiting + new replies, sent to
// THEIR OWN mailbox only — see lib/digest.js for why that makes it safe to
// run unattended alongside the other (draft-only, never-send) crons.
//
// If your Vercel plan's cron-job count is tighter than 4, this route's
// logic can just as well be called from inside app/api/followups/draft's
// GET handler at the very end (import sendDailyDigests from lib/digest and
// await it there) instead of registering a 4th cron entry — it's written
// as a standalone function specifically so either wiring works.
export async function GET(request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const results = await sendDailyDigests();
  return NextResponse.json(results);
}

// POST /api/digest/send — "send me a test digest now" button in Settings,
// scoped to the signed-in user's own account only.
export async function POST() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const account = await getOrCreateAccount(user.id);

    const digest = await buildDigestForAccount(account);
    if (!digest) {
      return NextResponse.json({
        sent: false,
        reason: 'Nothing to report right now — no drafts waiting and no new replies, so no email was sent.',
      });
    }
    await sendEmail(
      {
        clientId: account.gmail_client_id,
        clientSecret: account.gmail_client_secret,
        refreshToken: account.gmail_refresh_token,
        senderEmail: account.gmail_sender_email,
      },
      { to: account.gmail_sender_email, subject: `[Test] ${digest.subject}`, body: digest.body }
    );
    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error('digest/send POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
