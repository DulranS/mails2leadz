const { getSupabase } = require('./supabase');
const { sendEmail } = require('./gmail');
const { remainingQuota } = require('./quota');

const LOOKBACK_HOURS = 26; // > 24h so a slightly-late cron run never misses a day

/**
 * Builds (and, unless dryRun, sends) one account owner's daily digest —
 * a plain summary emailed to THEIR OWN mailbox (from == to == their own
 * gmail_sender_email), never to a lead or any third party. That's what
 * makes this safe to run fully automated with no approval step: it's a
 * notification to the person who already owns every send decision, not a
 * new outbound message to anyone else. Returns null if there's nothing
 * worth a notification for, so accounts with a quiet day get no email at
 * all — the ask was "efficient", and an empty digest is wasted attention
 * (and a wasted send) for the owner.
 */
async function buildDigestForAccount(account) {
  if (!account.channel_email || !account.gmail_sender_email || !account.gmail_refresh_token) return null;

  const supabase = getSupabase();
  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 3600000).toISOString();

  const [{ count: draftsWaiting }, { data: newReplies }, { data: newWins }] = await Promise.all([
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', account.id)
      .eq('status', 'draft'),
    supabase
      .from('leads')
      .select('full_name, email, company_name')
      .eq('account_id', account.id)
      .eq('status', 'replied')
      .gte('replied_at', sinceIso),
    supabase
      .from('leads')
      .select('full_name, email, company_name')
      .eq('account_id', account.id)
      .eq('status', 'won')
      .gte('updated_at', sinceIso),
  ]);

  const replies = newReplies || [];
  const wins = newWins || [];

  if (!draftsWaiting && replies.length === 0 && wins.length === 0) return null;

  const emailLeft = await remainingQuota(account.id, 'email', account.max_emails_per_day);
  const waLeft = account.channel_whatsapp
    ? await remainingQuota(account.id, 'whatsapp', account.max_whatsapp_per_day)
    : null;

  const lines = [];
  lines.push(`Good morning — here's what's waiting on ${account.name || 'your account'}:`, '');
  if (draftsWaiting) lines.push(`• ${draftsWaiting} draft${draftsWaiting === 1 ? '' : 's'} ready for your review.`);
  if (replies.length) {
    lines.push(`• ${replies.length} new repl${replies.length === 1 ? 'y' : 'ies'}:`);
    replies.slice(0, 10).forEach((l) => lines.push(`   – ${l.full_name || l.email}${l.company_name ? ` (${l.company_name})` : ''}`));
  }
  if (wins.length) {
    lines.push(`• ${wins.length} lead${wins.length === 1 ? '' : 's'} marked won since yesterday — nice.`);
  }
  lines.push('', `Sends left today: ${emailLeft} email${waLeft !== null ? `, ${waLeft} WhatsApp` : ''}.`);
  if (process.env.NEXT_PUBLIC_APP_URL) lines.push('', `Review now: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard`);

  const subjectBits = [];
  if (draftsWaiting) subjectBits.push(`${draftsWaiting} draft${draftsWaiting === 1 ? '' : 's'}`);
  if (replies.length) subjectBits.push(`${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}`);
  const subject = `Outbound Engine: ${subjectBits.join(', ')} waiting`;

  return { subject, body: lines.join('\n') };
}

/**
 * Sends the digest for every account that has one worth sending. Designed
 * to be called from a cron route — see app/api/digest/send. Never throws
 * per-account, so one account's bad Gmail token can't stop everyone else's
 * digest.
 */
async function sendDailyDigests() {
  const supabase = getSupabase();
  const { data: accounts, error } = await supabase.from('accounts').select('*');
  if (error) throw error;

  const results = { sent: 0, skipped: 0, failed: [] };
  for (const account of accounts || []) {
    try {
      const digest = await buildDigestForAccount(account);
      if (!digest) {
        results.skipped++;
        continue;
      }
      await sendEmail(
        {
          clientId: account.gmail_client_id,
          clientSecret: account.gmail_client_secret,
          refreshToken: account.gmail_refresh_token,
          senderEmail: account.gmail_sender_email,
        },
        { to: account.gmail_sender_email, subject: digest.subject, body: digest.body }
      );
      results.sent++;
    } catch (err) {
      console.error(`Digest failed for account ${account.id}:`, err.message);
      results.failed.push({ accountId: account.id, error: err.message });
    }
  }
  return results;
}

module.exports = { buildDigestForAccount, sendDailyDigests };
