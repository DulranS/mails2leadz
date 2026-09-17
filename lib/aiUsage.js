const { getSupabase } = require('./supabase');

// Per-1M-token USD pricing, by provider. These are the numbers that go
// stale fastest of anything in this codebase — DeepSeek in particular has
// changed model names and introduced peak/off-peak billing multiple times
// in 2026. Override any of them from .env.local (no code change needed):
//   AI_PRICE_INPUT_PER_1M / AI_PRICE_OUTPUT_PER_1M
// Otherwise these defaults are used as a reasonable approximation — check
// https://api-docs.deepseek.com/quick_start/pricing (or your provider's
// pricing page) and update .env.local if your bill doesn't match.
const DEFAULT_PRICING = {
  deepseek: { input: 0.28, output: 0.42 },   // DeepSeek chat-tier model, off-peak-ish blended estimate
  qwen: { input: 0.4, output: 1.2 },          // Alibaba Qwen-Plus, approximate
  openai: { input: 0.15, output: 0.6 },       // gpt-4o-mini
};

function pricingFor(providerName) {
  const overrideInput = process.env.AI_PRICE_INPUT_PER_1M;
  const overrideOutput = process.env.AI_PRICE_OUTPUT_PER_1M;
  if (overrideInput && overrideOutput) {
    return { input: parseFloat(overrideInput), output: parseFloat(overrideOutput) };
  }
  return DEFAULT_PRICING[providerName] || DEFAULT_PRICING.deepseek;
}

function costForTokens(inputTokens, outputTokens, providerName = process.env.AI_PROVIDER || 'deepseek') {
  const price = pricingFor((providerName || 'deepseek').toLowerCase());
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

/**
 * Adds one AI call's token usage to the account's running total. Best-effort
 * — a failed usage write must never block a draft or a score from
 * completing, so this always swallows its own errors. Uses the
 * `increment_ai_usage` SQL function (see database/schema.sql) so this is one
 * atomic round trip instead of a read-then-write — the latter can silently
 * lose an update when two AI calls for the same account finish close
 * together (e.g. the daily cron and a manual click at the same moment).
 */
async function trackUsage(accountId, usage) {
  if (!usage || !accountId) return;
  try {
    const supabase = getSupabase();
    const { error } = await supabase.rpc('increment_ai_usage', {
      p_account_id: accountId,
      p_input_tokens: usage.prompt_tokens || 0,
      p_output_tokens: usage.completion_tokens || 0,
    });
    if (error) throw error;
  } catch (err) {
    console.error('trackUsage failed (non-fatal):', err.message);
  }
}

module.exports = {
  trackUsage,
  costForTokens,
  pricingFor,
};
