import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/supabaseServer';
import { getOrCreateAccount, businessProfileFrom } from '../../../../lib/account';
import { draftMessage } from '../../../../lib/ai';
import { trackUsage } from '../../../../lib/aiUsage';

// POST /api/campaigns/preview  { channel: 'email'|'whatsapp', step?: 0 }
// Drafts a message for a synthetic sample lead using the account's current
// settings — nothing is read from or written to the leads/messages tables.
// This exists so an owner can see what their AI drafts will actually sound
// like right after filling in Settings, without needing to import real
// contacts first and without a real lead ever seeing a test message.
const SAMPLE_LEAD = {
  full_name: 'Jordan Lee',
  company_name: 'Lee & Co. Bookkeeping',
  title: 'Owner',
  research_notes: 'Small accounting firm, 4 employees, mentioned on their site they\u2019re expanding to serve more small retail clients this year.',
};

export async function POST(request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const account = await getOrCreateAccount(user.id);
    const business = businessProfileFrom(account);

    const { channel = 'email', step = 0 } = await request.json().catch(() => ({}));
    if (!['email', 'whatsapp'].includes(channel)) {
      return NextResponse.json({ error: 'channel must be "email" or "whatsapp"' }, { status: 400 });
    }

    const draft = await draftMessage({ lead: SAMPLE_LEAD, step, channel, business });
    await trackUsage(account.id, draft.usage);
    return NextResponse.json({ draft, sample_lead: SAMPLE_LEAD });
  } catch (err) {
    console.error('campaigns/preview error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
