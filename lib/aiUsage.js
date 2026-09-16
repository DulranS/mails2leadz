const { getSupabase } = require('./supabase');

// gpt-4o-mini pricing at time of writing — the only two numbers that go
// stale. Update these if OpenAI changes pricing; every consumer (the
// analytics cost tile) reads through costForTokens(), so nothing else
// needs to change.
const PRICE_PER_1M_INPUT_TOKENS_USD = 0.15;
const PRICE_PER_1M_OUTPUT_TOKENS_USD = 0.6;

function costForTokens(inputTokens, outputTokens) {
  return (
    (inputTokens / 1_000_000) * PRICE_PER_1M_INPUT_TOKENS_USD +
    (outputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT_TOKENS_USD
  );
}

/**
 * Adds one AI call's token usage to the account's running total. Best-effort
 * — a failed usage write must never block a draft or a score from
 * completing, so this always swallows its own errors.
 */
async function trackUsage(accountId, usage) {
  if (!usage || !accountId) return;
  try {
    const supabase = getSupabase();
    const { data: account } = await supabase
      .from('accounts')
      .select('ai_input_tokens, ai_output_tokens')
      .eq('id', accountId)
      .maybeSingle();
    if (!account) return;

    await supabase
      .from('accounts')
      .update({
        ai_input_tokens: (account.ai_input_tokens || 0) + (usage.prompt_tokens || 0),
        ai_output_tokens: (account.ai_output_tokens || 0) + (usage.completion_tokens || 0),
      })
      .eq('id', accountId);
  } catch (err) {
    console.error('trackUsage failed (non-fatal):', err.message);
  }
}

module.exports = {
  trackUsage,
  costForTokens,
  PRICE_PER_1M_INPUT_TOKENS_USD,
  PRICE_PER_1M_OUTPUT_TOKENS_USD,
};
