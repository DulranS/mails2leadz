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

/** Increments today's counter for `channel` on this account by `n`. */
async function incrementQuota(accountId, channel, n = 1) {
  const supabase = getSupabase();
  const day = today();

  const { data: existing } = await supabase
    .from('send_counters')
    .select('count')
    .eq('account_id', accountId)
    .eq('day', day)
    .eq('channel', channel)
    .maybeSingle();

  const newCount = (existing?.count || 0) + n;

  const { error } = await supabase
    .from('send_counters')
    .upsert(
      { account_id: accountId, day, channel, count: newCount },
      { onConflict: 'account_id,day,channel' }
    );

  if (error) throw error;
}

module.exports = { remainingQuota, incrementQuota };
