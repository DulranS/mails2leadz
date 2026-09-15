import { NextResponse } from 'next/server';
import { requireUser } from '../../../lib/supabaseServer';
import { getOrCreateAccount, businessProfileFrom } from '../../../lib/account';
import { remainingQuota } from '../../../lib/quota';

// GET /api/quota
// Today's remaining send allowance per channel for the signed-in account —
// surfaced on the dashboard so an SME owner can see at a glance whether
// they're about to hit their own daily cap (set in Settings), instead of
// only finding out when an approve click 429s.
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const account = await getOrCreateAccount(user.id);
    const business = businessProfileFrom(account);

    const [email, whatsapp] = await Promise.all([
      remainingQuota(account.id, 'email', business.limits.maxEmailsPerDay),
      remainingQuota(account.id, 'whatsapp', business.limits.maxWhatsappPerDay),
    ]);

    return NextResponse.json({
      email: { remaining: email, limit: business.limits.maxEmailsPerDay },
      whatsapp: { remaining: whatsapp, limit: business.limits.maxWhatsappPerDay },
    });
  } catch (err) {
    console.error('quota GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
