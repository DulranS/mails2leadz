const OpenAI = require('openai');

/**
 * Provider abstraction — DeepSeek is the default because it is roughly
 * 10-30x cheaper per token than GPT-4o-mini at comparable quality for this
 * exact job (short JSON-structured scoring + drafting, not deep reasoning),
 * which matters a lot when every lead gets a score call and every touch
 * gets a draft call. DeepSeek's API is wire-compatible with the OpenAI SDK
 * (same request/response shape, same `response_format: json_object`
 * support), so switching providers is just a different baseURL/apiKey/model
 * — no code fork needed. Set AI_PROVIDER=openai in .env.local to switch
 * back if you ever want to.
 *
 * DeepSeek's model lineup/pricing/naming has moved fast (deepseek-chat →
 * deepseek-flash/deepseek-v4-pro, plus peak/off-peak billing) — if calls
 * start failing with an "unknown model" error, check
 * https://api-docs.deepseek.com and update DEEPSEEK_MODEL in .env.local;
 * nothing else here needs to change.
 */
const PROVIDERS = {
  deepseek: {
    baseURL: 'https://api.deepseek.com',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  },
  qwen: {
    // Alibaba's DashScope OpenAI-compatible endpoint — the other
    // ultra-low-cost Chinese option, kept here as a one-line fallback in
    // case DeepSeek's API has an outage or isn't reachable from your
    // deployment region.
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'QWEN_API_KEY',
    model: process.env.QWEN_MODEL || 'qwen-plus',
  },
  openai: {
    baseURL: undefined, // SDK default
    apiKeyEnv: 'OPENAI_API_KEY',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
};

function activeProviderName() {
  return (process.env.AI_PROVIDER || 'deepseek').toLowerCase();
}

function getProviderConfig() {
  const name = activeProviderName();
  const cfg = PROVIDERS[name] || PROVIDERS.deepseek;
  return { name, ...cfg };
}

let cachedClient = null;
let cachedProviderName = null;

function getClient() {
  const cfg = getProviderConfig();
  const apiKey = process.env[cfg.apiKeyEnv];
  if (!apiKey) {
    throw new Error(
      `Missing ${cfg.apiKeyEnv} in .env.local (AI_PROVIDER=${cfg.name}). Set AI_PROVIDER to switch providers.`
    );
  }
  if (cachedClient && cachedProviderName === cfg.name) return { client: cachedClient, cfg };
  cachedClient = new OpenAI({ apiKey, baseURL: cfg.baseURL });
  cachedProviderName = cfg.name;
  return { client: cachedClient, cfg };
}

function usageFrom(res, providerName) {
  if (!res.usage) return null;
  return {
    prompt_tokens: res.usage.prompt_tokens || 0,
    completion_tokens: res.usage.completion_tokens || 0,
    provider: providerName,
  };
}

/**
 * Scores a lead HOT / WARM / COLD based on whatever fields you have.
 * Never blocks the pipeline — falls back to WARM if AI scoring fails,
 * so a bad API key never stops leads from being imported.
 * `business` is the account's profile — see lib/account.js businessProfileFrom().
 */
async function scoreLead(lead, business) {
  try {
    const { client, cfg } = getClient();
    const prompt = `You are scoring a B2B lead for a company that sells: "${business.offerDescription}" (offer type: ${business.offerType}).

Lead: ${JSON.stringify({
      company: lead.company_name,
      title: lead.title,
      website: lead.website,
      notes: lead.research_notes,
    })}

Reply with ONLY compact JSON: {"score":"HOT|WARM|COLD","reason":"one short sentence"}`;

    const res = await client.chat.completions.create({
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(res.choices[0].message.content);
    return {
      score: ['HOT', 'WARM', 'COLD'].includes(parsed.score) ? parsed.score : 'WARM',
      reason: parsed.reason || '',
      usage: usageFrom(res, cfg.name),
    };
  } catch (err) {
    console.error('scoreLead fallback (AI unavailable):', err.message);
    return { score: 'WARM', reason: 'AI scoring unavailable — defaulted to WARM', usage: null };
  }
}

/**
 * Drafts a personalized outbound message. `step` 0 = first touch,
 * 1..N = follow-up. `channel` shapes length/formality. Always returns a
 * DRAFT for a human to review — this function never sends anything itself.
 *
 * `templateExamples` (optional): 0-2 of this account's own past messages
 * that were actually sent (see lib/templates.js), passed in as calibration
 * so drafts drift toward the voice that's already working for this specific
 * business instead of a generic AI tone. The model is told explicitly not
 * to copy them — they're a style reference, not a fill-in-the-blanks template.
 */
async function draftMessage({ lead, step, channel, business, templateExamples = [] }) {
  const { client, cfg } = getClient();

  const channelGuidance =
    channel === 'whatsapp'
      ? 'Keep it under 60 words, conversational, no subject line, like a real WhatsApp message.'
      : 'Email. Include a short, specific subject line. Body under 130 words. No generic corporate opener like "I hope this finds you well."';

  const stepGuidance =
    step === 0
      ? 'This is the FIRST message this lead has received from us.'
      : `This is FOLLOW-UP #${step}. Do not repeat the first message — add a new angle, a piece of value, or gentle urgency. Keep it short.`;

  const examplesBlock = templateExamples.length
    ? `\nHere ${templateExamples.length === 1 ? 'is an example' : 'are examples'} of this business's own past message${templateExamples.length === 1 ? '' : 's'} that actually worked (led to a real reply). Match the voice, structure, and length — do NOT copy the wording or details verbatim, this lead is different:\n${templateExamples
        .map((t, i) => `Example ${i + 1}:${t.subject ? `\nSubject: ${t.subject}` : ''}\n${t.body}`)
        .join('\n---\n')}\n`
    : '';

  const prompt = `You write outbound sales messages for ${business.name}, a ${business.offerType} business.
Offer: ${business.offerDescription}
Tone: ${business.tone}
Goal: get the lead to agree to ${business.callToAction}.
${channelGuidance}
${stepGuidance}
${examplesBlock}
Lead details: ${JSON.stringify({
    name: lead.full_name,
    company: lead.company_name,
    title: lead.title,
    notes: lead.research_notes,
  })}

Sign off as ${business.senderName}, ${business.senderRole} at ${business.name}.

Reply with ONLY compact JSON: {"subject":"<empty string if channel is whatsapp>","body":"..."}`;

  const res = await client.chat.completions.create({
    model: cfg.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(res.choices[0].message.content);
  return { subject: parsed.subject || '', body: parsed.body || '', usage: usageFrom(res, cfg.name) };
}

module.exports = { scoreLead, draftMessage, activeProviderName };
