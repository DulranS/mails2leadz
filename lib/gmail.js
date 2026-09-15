const { google } = require('googleapis');

function getOAuthClient(credentials) {
  const { clientId, clientSecret, refreshToken } = credentials;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'This account has no Gmail credentials set yet — add them in Settings. ' +
      'Get a refresh token once via Google OAuth Playground with the gmail.send + gmail.readonly scopes.'
    );
  }
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
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
 * Sends an email using ONE account's own Gmail credentials — every SME
 * customer sends from their own mailbox, never a shared address.
 * `credentials`: { clientId, clientSecret, refreshToken, senderEmail }
 * Pass `threadId` + `threadHeaders` to reply within an existing thread
 * (used for follow-ups), omit for a fresh thread.
 */
async function sendEmail(credentials, { to, subject, body, threadId, threadHeaders }) {
  const auth = getOAuthClient(credentials);
  const gmail = google.gmail({ version: 'v1', auth });
  const from = credentials.senderEmail;
  if (!from) throw new Error('This account has no Gmail sender email set — add it in Settings.');

  const raw = buildRawMessage({ to, from, subject, body, threadHeaders });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId },
  });

  return { messageId: res.data.id, threadId: res.data.threadId };
}

/**
 * Polls one account's inbox for new inbound replies. Called once per
 * account (with that account's credentials) from /api/inbox/check.
 */
async function listRecentInboundReplies(credentials, { sinceMinutesAgo = 30 } = {}) {
  const auth = getOAuthClient(credentials);
  const gmail = google.gmail({ version: 'v1', auth });

  const afterEpochSeconds = Math.floor(Date.now() / 1000) - sinceMinutesAgo * 60;
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: `in:inbox after:${afterEpochSeconds}`,
    maxResults: 25, // keeps a single poll comfortably inside maxDuration on Vercel Hobby
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
