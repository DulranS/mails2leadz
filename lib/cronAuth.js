/**
 * Protects the high-frequency endpoints (inbox/check, followups/run) that
 * can't use Vercel's built-in Cron on the Hobby plan (capped at once/day)
 * and so are triggered by a free external scheduler instead. Without this,
 * the routes would be public URLs that send real emails/WhatsApp messages
 * and burn your OpenAI + Vercel quota for anyone who finds them.
 *
 * Vercel's own Cron (used for the once-daily campaign send) already sends
 * an `Authorization: Bearer $CRON_SECRET` header automatically when
 * CRON_SECRET is set as an env var — so the same secret protects both.
 */
function isAuthorizedCronRequest(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed: if you haven't set a secret yet, don't allow the route
    // to be triggered externally at all.
    return false;
  }
  const authHeader = request.headers.get('authorization') || '';
  return authHeader === `Bearer ${secret}`;
}

module.exports = { isAuthorizedCronRequest };
