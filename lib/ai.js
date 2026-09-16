const OpenAI = require('openai');

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY in .env.local');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function usageFrom(res) {
  if (!res.usage) return null;
  return { prompt_tokens: res.usage.prompt_tokens || 0, completion_tokens: res.usage.completion_tokens || 0 };
}

/**
 * Scores a lead HOT / WARM / COLD based on whatever fields you have.
 * Never blocks the pipeline — falls back to WARM if AI scoring fails,
 * so a bad API key never stops leads from being imported.
 * `business` is the account's profile — see lib/account.js businessProfileFrom().
 */
async function scoreLead(lead, business) {
  try {
    const client = getClient();
    const prompt = `You are scoring a B2B lead for a company that sells: "${business.offerDescription}" (offer type: ${business.offerType}).

Lead: ${JSON.stringify({
      company: lead.company_name,
      title: lead.title,
      website: lead.website,
      notes: lead.research_notes,
    })}

Reply with ONLY compact JSON: {"score":"HOT|WARM|COLD","reason":"one short sentence"}`;

    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(res.choices[0].message.content);
    return {
      score: ['HOT', 'WARM', 'COLD'].includes(parsed.score) ? parsed.score : 'WARM',
      reason: parsed.reason || '',
      usage: usageFrom(res),
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
  const client = getClient();

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
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(res.choices[0].message.content);
  return { subject: parsed.subject || '', body: parsed.body || '', usage: usageFrom(res) };
}

module.exports = { scoreLead, draftMessage };
