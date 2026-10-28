// lib/preflight.js - checks that the settings needed for a live run are present. Pure: reads the values it is given, never prints them.
const has = (env, k) => String(env?.[k] ?? '').trim() !== '';
const isHttps = (v) => /^https:\/\/\S+$/.test(String(v || '').trim()) || /^http:\/\/localhost(:\d+)?(\/|$)/.test(String(v || '').trim());

/**
 * @returns {{ items: {area: string, name: string, ok: boolean, required: boolean, note: string}[], missingRequired: number }}
 */
export function checkEnv(env = {}) {
  const items = [];
  const add = (area, name, ok, required, note) => items.push({ area, name, ok: !!ok, required, note });

  for (const k of ['NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_APP_ID']) {
    add('Database', k, has(env, k), true, 'from the Firebase console, Project settings');
  }
  const serverOk = has(env, 'FIREBASE_SERVICE_ACCOUNT_JSON') || (has(env, 'FIREBASE_SERVER_EMAIL') && has(env, 'FIREBASE_SERVER_PASSWORD'));
  add('Database', 'server login (FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_SERVER_EMAIL + FIREBASE_SERVER_PASSWORD)', serverOk, true, 'the server needs one of these to read and write the data');

  add('AI', 'an AI key (DEEPSEEK_API_KEY, OPENAI_API_KEY or ANTHROPIC_API_KEY)', has(env, 'DEEPSEEK_API_KEY') || has(env, 'OPENAI_API_KEY') || has(env, 'ANTHROPIC_API_KEY'), true, 'drafts, replies and analysis need one');
  add('AI', 'AI_MONTHLY_BUDGET_USD', has(env, 'AI_MONTHLY_BUDGET_USD'), false, 'a monthly cap on AI spend; set it before a live run');

  add('Gmail', 'NEXT_PUBLIC_GOOGLE_CLIENT_ID', has(env, 'NEXT_PUBLIC_GOOGLE_CLIENT_ID'), true, 'from Google Cloud, OAuth client');
  add('Gmail', 'NEXT_PUBLIC_GOOGLE_CLIENT_SECRET', has(env, 'NEXT_PUBLIC_GOOGLE_CLIENT_SECRET'), true, 'from the same OAuth client');
  add('Gmail', 'NEXT_PUBLIC_GOOGLE_REDIRECT_URI', isHttps(env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI), true, 'must be an https address (or localhost for testing)');
  add('Gmail', 'GMAIL_SENDER_EMAIL', has(env, 'GMAIL_SENDER_EMAIL'), true, 'the address emails are sent from');
  add('Gmail', 'TOKEN_ENC_KEY', has(env, 'TOKEN_ENC_KEY'), true, 'encrypts the stored Gmail access; without it reconnecting Gmail fails');

  add('App', 'NEXT_PUBLIC_BASE_URL', isHttps(env.NEXT_PUBLIC_BASE_URL), true, 'the public address of the app (https)');
  add('App', 'CRON_SECRET', has(env, 'CRON_SECRET'), true, 'lets the nightly jobs run and stops anyone else from triggering them');
  add('App', 'UNSUBSCRIBE_SECRET', has(env, 'UNSUBSCRIBE_SECRET'), true, 'signs the opt-out links in emails');
  add('App', 'ADMIN_EMAILS', has(env, 'ADMIN_EMAILS'), false, 'the operator console is only for these addresses');

  const saas = String(env.SAAS_MODE || '').toLowerCase() === 'on';
  if (saas) {
    for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_STARTER', 'STRIPE_PRICE_GROWTH']) {
      add('Selling (SAAS_MODE on)', k, has(env, k), true, 'needed because you are selling the software');
    }
  } else {
    add('Selling', 'SAAS_MODE', true, false, 'off: this is for your own use (unlimited). Turn it on only when you sell.');
  }

  add('Optional', 'REDIS_URL', has(env, 'REDIS_URL'), false, 'shares account limits across servers; optional');
  add('Optional', 'TWILIO_ACCOUNT_SID', has(env, 'TWILIO_ACCOUNT_SID'), false, 'calls and SMS; optional');

  return { items, missingRequired: items.filter((i) => i.required && !i.ok).length };
}
