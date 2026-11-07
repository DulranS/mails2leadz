// app/api/integrations/intake/route.js - the owner's lead-form addresses: shown on the Integrations page; rotated on request. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { currentIntakeId, rotateIntakeId } from '../../../../lib/server/intake.js';
import { FORMS, intakeUrl } from '../../../../lib/intake.js';

const originOf = (request) => {
  const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  return /^https:\/\//.test(envBase) ? new URL(envBase).origin : request.nextUrl.origin;
};
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

async function summary(request, db, uid, id) {
  const origin = originOf(request);
  const urls = Object.fromEntries(Object.keys(FORMS).map((p) => [p, { label: FORMS[p].label, url: intakeUrl(origin, id, p), needs: FORMS[p].needs }]));
  return reply({ intakeId: id, urls });
}

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  return summary(request, db, who.uid, await currentIntakeId(db, who.uid));
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  return summary(request, db, who.uid, await rotateIntakeId(db, who.uid));
}
