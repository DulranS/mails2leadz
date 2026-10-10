// lib/ai-client.js - the ONLY place the app talks to an LLM.
//
// Goals: cheap by default, impossible to run up a surprise bill, and measurable.
//  * Two tiers: "fast" (default, cheap model) and "smart" (only when quality matters).
//  * Provider: DeepSeek if DEEPSEEK_API_KEY (default, cheapest), else OpenAI if OPENAI_API_KEY, else Anthropic
//    (ANTHROPIC_API_KEY / CLAUDE_API_KEY). Force one with AI_PROVIDER=deepseek|openai|anthropic.
//    If the primary provider is down and another key is configured, the call falls back to it.
//  * 24h response cache (identical request = free).
//  * Per-user caps: AI_DAILY_CALL_LIMIT (default 60) and AI_MONTHLY_BUDGET_USD (default 5).
//  * Every call is logged to `ai_usage` (tokens, est. cost, feature) -> AI analytics on the Business Value page.
//
// Models are env-overridable so a model retirement never needs a code change:
//   AI_MODEL_FAST, AI_MODEL_SMART, AI_MODEL_FAST_ANTHROPIC, AI_MODEL_SMART_ANTHROPIC,
//   AI_MODEL_FAST_DEEPSEEK, AI_MODEL_SMART_DEEPSEEK

import crypto from 'node:crypto';
import { getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, increment } from './server-firestore.js';

// Estimated USD per 1M tokens [input, output]. Used for budgeting/analytics only; override via AI_PRICE_JSON.
// Third number (optional) = price per 1M input tokens served from the provider's prompt cache.
// DeepSeek has peak/off-peak pricing; the PEAK price is used so budget caps are never under-counted.
const DEFAULT_PRICES = {
  'deepseek-flash': [0.3, 1.2, 0.006],
  'deepseek-v4-pro': [1.32, 3.96, 0.044],
  'deepseek-chat': [0.3, 1.2, 0.006],
  'deepseek-v4-flash': [0.3, 1.2, 0.006],
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
  const keys = {
    deepseek: process.env.DEEPSEEK_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
  };
  const modelsFor = (name) => {
    if (name === 'deepseek') {
      return { fast: process.env.AI_MODEL_FAST_DEEPSEEK || 'deepseek-flash', smart: process.env.AI_MODEL_SMART_DEEPSEEK || 'deepseek-v4-pro' };
    }
    if (name === 'anthropic') {
      return { fast: process.env.AI_MODEL_FAST_ANTHROPIC || 'claude-haiku-4-5-20251001', smart: process.env.AI_MODEL_SMART_ANTHROPIC || 'claude-sonnet-5-5' };
    }
    return { fast: process.env.AI_MODEL_FAST || 'gpt-4o-mini', smart: process.env.AI_MODEL_SMART || 'gpt-4o' };
  };
  // Order: the forced provider first (if it has a key), then DeepSeek -> OpenAI -> Anthropic.
  const forced = String(process.env.AI_PROVIDER || '').trim().toLowerCase();
  const order = ['deepseek', 'openai', 'anthropic'];
  if (keys[forced]) order.splice(order.indexOf(forced), 1), order.unshift(forced);
  const providers = order.filter((n) => keys[n]).map((n) => ({ name: n, key: keys[n], models: modelsFor(n) }));
  const primary = providers[0] || null;
  return {
    provider: primary ? primary.name : null,
    key: primary ? primary.key : null,
    models: primary ? primary.models : modelsFor('openai'),
    providers,
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

async function recordUsage(db, { uid, feature, model, provider, inputTokens, outputTokens, costUsd, capUsd, dailyLimit }) {
  const k = `${uid}:${dayKey()}`;
  memCalls.set(k, (memCalls.get(k) || 0) + 1);
  if (!db) return;
  try {
    await Promise.all([
      addDoc(collection(db, 'ai_usage'), { userId: uid, feature, model, provider, inputTokens, outputTokens, costUsd, at: new Date().toISOString() }),
      setDoc(doc(db, 'ai_usage_daily', `${uid}_${dayKey()}`), { userId: uid, day: dayKey(), calls: increment(1), costUsd: increment(costUsd), dailyLimit }, { merge: true }),
      setDoc(doc(db, 'ai_usage_monthly', `${uid}_${monthKey()}`), { userId: uid, month: monthKey(), calls: increment(1), costUsd: increment(costUsd), inputTokens: increment(inputTokens), outputTokens: increment(outputTokens), capUsd }, { merge: true }),
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

// DeepSeek speaks the OpenAI chat-completions dialect. Thinking mode is ON by default on the V4 models and
// would burn the token budget on hidden reasoning (and can truncate the JSON), so drafting runs with it off.
// DeepSeek renames models from time to time. If the configured name is rejected as unknown, try the other current
// names once (and remember the one that works for this server process), so a rename never takes AI drafting down.
const DEEPSEEK_ALTS = {
  'deepseek-flash': ['deepseek-v4-flash', 'deepseek-chat'],
  'deepseek-v4-flash': ['deepseek-flash', 'deepseek-chat'],
  'deepseek-chat': ['deepseek-flash', 'deepseek-v4-flash'],
  'deepseek-v4-pro': ['deepseek-chat'],
};
const deepseekWorking = new Map(); // configured name -> name that last worked
const isUnknownModel = (status, data) =>
  [400, 404, 422].includes(status) && /model/i.test(data?.error?.message || '') && /(not exist|not found|unknown|invalid|unsupported|does not support|no such)/i.test(data?.error?.message || '');

async function callDeepSeek(args) {
  const configured = args.model;
  const first = deepseekWorking.get(configured) || configured;
  const tried = new Set();
  let lastErr = null;
  for (const model of [first, configured, ...(DEEPSEEK_ALTS[configured] || [])]) {
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      const r = await callDeepSeekOnce({ ...args, model });
      if (model !== configured) deepseekWorking.set(configured, model);
      return { ...r, modelUsed: model };
    } catch (e) {
      lastErr = e;
      if (!(e instanceof AiError) || e.code !== 'AI_MODEL_UNKNOWN') throw e;
      if (deepseekWorking.get(configured) === model) deepseekWorking.delete(configured);
    }
  }
  throw lastErr;
}

async function callDeepSeekOnce({ key, model, system, prompt, maxTokens, json, thinking = false }) {
  const base = String(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const body = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    temperature: 0.5,
    max_tokens: maxTokens,
    ...(thinking ? {} : { thinking: { type: 'disabled' } }),
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  };
  const send = (b) => fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(b),
    signal: AbortSignal.timeout(45000),
  });
  let res = await send(body);
  let data = await res.json();
  // A model/endpoint that does not know the "thinking" switch: retry once without it.
  if (!res.ok && res.status === 400 && /thinking/i.test(data?.error?.message || '')) {
    const { thinking: _drop, ...rest } = body;
    res = await send(rest);
    data = await res.json();
  }
  if (!res.ok && isUnknownModel(res.status, data)) {
    throw new AiError(`DeepSeek does not know the model "${model}". Set AI_MODEL_FAST_DEEPSEEK to the current name from your DeepSeek console.`, 'AI_MODEL_UNKNOWN', 502);
  }
  if (!res.ok) {
    const code = res.status === 401 ? 'AI_AUTH' : 'AI_PROVIDER';
    throw new AiError(res.status === 401 ? 'The DeepSeek API key was rejected.' : data?.error?.message || `AI provider error (${res.status})`, code, 502);
  }
  const u = data.usage || {};
  const hit = Number(u.prompt_cache_hit_tokens) || 0;
  const promptTokens = Number(u.prompt_tokens) || 0;
  return {
    text: data.choices?.[0]?.message?.content || '',
    inputTokens: promptTokens,
    cachedInputTokens: Math.min(hit, promptTokens),
    outputTokens: Number(u.completion_tokens) || 0,
  };
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

const CALLERS = { deepseek: callDeepSeek, openai: callOpenAI, anthropic: callAnthropic };

/** Cost in USD for one call. Cached input tokens (DeepSeek) are billed at the much lower cache-hit price. */
export function estimateCostUsd(model, { inputTokens = 0, cachedInputTokens = 0, outputTokens = 0 }) {
  const [pi, po, pc] = priceFor(model);
  const cached = pc !== undefined ? Math.min(cachedInputTokens, inputTokens) : 0;
  return ((inputTokens - cached) * pi + cached * (pc || 0) + outputTokens * po) / 1e6;
}

/**
 * @returns {Promise<{text:string, data:any, cached:boolean, model:string, costUsd:number}>}
 */
export async function callAI({ uid, feature, tier = 'fast', system, prompt, maxTokens = 600, json = true }) {
  if (!uid) throw new AiError('Missing user', 'AI_NO_USER', 400);
  const cfg = aiConfig();
  if (!cfg.provider) throw new AiError('AI is not configured (set DEEPSEEK_API_KEY, OPENAI_API_KEY or ANTHROPIC_API_KEY).', 'AI_NOT_CONFIGURED', 503);

  const primaryModel = cfg.models[tier] || cfg.models.fast;
  const ck = crypto.createHash('sha256').update(`${uid}|${feature}|${primaryModel}|${system}|${prompt}`).digest('hex');
  const hit = cache.get(ck);
  if (hit && hit.exp > Date.now()) return { ...hit.value, cached: true };

  const db = dbOrNull();
  const usage = await readUsage(db, uid);
  if (usage.dayCalls >= cfg.dailyCallLimit) throw new AiError(`Daily AI limit reached (${cfg.dailyCallLimit} requests). It resets tomorrow.`, 'AI_DAILY_LIMIT', 429);
  if (usage.monthCost >= cfg.monthlyBudgetUsd) throw new AiError(`Monthly AI budget reached ($${cfg.monthlyBudgetUsd.toFixed(2)}). Contact support to raise it.`, 'AI_BUDGET', 429);

  // Primary provider first; if it errors (outage, bad key, network) and another provider is configured, use that.
  let r = null;
  let used = null;
  let lastErr = null;
  for (const p of cfg.providers) {
    const model = p.models[tier] || p.models.fast;
    try {
      r = await CALLERS[p.name]({ key: p.key, model, system, prompt, maxTokens, json });
      used = { provider: p.name, model: r.modelUsed || model };
      break;
    } catch (e) {
      lastErr = e instanceof AiError ? e : new AiError(e?.name === 'TimeoutError' ? 'The AI took too long to answer. Try again.' : 'Could not reach the AI service.', 'AI_PROVIDER', 502);
      console.warn(`[ai-client] ${p.name} failed (${feature}):`, e?.message);
    }
  }
  if (!r) throw lastErr || new AiError('AI is not available right now.', 'AI_PROVIDER', 502);

  const costUsd = estimateCostUsd(used.model, r);
  await recordUsage(db, { uid, feature, model: used.model, provider: used.provider, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd, capUsd: cfg.monthlyBudgetUsd, dailyLimit: cfg.dailyCallLimit });

  const value = { text: r.text, data: json ? parseJsonLoose(r.text) : null, cached: false, model: used.model, costUsd };
  if (cache.size > 500) cache.clear();
  cache.set(ck, { value, exp: Date.now() + CACHE_TTL_MS });
  return value;
}

// ---- per-customer business profile: what THEY sell (so AI never pitches someone else's offer) ----
export async function getBusinessProfile(uid) {
  const db = dbOrNull();
  const empty = { offer: '', valueProp: '', audience: '', tone: 'friendly and professional', businessName: '', phone: '' };
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
