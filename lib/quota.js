const { getSupabase } = require('./supabase');

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Returns how many sends are still allowed on `channel` today.
 */
async function remainingQuota(channel, dailyLimit) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('send_counters')
    .select('count')
    .eq('day', today())
    .eq('channel', channel)
    .maybeSingle();

  if (error) throw error;
  const used = data ? data.count : 0;
  return Math.max(0, dailyLimit - used);
}

/**
 * Increments today's counter for `channel` by `n`. Uses upsert + a Postgres
 * function-free approach (read-modify-write is fine here — this runs from a
 * single cron/serverless invocation at a time, not high concurrency).
 */
async function incrementQuota(channel, n = 1) {
  const supabase = getSupabase();
  const day = today();

  const { data: existing } = await supabase
    .from('send_counters')
    .select('count')
    .eq('day', day)
    .eq('channel', channel)
    .maybeSingle();

  const newCount = (existing?.count || 0) + n;

  const { error } = await supabase
    .from('send_counters')
    .upsert({ day, channel, count: newCount }, { onConflict: 'day,channel' });

  if (error) throw error;
}

module.exports = { remainingQuota, incrementQuota };
