// lib/accounting-sync.js - Xero and QuickBooks two-way sync (pass 341). Pure apart from the injected fetch and store, so it runs in tests with no network.
//  - Connect: OAuth 2.0 authorization code. Client keys come from env (XERO_CLIENT_ID, XERO_CLIENT_SECRET, QBO_CLIENT_ID, QBO_CLIENT_SECRET).
//    With no keys every call answers "not configured"; nothing throws.
//  - Push: each issued AutoLeads invoice goes to the accounting system ONCE. The external id is saved on the invoice (xeroInvoiceId or
//    qboInvoiceId), and an invoice with an id is never pushed again. A short claim (xeroPushingAt / qboPushingAt) stops two runs at once.
//  - Poll: a fully paid invoice in the accounting system becomes paid here. Part payments stay as AutoLeads records them.
// Optional env for the account mapping (per deployment): XERO_SALES_ACCOUNT_CODE (default 200), XERO_TAX_TYPE, QBO_SERVICE_ITEM_ID, QBO_TAX_CODE_ID.
import { originalTotal, originalNet, originalTax } from './credit-apply.js';
import { isoDay } from './accounting-export.js';

export const SYSTEMS = ['xero', 'quickbooks'];
export const isSystem = (s) => SYSTEMS.includes(s);
export const PUSH_FIELD = { xero: 'xeroInvoiceId', quickbooks: 'qboInvoiceId' };
export const CLAIM_FIELD = { xero: 'xeroPushingAt', quickbooks: 'qboPushingAt' };
export const CLAIM_MS = 10 * 60 * 1000;
export const PUSH_BATCH = 50;
export const POLL_BATCH = 100;
export const XERO_API = 'https://api.xero.com/api.xro/2.0';
export const XERO_CONNECTIONS = 'https://api.xero.com/connections';
export const QBO_API = 'https://quickbooks.api.intuit.com/v3/company';
export const QBO_MINOR = '65';

const KEYS = { xero: ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET'], quickbooks: ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET'] };
const OAUTH = {
  xero: {
    authorize: 'https://login.xero.com/identity/connect/authorize',
    token: 'https://identity.xero.com/connect/token',
    scope: 'offline_access openid accounting.invoices accounting.invoices.read accounting.contacts accounting.contacts.read',
  },
  quickbooks: {
    authorize: 'https://appcenter.intuit.com/connect/oauth2',
    token: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    scope: 'com.intuit.quickbooks.accounting',
  },
};

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n);
const httpErr = (label, status) => Object.assign(new Error(`${label} failed`), { status }); // never echoes a response body

/** True when both client keys for this system are set in env. */
export function clientKeysSet(system, env = process.env) {
  return isSystem(system) && KEYS[system].every((k) => String(env[k] || '').trim() !== '');
}

export function authorizeUrl(system, { clientId, redirectUri, state }) {
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: OAUTH[system].scope, state });
  return `${OAUTH[system].authorize}?${q}`;
}

const basicAuth = (id, secret) => `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;

async function tokenCall(system, body, env, fetchImpl) {
  const [idKey, secretKey] = KEYS[system];
  const res = await fetchImpl(OAUTH[system].token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', Authorization: basicAuth(env[idKey], env[secretKey]) },
    body: new URLSearchParams(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.access_token) throw Object.assign(new Error('token request failed'), { code: d?.error || res.status });
  return d;
}

export const exchangeCode = (system, { code, redirectUri }, env, fetchImpl) =>
  tokenCall(system, { grant_type: 'authorization_code', code, redirect_uri: redirectUri }, env, fetchImpl);
export const refreshGrant = (system, refreshToken, env, fetchImpl) =>
  tokenCall(system, { grant_type: 'refresh_token', refresh_token: refreshToken }, env, fetchImpl);

/** Xero's company (tenant) id for the new connection. */
export async function xeroTenantId(accessToken, fetchImpl) {
  const res = await fetchImpl(XERO_CONNECTIONS, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
  if (!res.ok) throw httpErr('Xero connections', res.status);
  const list = await res.json().catch(() => []);
  const first = (Array.isArray(list) ? list : []).find((c) => c && c.tenantId);
  return first ? String(first.tenantId) : null;
}

/** Whether an AutoLeads invoice is issued and may go to the accounting system: a number, a real issue date, a positive total, not void or draft. */
export function isAccepted(inv) {
  if (!inv || inv.status === 'void' || inv.status === 'draft') return false;
  if (!String(inv.number || '').trim() || !isoDay(inv.issuedAt)) return false;
  return originalTotal(inv) > 0;
}

/** Xero sales invoice (ACCREC). Amounts are net of tax with tax added by Xero from TaxType, so the totals match the invoice. */
export function buildXeroInvoice(inv, { accountCode = '200', taxType = '', currency = '' } = {}) {
  if (!isAccepted(inv)) return { ok: false, reason: 'not_accepted' };
  const net = r2(originalNet(inv));
  const tax = r2(originalTax(inv));
  if (tax > 0 && !taxType) return { ok: false, reason: 'tax_type' };
  const line = { Description: clip(inv.note || 'Services', 4000) || 'Services', Quantity: 1, UnitAmount: net, AccountCode: clip(accountCode, 20) };
  if (tax > 0) line.TaxType = clip(taxType, 40);
  const body = {
    Type: 'ACCREC',
    Status: 'AUTHORISED',
    LineAmountTypes: 'Exclusive',
    InvoiceNumber: clip(inv.number, 255),
    Reference: clip(inv.number, 255),
    Contact: { Name: clip(inv.businessName || inv.email, 255) || 'Customer', ...(inv.email ? { EmailAddress: clip(inv.email, 255) } : {}) },
    Date: isoDay(inv.issuedAt),
    DueDate: isoDay(inv.dueAt) || isoDay(inv.issuedAt),
    LineItems: [line],
  };
  if (currency) body.CurrencyCode = clip(currency, 3).toUpperCase();
  return { ok: true, body };
}

/** QuickBooks invoice. The customer and the service item must already exist in QuickBooks (their ids are passed in). */
export function buildQboInvoice(inv, { customerId = '', itemId = '', taxCodeId = '', currency = '' } = {}) {
  if (!isAccepted(inv)) return { ok: false, reason: 'not_accepted' };
  if (!customerId) return { ok: false, reason: 'customer' };
  if (!itemId) return { ok: false, reason: 'item' };
  const net = r2(originalNet(inv));
  const tax = r2(originalTax(inv));
  if (tax > 0 && !taxCodeId) return { ok: false, reason: 'tax_code' };
  const detail = { ItemRef: { value: String(itemId) }, Qty: 1, UnitPrice: net };
  if (tax > 0) detail.TaxCodeRef = { value: String(taxCodeId) };
  const body = {
    CustomerRef: { value: String(customerId) },
    DocNumber: clip(inv.number, 21),
    TxnDate: isoDay(inv.issuedAt),
    DueDate: isoDay(inv.dueAt) || isoDay(inv.issuedAt),
    Line: [{ Amount: net, DetailType: 'SalesItemLineDetail', Description: clip(inv.note || 'Services', 4000) || 'Services', SalesItemLineDetail: detail }],
  };
  if (currency) body.CurrencyRef = { value: clip(currency, 3).toUpperCase() };
  return { ok: true, body };
}

/** What Xero says about one invoice: paid when its status is PAID. */
export function xeroPaymentState(inv) {
  const status = String(inv?.Status || '');
  return { paid: status === 'PAID', voided: status === 'VOIDED' || status === 'DELETED', amountPaid: r2(inv?.AmountPaid), amountDue: r2(inv?.AmountDue) };
}

/** What QuickBooks says about one invoice: paid when the balance is zero. */
export function qboPaymentState(inv) {
  const total = Number(inv?.TotalAmt) || 0;
  const bal = Number(inv?.Balance);
  const balance = Number.isFinite(bal) ? bal : total;
  return { paid: total > 0 && balance === 0, voided: false, amountPaid: r2(total - balance), amountDue: r2(balance) };
}

/** The change to save here when the accounting system shows the invoice fully paid. Null when nothing changes. */
export function paidPatch(inv, state, system, now = Date.now()) {
  if (!state?.paid || inv?.status === 'paid' || inv?.status === 'void') return null;
  return { status: 'paid', paidAt: new Date(now).toISOString(), paidVia: `${system}_sync` };
}

/**
 * The rule that stops a double push. Push only when connected, the invoice is accepted, it has no external id yet,
 * and no other run holds a fresh claim on it.
 */
export function pushDecision(inv, system, { connected = true, now = Date.now() } = {}) {
  if (!connected) return { push: false, reason: 'not_connected' };
  if (inv?.[PUSH_FIELD[system]]) return { push: false, reason: 'already_pushed' };
  if (!isAccepted(inv)) return { push: false, reason: 'not_accepted' };
  const claimed = Date.parse(inv?.[CLAIM_FIELD[system]] || '');
  if (Number.isFinite(claimed) && now - claimed < CLAIM_MS) return { push: false, reason: 'in_progress' };
  return { push: true, reason: 'ok' };
}

const apiHeaders = (system, accessToken, tenantId) => {
  const h = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' };
  return system === 'xero' ? { ...h, 'Xero-tenant-id': tenantId } : h;
};

/**
 * A usable access token for the system, refreshing it and saving the rotated refresh token. Null when not connected.
 * store: { loadConnection(system) -> {refreshToken, tenantId}|null, saveRefreshToken(system, token), saveTenantId(system, id) }
 */
export async function accessFor({ store, system, env = process.env, fetchImpl = globalThis.fetch }) {
  const conn = await store.loadConnection(system);
  if (!conn?.refreshToken) return null;
  const t = await refreshGrant(system, conn.refreshToken, env, fetchImpl);
  if (t.refresh_token && t.refresh_token !== conn.refreshToken) await store.saveRefreshToken(system, t.refresh_token);
  let tenantId = conn.tenantId || '';
  if (system === 'xero' && !tenantId) {
    tenantId = (await xeroTenantId(t.access_token, fetchImpl)) || '';
    if (tenantId) await store.saveTenantId(system, tenantId);
  }
  if (system === 'xero' && !tenantId) return null;
  return { accessToken: t.access_token, tenantId };
}

async function qboCustomerId(inv, { realm, headers, fetchImpl }) {
  const name = clip(inv.businessName || inv.email, 100) || 'Customer';
  const q = `select Id from Customer where DisplayName = '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const found = await fetchImpl(`${QBO_API}/${realm}/query?query=${encodeURIComponent(q)}&minorversion=${QBO_MINOR}`, { headers });
  if (!found.ok) throw httpErr('QuickBooks customer search', found.status);
  const hit = (await found.json().catch(() => null))?.QueryResponse?.Customer?.[0]?.Id;
  if (hit) return String(hit);
  const made = await fetchImpl(`${QBO_API}/${realm}/customer?minorversion=${QBO_MINOR}`, {
    method: 'POST', headers, body: JSON.stringify({ DisplayName: name, ...(inv.email ? { PrimaryEmailAddr: { Address: clip(inv.email, 255) } } : {}) }),
  });
  if (!made.ok) throw httpErr('QuickBooks customer create', made.status);
  const id = (await made.json().catch(() => null))?.Customer?.Id;
  if (!id) throw httpErr('QuickBooks customer create (no id)', 422);
  return String(id);
}

/**
 * Pushes the accepted invoices that have no external id yet, at most `batch` per run. Each invoice is claimed before the call and
 * its id saved after it. A failed push releases the claim, so the next run tries again. Never throws for a provider problem.
 * opts: { env, fetchImpl, now, batch, store }. store also has listInvoices() and updateInvoice(id, patch).
 */
export async function runPush({ store, system, env = process.env, fetchImpl = globalThis.fetch, now = Date.now(), batch = PUSH_BATCH }) {
  const out = { pushed: 0, skipped: 0, failed: 0, reasons: {} };
  if (!isSystem(system)) return { ...out, error: 'unknown_system' };
  if (!clientKeysSet(system, env)) return { ...out, error: 'not_configured' };
  const access = await accessFor({ store, system, env, fetchImpl }).catch(() => null);
  if (!access) return { ...out, error: 'not_connected' };
  const headers = apiHeaders(system, access.accessToken, access.tenantId);
  const invoices = await store.listInvoices();
  let attempts = 0;
  for (const inv of invoices) {
    const d = pushDecision(inv, system, { connected: true, now });
    if (!d.push) { out.skipped++; out.reasons[d.reason] = (out.reasons[d.reason] || 0) + 1; continue; }
    if (attempts >= batch) break;
    attempts++;
    // Mapping gaps are reported, not pushed half-built: the Xero body is checked now; QuickBooks needs its service item (customer is looked up below).
    const prepared = system === 'xero'
      ? buildXeroInvoice(inv, { accountCode: env.XERO_SALES_ACCOUNT_CODE || '200', taxType: env.XERO_TAX_TYPE || '' })
      : (env.QBO_SERVICE_ITEM_ID ? { ok: true } : { ok: false, reason: 'item' });
    if (!prepared.ok) { out.skipped++; out.reasons[prepared.reason] = (out.reasons[prepared.reason] || 0) + 1; continue; }
    await store.updateInvoice(inv.id, { [CLAIM_FIELD[system]]: new Date(now).toISOString() });
    let providerId = '';
    try {
      if (system === 'xero') {
        const r = await fetchImpl(`${XERO_API}/Invoices`, { method: 'PUT', headers, body: JSON.stringify({ Invoices: [prepared.body] }) });
        if (!r.ok) throw httpErr('Xero invoice', r.status);
        const row = (await r.json().catch(() => null))?.Invoices?.[0];
        if (!row?.InvoiceID || (Array.isArray(row.ValidationErrors) && row.ValidationErrors.length)) throw httpErr('Xero invoice (rejected)', 422);
        providerId = String(row.InvoiceID);
      } else {
        const realm = access.tenantId;
        const customerId = await qboCustomerId(inv, { realm, headers, fetchImpl });
        const b = buildQboInvoice(inv, { customerId, itemId: env.QBO_SERVICE_ITEM_ID, taxCodeId: env.QBO_TAX_CODE_ID || '' });
        if (!b.ok) throw Object.assign(new Error('mapping'), { code: b.reason });
        const r = await fetchImpl(`${QBO_API}/${realm}/invoice?minorversion=${QBO_MINOR}`, { method: 'POST', headers, body: JSON.stringify(b.body) });
        if (!r.ok) throw httpErr('QuickBooks invoice', r.status);
        providerId = String((await r.json().catch(() => null))?.Invoice?.Id || '');
        if (!providerId) throw httpErr('QuickBooks invoice (no id)', 422);
      }
    } catch (e) {
      await store.updateInvoice(inv.id, { [CLAIM_FIELD[system]]: null }).catch(() => {});
      out.failed++;
      out.lastError = String(e?.code || e?.status || 'error');
      continue;
    }
    // The id is saved as soon as the provider has the invoice. If that save fails, the claim stays and the invoice is not pushed again
    // until the claim expires (see the note in the status file: check the provider for the number before retrying by hand).
    await store.updateInvoice(inv.id, { [PUSH_FIELD[system]]: providerId, [CLAIM_FIELD[system]]: null, [`${system}PushedAt`]: new Date(now).toISOString() });
    out.pushed++;
  }
  return out;
}

/** Pulls payment status for pushed invoices that are not yet paid here. Never throws for a provider problem. */
export async function runPoll({ store, system, env = process.env, fetchImpl = globalThis.fetch, now = Date.now(), batch = POLL_BATCH }) {
  const out = { checked: 0, paid: 0, failed: 0 };
  if (!isSystem(system)) return { ...out, error: 'unknown_system' };
  if (!clientKeysSet(system, env)) return { ...out, error: 'not_configured' };
  const access = await accessFor({ store, system, env, fetchImpl }).catch(() => null);
  if (!access) return { ...out, error: 'not_connected' };
  const headers = apiHeaders(system, access.accessToken, access.tenantId);
  const invoices = (await store.listInvoices()).filter((i) => i[PUSH_FIELD[system]] && i.status !== 'paid' && i.status !== 'void');
  for (const inv of invoices.slice(0, batch)) {
    out.checked++;
    try {
      const id = encodeURIComponent(inv[PUSH_FIELD[system]]);
      const url = system === 'xero' ? `${XERO_API}/Invoices/${id}` : `${QBO_API}/${access.tenantId}/invoice/${id}?minorversion=${QBO_MINOR}`;
      const r = await fetchImpl(url, { headers });
      if (!r.ok) throw httpErr('payment read', r.status);
      const j = await r.json().catch(() => null);
      const row = system === 'xero' ? j?.Invoices?.[0] : j?.Invoice;
      if (!row) throw httpErr('payment read (no invoice)', 422);
      const state = system === 'xero' ? xeroPaymentState(row) : qboPaymentState(row);
      const patch = paidPatch(inv, state, system, now);
      if (patch) { await store.updateInvoice(inv.id, patch); out.paid++; }
    } catch {
      out.failed++;
    }
  }
  return out;
}
