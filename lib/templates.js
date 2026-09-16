const { getSupabase } = require('./supabase');

const MAX_EXAMPLES = 2;

/**
 * This account's own most-recent proven templates for a channel/step, used
 * as few-shot calibration in lib/ai.js draftMessage(). Most-recent first —
 * a business's voice and offer evolve, so the newest saved example is the
 * best proxy for "what's working right now", not necessarily the oldest.
 * Never throws — a lookup failure should degrade to "no examples", not
 * block drafting.
 */
async function getBestTemplates(accountId, channel, step, limit = MAX_EXAMPLES) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('templates')
      .select('subject, body')
      .eq('account_id', accountId)
      .eq('channel', channel)
      .eq('is_followup', step > 0)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('getBestTemplates failed (non-fatal):', err.message);
    return [];
  }
}

/** Saves a sent message as a reusable template. `message` is a row from `messages`. */
async function saveTemplateFromMessage(accountId, message, name) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('templates')
    .insert({
      account_id: accountId,
      name: name || message.subject || message.body.slice(0, 48),
      channel: message.channel,
      is_followup: (message.sequence_step || 0) > 0,
      subject: message.subject || null,
      body: message.body,
      source_message_id: message.id,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function listTemplates(accountId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function deleteTemplate(accountId, templateId) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('templates')
    .delete()
    .eq('id', templateId)
    .eq('account_id', accountId); // ownership check
  if (error) throw error;
}

module.exports = { getBestTemplates, saveTemplateFromMessage, listTemplates, deleteTemplate };
