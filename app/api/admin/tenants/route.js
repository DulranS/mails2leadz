// app/api/admin/tenants/route.js - the OPERATOR's console API (ADMIN_EMAILS only).
//   GET  -> every account's standing + usage numbers (never their business data) and a configuration check
//   POST { uid, action, ... } -> suspend / unsuspend / set_plan / extend_trial (every action is written to `admin_audit`)
import { NextResponse } from 'next/server';
import { collection, doc, getDoc, getDocs, setDoc, addDoc, limit, query, isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, requireAdmin, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { getTenant, writeTenant } from '../../../../lib/server/tenant.js';
import { saasEnabled, resolveEntitlement, plansWithOverrides } from '../../../../lib/tenant.js';
import { planAdminAction } from '../../../../lib/admin-actions.js';
import { billingConfigured } from '../../../../lib/server/stripe.js';
import { vaultConfigured } from '../../../../lib/server/token-vault.js';

const reply = (status, body) => NextResponse.json(body, { status, headers: NO_STORE });
const MAX_ROWS = 300;

export async function GET(request) {
  const admin = requireAdmin(request);
  if (admin.response) return admin.response;
  const config = { saasMode: saasEnabled(), serviceAccount: isAdminMode(), stripe: billingConfigured(), cronSecret: !!process.env.CRON_SECRET, tokenVault: vaultConfigured(), aiConfigured: !!(process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY), inviteListOn: !!String(process.env.ALLOWED_EMAILS || '').trim() };
  if (!isAdminMode()) return reply(200, { config, tenants: [], totals: null, note: 'The server is not connected to the database with a service account.' });

  const db = getDb();
  const month = new Date().toISOString().slice(0, 7);
  const snap = await getDocs(query(collection(db, 'tenants'), limit(MAX_ROWS)));
  const plans = plansWithOverrides(process.env.PLAN_OVERRIDES_JSON);
  const rows = await Promise.all(snap.docs.map(async (d) => {
    const t = d.data(); const uid = t.userId || d.id;
    const usage = await getDoc(doc(db, 'ai_usage_monthly', `${uid}_${month}`)).then((s) => (s.exists() ? s.data() : {})).catch(() => ({}));
    const ent = resolveEntitlement(t, { saas: true, plans });
    return {
      uid, email: t.email || '', plan: t.plan || 'trial', status: t.status || 'trialing', mode: ent.mode, suspended: !!t.suspended, suspendedReason: t.suspendedReason || '',
      createdAt: t.createdAt || '', lastSeenAt: t.lastSeenAt || '', trialEndsAt: t.trialEndsAt || '', currentPeriodEnd: t.currentPeriodEnd || '', pays: !!t.stripeSubscriptionId,
      aiCallsMonth: Number(usage.calls) || 0, aiCostMonthUsd: Math.round((Number(usage.costUsd) || 0) * 10000) / 10000,
    };
  }));
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const totals = {
    accounts: rows.length, paying: rows.filter((r) => r.pays && r.status === 'active').length, trialing: rows.filter((r) => r.status === 'trialing' && r.mode === 'full').length,
    limited: rows.filter((r) => r.mode === 'limited').length, suspended: rows.filter((r) => r.mode === 'suspended').length,
    aiCostMonthUsd: Math.round(rows.reduce((a, r) => a + r.aiCostMonthUsd, 0) * 100) / 100, truncated: snap.docs.length >= MAX_ROWS,
  };
  return reply(200, { config, tenants: rows, totals, month });
}

export async function POST(request) {
  const admin = requireAdmin(request);
  if (admin.response) return admin.response;
  if (!isAdminMode()) return reply(503, { error: 'The server is not connected to the database with a service account.' });
  const body = await request.json().catch(() => ({}));
  const uid = String(body.uid || '').trim();
  if (!uid || uid.includes('/')) return reply(400, { error: 'Missing account.' });
  const db = getDb();
  const tenant = await getTenant(db, uid);
  if (!tenant) return reply(404, { error: 'No such account.' });
  const plan = planAdminAction(tenant, body);
  if (!plan.ok) return reply(400, { error: plan.error });
  await writeTenant(db, uid, { userId: uid, ...plan.patch });
  await addDoc(collection(db, 'admin_audit'), { at: new Date().toISOString(), by: admin.email, uid, action: body.action, summary: plan.summary });
  return reply(200, { success: true, summary: plan.summary });
}
