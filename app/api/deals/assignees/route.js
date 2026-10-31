// app/api/deals/assignees/route.js - who can own a deal: the owner, and the team's managers (viewers cannot own deals).
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { loadRoster } from '../../../../lib/server/team-store.js';
import { eligibleOwners } from '../../../../lib/assignment.js';

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  try {
    const roster = await loadRoster(getDb(), who.uid);
    return NextResponse.json({ owners: eligibleOwners(roster.members) }, { headers: NO_STORE });
  } catch (e) {
    console.error('[assignees] failed:', e.message);
    return NextResponse.json({ error: 'Could not read the team. Try again.' }, { status: 500, headers: NO_STORE });
  }
}
