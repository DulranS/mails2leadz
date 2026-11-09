// lib/server/slack-connect.js - the incoming-webhook address Slack gives on approval; kept on the owner's business settings. Pure parse + store.
export function slackWebhookFrom(json) {
  const url = String(json?.incoming_webhook?.url || '');
  return json?.ok === true && /^https:\/\/hooks\.slack\.com\//.test(url) ? url : null;
}
