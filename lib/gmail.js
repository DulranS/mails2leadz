const { google } = require('googleapis');

function getOAuthClient() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error(
      'Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN in .env.local. ' +
      'Get the refresh token once via Google OAuth Playground with the gmail.send + gmail.readonly scopes.'
    );
  }
  const oAuth2Client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  oAuth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  return oAuth2Client;
}

function buildRawMessage({ to, from, subject, body, threadHeaders }) {
  const lines = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
  ];
  if (threadHeaders?.references) lines.push(`References: ${threadHeaders.references}`);
  if (threadHeaders?.inReplyTo) lines.push(`In-Reply-To: ${threadHeaders.inReplyTo}`);
  lines.push('', body);

  const message = lines.join('\r\n');
  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Sends an email. Pass `threadId` + `threadHeaders` to send as a reply in an
 * existing Gmail thread (used for follow-ups), omit for a fresh thread.
 */
async function sendEmail({ to, subject, body, threadId, threadHeaders }) {
  const auth = getOAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const from = process.env.GMAIL_SENDER_EMAIL;
  if (!from) throw new Error('Missing GMAIL_SENDER_EMAIL in .env.local');

  const raw = buildRawMessage({ to, from, subject, body, threadHeaders });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId },
  });

  return { messageId: res.data.id, threadId: res.data.threadId };
}

/**
 * Polls for new inbound replies in threads we started. Call this from the
 * /api/inbox/check cron. Returns an array of { threadId, from, snippet }.
 * Cheap approach: search inbox for unread messages newer than `sinceMinutesAgo`.
 */
async function listRecentInboundReplies({ sinceMinutesAgo = 30 } = {}) {
  const auth = getOAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const afterEpochSeconds = Math.floor(Date.now() / 1000) - sinceMinutesAgo * 60;
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: `in:inbox after:${afterEpochSeconds}`,
    maxResults: 50,
  });

  const messages = res.data.messages || [];
  const details = [];
  for (const m of messages) {
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: m.id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject'],
    });
    const headers = full.data.payload.headers || [];
    const from = headers.find((h) => h.name === 'From')?.value || '';
    details.push({
      messageId: m.id,
      threadId: full.data.threadId,
      from,
      snippet: full.data.snippet,
    });
  }
  return details;
}

module.exports = { sendEmail, listRecentInboundReplies };
