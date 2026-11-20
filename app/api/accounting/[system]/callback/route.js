// app/api/accounting/[system]/callback/route.js - where Xero or QuickBooks sends the owner after consent (pass 341). PUBLIC in the proxy list
// because the redirect carries no sign-in; the owner is identified only by the signed, short-lived state made when they pressed Connect.
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../../../lib/server-firestore.js';
import { getDb } from '../../../../../lib/server/route-helpers.js';
import { verifyState, vaultConfigured } from '../../../../../lib/server/token-vault.js';
import { isSystem, clientKeysSet, exchangeCode, xeroTenantId } from '../../../../../lib/accounting-sync.js';
import { accountingStore, accountingRedirectFor } from '../../../../../lib/server/accounting-store.js';

const back = (request, system, status) => NextResponse.redirect(new URL(`/integrations?${system}=${status}`, request.nextUrl.origin));

export async function GET(request, { params }) {
  const { system } = await params;
  if (!isSystem(system)) return NextResponse.json({ error: 'Unknown accounting system.' }, { status: 404 });
  try {
    const p = request.nextUrl.searchParams;
    if (p.get('error')) return back(request, system, 'denied');
    if (!isAdminMode() || !vaultConfigured() || !clientKeysSet(system)) return back(request, system, 'unavailable');
    const uid = verifyState(p.get('state'));
    const code = p.get('code');
    if (!uid || !code) return back(request, system, 'error');
    const redirectUri = accountingRedirectFor(system, request);
    const t = await exchangeCode(system, { code, redirectUri }, process.env, globalThis.fetch);
    if (!t.refresh_token) return back(request, system, 'no_refresh');
    // Xero's company comes from its connections list; QuickBooks sends the company (realm) id back in the redirect.
    const tenantId = system === 'xero' ? await xeroTenantId(t.access_token, globalThis.fetch) : (p.get('realmId') || '');
    if (!tenantId) return back(request, system, 'no_company');
    await accountingStore(getDb(), uid).saveConnection(system, { refreshToken: t.refresh_token, tenantId });
    return back(request, system, 'connected');
  } catch (e) {
    console.error('[accounting callback]', system, e?.code || e?.message); // never log tokens or the code
    return back(request, system, 'error');
  }
}
