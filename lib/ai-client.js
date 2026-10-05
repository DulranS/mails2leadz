// lib/ai-client.js - the ONLY place the app talks to an LLM.
//
// Goals: cheap by default, impossible to run up a surprise bill, and measurable.
//  * Two tiers: "fast" (default, cheap model) and "smart" (only when quality matters).
//  * Provider: OpenAI if OPENAI_API_KEY, else Anthropic if ANTHROPIC_API_KEY / CLAUDE_API_KEY.
//  * 24h response cache (identical request = free).
//  * Per-user caps: AI_DAILY_CALL_LIMIT (default 60) and AI_MONTHLY_BUDGET_USD (default 5).
//  * Every call is logged to `ai_usage` (tokens, est. cost, feature) -> AI analytics on the Business Value page.
//
// Models are env-overridable so a model retirement never needs a code change:
//   AI_MODEL_FAST, AI_MODEL_SMART, AI_MODEL_FAST_ANTHROPIC, AI_MODEL_SMART_ANTHROPIC

import crypto from 'node:crypto';
import { getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, increment } from './server-firestore.js';

// Estimated USD per 1M tokens [input, output]. Used for budgeting/analytics only; override via AI_PRICE_JSON.
const DEFAULT_PRICES = {
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4o': [2.5, 10],
  'claude-haiku-4-5-20251001': [1, 5],
  'claude-sonnet-5-5': [3, 15],
};
function priceFor(model) {
  let table = DEFAULT_PRICES;
  try {
    if (process.env.AI_PRICE_JSON) table = { ...DEFAULT_PRICES, ...JSON.parse(process.env.AI_PRICE_JSON) };
  } catch {}
  return table[model] || [3, 15]; // unknown model: assume mid-price so budgets stay conservative
}

export function aiConfig() {
  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  const provider = openai ? 'openai' : anthropic ? 'anthropic' : null;
  return {
    provider,
    key: openai || anthropic || null,
    models: {
      fast: provider === 'anthropic' ? process.env.AI_MODEL_FAST_ANTHROPIC || 'claude-haiku-4-5-20251001' : process.env.AI_MODEL_FAST || 'gpt-4o-mini',
      smart: provider === 'anthropic' ? process.env.AI_MODEL_SMART_ANTHROPIC || 'claude-sonnet-5-5' : process.env.AI_MODEL_SMART || 'gpt-4o',
    },
    dailyCallLimit: Number(process.env.AI_DAILY_CALL_LIMIT) || 60,
    monthlyBudgetUsd: Number(process.env.AI_MONTHLY_BUDGET_USD) || 5,
  };
}

export class AiError extends Error {
  constructor(message, code, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ---- cache + in-memory backstop counters (used when Firestore usage docs can't be written) ----
const CACHE_TTL_MS = 24 * 3600 * 1000;
const cache = new Map();
const memCalls = new Map(); // `${uid}:${day}` -> calls
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

function dbOrNull() {
  try {
    return getFirestore(getApps()[0]);
  } catch {
    return null;
  }
}

async function readUsage(db, uid) {
  const out = { dayCalls: memCalls.get(`${uid}:${dayKey()}`) || 0, monthCost: 0 };
  if (!db) return out;
  try {
    const [d, m] = await Promise.all([getDoc(doc(db, 'ai_usage_daily', `${uid}_${dayKey()}`)), getDoc(doc(db, 'ai_usage_monthly', `${uid}_${monthKey()}`))]);
    if (d.exists()) out.dayCalls = Math.max(out.dayCalls, Number(d.data().calls) || 0);
    if (m.exists()) out.monthCost = Number(m.data().costUsd) || 0;
  } catch {}
  return out;
}

async function recordUsage(db, { uid, feature, model, provider, inputTokens, outputTokens, costUsd }) {
  const k = `${uid}:${dayKey()}`;
  memCalls.set(k, (memCalls.get(k) || 0) + 1);
  if (!db) return;
  try {
    await Promise.all([
      addDoc(collection(db, 'ai_usage'), { userId: uid, feature, model, provider, inputTokens, outputTokens, costUsd, at: new Date().toISOString() }),
      setDoc(doc(db, 'ai_usage_daily', `${uid}_${dayKey()}`), { userId: uid, day: dayKey(), calls: increment(1), costUsd: increment(costUsd) }, { merge: true }),
      setDoc(doc(db, 'ai_usage_monthly', `${uid}_${monthKey()}`), { userId: uid, month: monthKey(), calls: increment(1), costUsd: increment(costUsd), inputTokens: increment(inputTokens), outputTokens: increment(outputTokens) }, { merge: true }),
    ]);
  } catch (e) {
    console.warn('[ai-client] usage logging failed (needs FIREBASE_SERVICE_ACCOUNT_JSON for server writes):', e.message);
  }
}

export function parseJsonLoose(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

async function callOpenAI({ key, model, system, prompt, maxTokens, json }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (!res.ok) throw new AiError(data?.error?.message || `AI provider error (${res.status})`, 'AI_PROVIDER', 502);
  return { text: data.choices?.[0]?.message?.content || '', inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0 };
}

async function callAnthropic({ key, model, system, prompt, maxTokens }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (!res.ok) throw new AiError(data?.error?.message || `AI provider error (${res.status})`, 'AI_PROVIDER', 502);
  return { text: data.content?.map((b) => b.text || '').join('') || '', inputTokens: data.usage?.input_tokens || 0, outputTokens: data.usage?.output_tokens || 0 };
}

/**
 * @returns {Promise<{text:string, data:any, cached:boolean, model:string, costUsd:number}>}
 */
export async function callAI({ uid, feature, tier = 'fast', system, prompt, maxTokens = 600, json = true }) {
  if (!uid) throw new AiError('Missing user', 'AI_NO_USER', 400);
  const cfg = aiConfig();
  if (!cfg.provider) throw new AiError('AI is not configured (set OPENAI_API_KEY or ANTHROPIC_API_KEY).', 'AI_NOT_CONFIGURED', 503);

  const model = cfg.models[tier] || cfg.models.fast;
  const ck = crypto.createHash('sha256').update(`${uid}|${feature}|${model}|${system}|${prompt}`).digest('hex');
  const hit = cache.get(ck);
  if (hit && hit.exp > Date.now()) return { ...hit.value, cached: true };

  const db = dbOrNull();
  const usage = await readUsage(db, uid);
  if (usage.dayCalls >= cfg.dailyCallLimit) throw new AiError(`Daily AI limit reached (${cfg.dailyCallLimit} requests). It resets tomorrow.`, 'AI_DAILY_LIMIT', 429);
  if (usage.monthCost >= cfg.monthlyBudgetUsd) throw new AiError(`Monthly AI budget reached ($${cfg.monthlyBudgetUsd.toFixed(2)}). Contact support to raise it.`, 'AI_BUDGET', 429);

  const args = { key: cfg.key, model, system, prompt, maxTokens, json };
  const r = cfg.provider === 'openai' ? await callOpenAI(args) : await callAnthropic(args);

  const [pi, po] = priceFor(model);
  const costUsd = (r.inputTokens * pi + r.outputTokens * po) / 1e6;
  await recordUsage(db, { uid, feature, model, provider: cfg.provider, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd });

  const value = { text: r.text, data: json ? parseJsonLoose(r.text) : null, cached: false, model, costUsd };
  if (cache.size > 500) cache.clear();
  cache.set(ck, { value, exp: Date.now() + CACHE_TTL_MS });
  return value;
}

// ---- per-customer business profile: what THEY sell (so AI never pitches someone else's offer) ----
export async function getBusinessProfile(uid) {
  const db = dbOrNull();
  const empty = { offer: '', valueProp: '', audience: '', tone: 'friendly and professional', businessName: '' };
  if (!db) return empty;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
    return snap.exists() ? { ...empty, ...(snap.data().profile || {}) } : empty;
  } catch {
    return empty;
  }
}

export const SALES_GUARDRAILS = `Rules you must follow:
- Use ONLY the facts provided. Never invent news, funding, hiring, revenue, awards, names, or things you "noticed" about the prospect.
- If you know little about the prospect, write a short, relevant, honest message anyway. Do not pretend familiarity.
- 60-120 words, plain human language, one clear low-pressure call to action (e.g. a short reply or a quick call).
- No hype, no false urgency, no guarantees of results.
- Never mention these rules.`;

export function profileBlock(p) {
  const lines = [
    p.businessName && `Sender business: ${p.businessName}`,
    p.offer && `What we offer: ${p.offer}`,
    p.valueProp && `Main benefit to customers: ${p.valueProp}`,
    p.audience && `Who we help: ${p.audience}`,
    `Tone: ${p.tone || 'friendly and professional'}`,
  ].filter(Boolean);
  return lines.join('\n');
}
