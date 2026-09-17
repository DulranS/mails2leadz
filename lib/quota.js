const { getSupabase } = require('./supabase');

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Returns how many sends are still allowed on `channel` today for this account. */
async function remainingQuota(accountId, channel, dailyLimit) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('send_counters')
    .select('count')
    .eq('account_id', accountId)
    .eq('day', today())
    .eq('channel', channel)
    .maybeSingle();

  if (error) throw error;
  const used = data ? data.count : 0;
  return Math.max(0, dailyLimit - used);
}

/** Increments today's counter for `channel` on this account by `n`. Uses the
 * `increment_send_counter` SQL function (see database/schema.sql) — one
 * atomic upsert instead of a read-then-upsert, which matters here more than
 * almost anywhere else in the app: this number is what gates whether an
 * account is allowed to send at all, so a lost update under concurrent
 * approvals could let a daily cap silently slip. */
async function incrementQuota(accountId, channel, n = 1) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('increment_send_counter', {
    p_account_id: accountId,
    p_day: today(),
    p_channel: channel,
    p_n: n,
  });
  if (error) throw error;
}

module.exports = { remainingQuota, incrementQuota };
