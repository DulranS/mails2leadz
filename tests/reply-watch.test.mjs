// Reply watch: full reply text, token vault, the shared reply-check loop (with a fake Gmail and a fake database), and the timed-job rules.
import assert from 'node:assert/strict';
import { cleanReplyText, htmlToText, decodeEntities } from '../lib/reply-text.js';
import { quickIntent } from '../lib/reply-intents.js';
import { extractText, isAutoReplyHeaders, readMessage, buildSavedThread, decodeB64Url } from '../lib/server/gmail-message.js';
import { encryptToken, decryptToken, tokenKeyUsable } from '../lib/server/token-vault.js';
import { pickDue, publicStatus, MIN_INTERVAL_MS } from '../lib/gmail-watch.js';
import { runReplyCheck, GmailAuthError, isGmailAuthError } from '../lib/server/reply-check.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const part = (mimeType, text, extra = {}) => ({ mimeType, body: { data: b64(text) }, ...extra });

// ---------------------------------------------------------------- reading the whole reply
await t('quoted history, ">" lines and Outlook headers are cut; the sender\'s own words stay', () => {
  assert.equal(cleanReplyText('Hi,\r\nYes please, send the price list.\r\n\r\nOn Tue, Oct 13, 2026 at 3:12 PM Dulran <d@x.com>\r\nwrote:\r\n> hello\r\n> there'), 'Hi,\nYes please, send the price list.');
  assert.equal(cleanReplyText('Sounds good.\n> earlier text\n> more'), 'Sounds good.');
  assert.equal(cleanReplyText('Call me.\n\n-----Original Message-----\nFrom: a\nSent: b'), 'Call me.');
  assert.equal(cleanReplyText('x'.repeat(9000)).length, 4000);
  assert.equal(cleanReplyText('> only a quote'), '> only a quote'); // never becomes empty
  assert.equal(cleanReplyText(null), '');
});
await t('a reply that says "on Thursday" is not cut there (the quote marker must have the real shape of a quote header)', () => {
  assert.equal(cleanReplyText('Let us talk on Thursday. Call me.\n\nOn Mon, 12 Oct 2026 at 9:00 AM Me <me@y.com> wrote:\n> Hello'), 'Let us talk on Thursday. Call me.');
  assert.equal(cleanReplyText('Thanks. I will answer on Monday what we discussed.'), 'Thanks. I will answer on Monday what we discussed.');
  assert.equal(cleanReplyText('Oui merci.\n\nLe 12 oct. 2026 à 10:00, Marie <m@x.fr> a écrit :\n> bonjour'), 'Oui merci.');
  assert.equal(cleanReplyText('Yes please On Mon, Oct 12, 2026 at 9:00 AM Me <me@y.com> wrote: Hello'), 'Yes please'); // Gmail's one-line preview
});
await t('HTML-only replies are converted to text; scripts, styles and Gmail quote blocks are dropped; entities decoded', () => {
  const html = '<html><head><style>p{color:red}</style></head><body><div>Hello&nbsp;there &amp; thanks<br>See you &#8211; soon &#x41;</div><div class="gmail_quote"><blockquote>old stuff</blockquote></div><script>alert(1)</script></body></html>';
  const text = htmlToText(html);
  assert.ok(/Hello there & thanks\nSee you . soon A/.test(text), text);
  assert.ok(!/old stuff|alert|color:red/.test(text));
  assert.equal(decodeEntities('&bogus; &#0; &#9999999;'), '&bogus;    ');
});
await t('Gmail payloads: base64url, nested multipart, plain preferred, HTML fallback, attachments ignored', () => {
  assert.equal(decodeB64Url(Buffer.from('héllo ?>~', 'utf8').toString('base64url')), 'héllo ?>~');
  const nested = { mimeType: 'multipart/mixed', parts: [{ mimeType: 'multipart/alternative', parts: [part('text/plain', 'Plain version'), part('text/html', '<p>HTML version</p>')] }, part('text/plain', 'SECRET', { filename: 'notes.txt' })] };
  assert.equal(extractText(nested), 'Plain version');
  assert.equal(extractText({ mimeType: 'multipart/alternative', parts: [part('text/html', '<p>Only <b>HTML</b></p>')] }), 'Only HTML');
  assert.equal(extractText(part('text/plain', 'single part')), 'single part');
  assert.equal(extractText({}), ''); assert.equal(extractText(null), '');
  let deep = part('text/plain', 'buried'); for (let i = 0; i < 30; i++) deep = { mimeType: 'multipart/mixed', parts: [deep] };
  assert.equal(extractText(deep), ''); // a hostile, absurdly nested message cannot hang or crash the check
});
await t('automatic answers are recognised from headers, not just wording', () => {
  assert.ok(isAutoReplyHeaders({ 'auto-submitted': 'auto-replied' }));
  assert.ok(isAutoReplyHeaders({ 'x-autoreply': 'yes' }));
  assert.ok(isAutoReplyHeaders({ precedence: 'auto_reply' }));
  assert.ok(!isAutoReplyHeaders({ 'auto-submitted': 'no' }));
  assert.ok(!isAutoReplyHeaders({ precedence: 'bulk' }));
  assert.ok(!isAutoReplyHeaders({ 'x-auto-response-suppress': 'All' })); // Exchange stamps ordinary mail with this
  assert.ok(!isAutoReplyHeaders({}));
});
await t('readMessage: full text when the body is there, the preview only when it is not', () => {
  const full = readMessage({ id: 'm1', threadId: 'th1', snippet: 'Yes plea', payload: { headers: [{ name: 'From', value: 'Ann <ann@x.com>' }, { name: 'Subject', value: 'Re: Hello' }, { name: 'Date', value: 'Tue, 13 Oct 2026 10:00:00 +0000' }], ...part('text/plain', 'Yes please, we need 3 licences.\n\nOn Mon, 12 Oct 2026, Me wrote:\n> hi') } });
  assert.equal(full.text, 'Yes please, we need 3 licences.'); assert.equal(full.hasFullText, true); assert.equal(full.from, 'Ann <ann@x.com>'); assert.equal(full.threadId, 'th1');
  const preview = readMessage({ id: 'm2', snippet: 'Just the preview', payload: { headers: [] } });
  assert.equal(preview.text, 'Just the preview'); assert.equal(preview.hasFullText, false);
});
await t('reading the full text must not create false opt-outs or false out-of-office', () => {
  const footer = 'Thanks for the info, please send pricing for 20 seats and a demo time on Thursday. ' + 'We compare three suppliers every quarter. '.repeat(25) + '\n\nTo unsubscribe from our partner newsletter click here.';
  assert.equal(quickIntent(footer), null);                                                   // "unsubscribe" far down is a footer
  assert.equal(quickIntent('Hi, please unsubscribe me from this.'), 'unsubscribe');         // said up front: honoured
  assert.equal(quickIntent('Interested! I will be back on Monday, can you send the pricing?\n' + 'We have a long list of questions about integrations and support hours. '.repeat(12)), null); // a long real reply that mentions being away
  assert.equal(quickIntent('Automatic reply: I am out of office until Monday.'), 'out_of_office');
});
await t('saved thread: our email + their saved reply, nothing when no reply was saved', () => {
  const sent = { to: 'ann@x.com', subject: 'Hello', body: 'Hi Ann', sentAt: '2026-10-12T08:00:00Z', replyText: 'Yes please', replyFrom: 'Ann <ann@x.com>', repliedAt: '2026-10-13T08:00:00Z', threadId: 'th1' };
  const th = buildSavedThread(sent, { myEmail: 'me@y.com' });
  assert.equal(th.source, 'saved'); assert.equal(th.totalMessages, 2);
  assert.deepEqual(th.messages.map((m) => m.from), ['me@y.com', 'Ann <ann@x.com>']);
  assert.equal(th.messages[1].text, 'Yes please');
  assert.equal(buildSavedThread({ ...sent, replyText: '' }), null); assert.equal(buildSavedThread(null), null);
});

// ---------------------------------------------------------------- the stored Gmail key
const KEY = 'a-long-random-server-secret-for-tests-123456';
await t('token vault: round-trips, is bound to the owner and the key, detects tampering, refuses weak keys', () => {
  const enc = encryptToken('1//refresh-token-abc', 'uid1', KEY);
  assert.ok(enc.startsWith('v1.') && !enc.includes('refresh-token'));
  assert.equal(decryptToken(enc, 'uid1', KEY), '1//refresh-token-abc');
  assert.notEqual(encryptToken('1//refresh-token-abc', 'uid1', KEY), enc); // fresh random IV every time
  assert.equal(decryptToken(enc, 'uid2', KEY), null);                      // copied under another account: useless
  assert.equal(decryptToken(enc, 'uid1', KEY + 'x'), null);                // wrong server key
  const [v, iv, tag, ct] = enc.split('.');
  assert.equal(decryptToken([v, iv, tag, ct.slice(0, -2) + (ct.endsWith('AA') ? 'BB' : 'AA')].join('.'), 'uid1', KEY), null); // tampered
  for (const junk of [null, '', 'v1', 'v2.a.b.c', 'v1.a.b']) assert.equal(decryptToken(junk, 'uid1', KEY), null);
  assert.throws(() => encryptToken('x', 'uid1', 'short'));
  assert.ok(tokenKeyUsable(KEY) && !tokenKeyUsable('short') && !tokenKeyUsable(''));
});

// ---------------------------------------------------------------- whose turn it is
await t('timed job: oldest check first, never-checked first, skips just-checked, paused and needs-reconnect owners', () => {
  const NOW = Date.parse('2026-10-16T01:00:00Z');
  const ago = (min) => new Date(NOW - min * 60000).toISOString();
  const conns = [
    { uid: 'recent', lastCheckAt: ago(2) }, { uid: 'old', lastCheckAt: ago(600) }, { uid: 'never' }, { uid: 'paused', enabled: false, lastCheckAt: ago(900) },
    { uid: 'broken', status: 'needs_reconnect', lastCheckAt: ago(900) }, { uid: 'mid', lastCheckAt: ago(60) }, null,
  ];
  assert.deepEqual(pickDue(conns, NOW).map((c) => c.uid), ['never', 'old', 'mid']);
  assert.ok(MIN_INTERVAL_MS >= 5 * 60000);
  assert.deepEqual(pickDue(null, NOW), []);
});
await t('the owner\'s screen never receives the token', () => {
  const s = publicStatus({ email: 'me@y.com', refreshTokenEnc: 'v1.secret', status: 'ok', recent: Array.from({ length: 50 }, (_, i) => ({ i })) });
  assert.ok(!JSON.stringify(s).includes('secret') && !('refreshTokenEnc' in s)); assert.equal(s.recent.length, 20); assert.equal(s.connected, true);
  assert.deepEqual(publicStatus(null), { connected: false });
});

// ---------------------------------------------------------------- the reply-check loop, end to end with fakes
function world({ sent = [], messages = {}, listFor = () => [], failWith = null, bounceText = '' } = {}) {
  const writes = [];
  const rows = sent.map((x, i) => ({ id: `s${i}`, data: { userId: 'u1', replied: false, sentAt: new Date().toISOString(), subject: 'Hello', businessName: 'Acme', ...x } }));
  const docs = rows.map((r) => ({ id: r.id, ref: { id: r.id }, data: () => r.data }));
  const calls = { list: 0, get: 0 };
  const gmail = { users: { messages: {
    list: async ({ q }) => {
      calls.list++;
      if (failWith) throw failWith;
      if (/mailer-daemon/.test(q)) return { data: { messages: bounceText ? [{ id: 'bounce1' }] : [] } };
      return { data: { messages: listFor(q).map((id) => ({ id })) } };
    },
    get: async ({ id, format }) => { calls.get++; if (id === 'bounce1') return { data: { snippet: bounceText } }; assert.equal(format, 'full'); return { data: messages[id] }; },
  } } };
  const track = { suppressed: [], triaged: [], cancelled: [], tracked: [] };
  const deps = {
    collection: (_db, name) => name, where: () => null, query: (c) => c,
    getDocs: async () => ({ empty: docs.length === 0, docs }),
    updateDoc: async (ref, patch) => { writes.push({ id: ref.id, patch }); },
    isAdminMode: () => true,
    loadAutopilot: async () => ({ autoDeals: true }),
    cancelPendingFollowUps: async (_db, uid, email) => { track.cancelled.push(email); },
    triageReply: async (_db, o) => { track.triaged.push(o); return { email: o.email, label: 'Interested', action: 'deal created' }; },
    suppressContact: async (_db, o) => { track.suppressed.push(o); },
  };
  return { gmail, deps, writes, track, calls };
}
const reply = (id, text, headers = [], extra = {}) => ({ id, threadId: 'th-' + id, snippet: text.slice(0, 60), payload: { headers: [{ name: 'From', value: 'Ann <ann@x.com>' }, { name: 'Subject', value: 'Re: Hello' }, { name: 'Date', value: 'Tue, 13 Oct 2026 10:00:00 +0000' }, ...headers], ...part('text/plain', text) }, ...extra });
const run = (w, o = {}) => runReplyCheck({ db: {}, gmail: w.gmail, userId: 'u1', senderEmail: 'me@y.com', trackReply: async (p) => w.track.tracked.push(p), ...o }, w.deps);

await t('a real reply is stored IN FULL (quotes removed), follow-ups cancelled, reply triaged on the full text, company tracked', async () => {
  const long = 'Hi, yes we are interested.\n' + 'Here are our requirements in detail. '.repeat(30) + '\nCall me on Thursday.\n\nOn Mon, 12 Oct 2026 at 9:00 AM Me <me@y.com> wrote:\n> Hello Ann';
  const w = world({ sent: [{ to: 'ann@x.com' }], listFor: () => ['r1'], messages: { r1: reply('r1', long) } });
  const r = await run(w);
  assert.equal(r.replyCount, 1); assert.equal(r.checked, 1);
  const patch = w.writes.find((x) => x.patch.replied).patch;
  assert.ok(patch.replyText.includes('Call me on Thursday.') && !patch.replyText.includes('wrote:') && patch.replyText.length > 400); // far beyond a 200-char preview
  assert.equal(patch.replyHasFullText, true); assert.equal(patch.followUpAt, null); assert.equal(patch.replyThreadId, 'th-r1');
  assert.deepEqual(w.track.cancelled, ['ann@x.com']);
  assert.ok(w.track.triaged[0].replyText.includes('Call me on Thursday.')); // the classifier sees the whole reply
  assert.equal(w.track.tracked[0].action, 'reply'); assert.equal(w.track.tracked[0].companyName, 'Acme');
  assert.equal(r.triage.length, 1); assert.ok(r.replies[0].replyText.length <= 600);
});
await t('an out-of-office (by header OR by short wording) is set aside: not a reply, follow-ups carry on, not picked up twice', async () => {
  const byHeader = world({ sent: [{ to: 'ann@x.com' }], listFor: () => ['r1'], messages: { r1: reply('r1', 'Thanks for your message, I will respond shortly.', [{ name: 'Auto-Submitted', value: 'auto-replied' }]) } });
  const a = await run(byHeader);
  assert.equal(a.replyCount, 0); assert.equal(a.autoReplies, 1);
  assert.equal(byHeader.writes[0].patch.autoReplyMessageId, 'r1'); assert.ok(!byHeader.writes.some((x) => x.patch.replied));
  assert.equal(byHeader.track.cancelled.length, 0);
  const byWords = world({ sent: [{ to: 'ann@x.com' }], listFor: () => ['r2'], messages: { r2: reply('r2', 'Automatic reply: I am out of office until 3 Nov.') } });
  assert.equal((await run(byWords)).autoReplies, 1);
  const again = world({ sent: [{ to: 'ann@x.com', autoReplyMessageId: 'r1' }], listFor: () => ['r1'], messages: {} });
  const c = await run(again);
  assert.equal(c.autoReplies, 0); assert.equal(again.calls.get, 0); // remembered: not even fetched again
  assert.ok(again.writes[0].patch.replyCheckedAt);
});
await t('no reply: the email is stamped so the rotation moves on; an empty list does no Gmail work at all', async () => {
  const w = world({ sent: [{ to: 'ann@x.com' }, { to: 'bob@x.com' }], listFor: () => [] });
  const r = await run(w);
  assert.equal(r.replyCount, 0); assert.equal(r.checked, 2);
  assert.equal(w.writes.filter((x) => x.patch.replyCheckedAt).length, 2);
  const empty = world({});
  assert.equal((await run(empty)).checked, 0); assert.equal(empty.calls.list, 0);
});
await t('Gmail refusing the credentials aborts the whole run at once (no 50 pointless retries) with a typed error', async () => {
  const w = world({ sent: Array.from({ length: 5 }, (_, i) => ({ to: `p${i}@x.com` })), failWith: Object.assign(new Error('invalid_grant'), { code: 400 }) });
  await assert.rejects(() => run(w), (e) => e instanceof GmailAuthError && e.code === 'GMAIL_AUTH');
  assert.equal(w.calls.list, 1);
  assert.ok(isGmailAuthError({ code: 401 }) && isGmailAuthError(new Error('Invalid Credentials')) && !isGmailAuthError(new Error('socket hang up')));
  const flaky = world({ sent: [{ to: 'ann@x.com' }], failWith: new Error('socket hang up') }); // an ordinary error is retried then counted, not fatal
  const r = await run(flaky);
  assert.equal(r.errors, 2); assert.equal(r.replyCount, 0);
});
await t('out of time: stops starting new look-ups and reports the rest as waiting', async () => {
  const w = world({ sent: Array.from({ length: 4 }, (_, i) => ({ to: `p${i}@x.com` })), listFor: () => [] });
  const r = await run(w, { deadline: Date.now() - 1 });
  assert.equal(r.checked, 0); assert.equal(r.waiting, 4); assert.ok(w.calls.list <= 1); // no per-email search; only the (optional) bounce scan may touch Gmail
  assert.ok(!w.writes.length);
});
await t('bounce notices still suppress addresses that do not exist', async () => {
  const w = world({ sent: [{ to: 'ghost@nowhere.com' }], listFor: () => [], bounceText: 'Address not found: ghost@nowhere.com does not exist' });
  const r = await run(w);
  assert.deepEqual(r.bounced, ['ghost@nowhere.com']); assert.equal(w.track.suppressed[0].reason, 'bounced');
});

console.log(`\n${n} reply-watch tests ok`);
