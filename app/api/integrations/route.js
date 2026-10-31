// app/api/integrations/route.js - which outside services are connected for THIS account. Names and states only, never values.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { integrationStatus } from '../../../lib/integrations.js';
import { accountSecretBoxes, presenceFor, vaultConfigured, SECRET_NAMES } from '../../../lib/server/integration-secrets.js';
import { saasEnabled } from '../../../lib/tenant.js';

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  const db = getDb();
  const boxes = await accountSecretBoxes(db, who.uid).catch(() => ({}));
  const saas = saasEnabled(process.env);
  const presence = presenceFor(boxes, SECRET_NAMES, { env: process.env, saas });
  return NextResponse.json({
    items: integrationStatus(process.env, { account: presence, saas }),
    presence, // per key: 'account', 'server' or '' (names and places only)
    saas,
    vaultReady: vaultConfigured(),
  }, { headers: NO_STORE });
}
