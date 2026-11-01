// app/api/deals/assignees/route.js - who can own a deal: the owner, and the team's managers (viewers cannot own deals).
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { ownersFor } from '../../../../lib/server/owner-settings.js';

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  try {
    return NextResponse.json({ owners: await ownersFor(getDb(), who.uid) }, { headers: NO_STORE });
  } catch (e) {
    console.error('[assignees] failed:', e.message);
    return NextResponse.json({ error: 'Could not read the team. Try again.' }, { status: 500, headers: NO_STORE });
  }
}
