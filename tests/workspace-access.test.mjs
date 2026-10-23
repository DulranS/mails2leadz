import test from 'node:test';
import assert from 'node:assert/strict';
import { routeAccess, seatLimit, seatsLeft, checkInvite, inviteExpiry, rosterView, looksLikeEmail, isRole, INVITE_TTL_DAYS, DEFAULT_MAX_SEATS } from '../lib/workspace-access.js';
import { lifecycleDue } from '../lib/lifecycle.js';
import { teamInviteEmail, trialEndingEmail, trialEndedEmail, paymentFailedEmail } from '../lib/system-emails.js';
import { sendSystemMail, mailProvider } from '../lib/server/system-mail.js';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const DAY = 864e5;

test('roles: owner everything, manager daily work only, viewer read only, unknown treated as least', () => {
  assert.ok(routeAccess('owner', 'POST', '/api/saas/checkout').ok);
  assert.ok(routeAccess('manager', 'POST', '/api/send-email').ok);
  assert.equal(routeAccess('manager', 'POST', '/api/stripe/portal').code, 'OWNER_ONLY');
  assert.equal(routeAccess('manager', 'GET', '/api/tenant').code, 'OWNER_ONLY');
  assert.equal(routeAccess('manager', 'POST', '/api/gmail-offline').code, 'OWNER_ONLY');
  assert.ok(routeAccess('viewer', 'GET', '/api/deals').ok);
  assert.equal(routeAccess('viewer', 'POST', '/api/send-email').code, 'VIEW_ONLY');
  assert.equal(routeAccess('viewer', 'DELETE', '/api/deals').code, 'VIEW_ONLY');
  assert.equal(routeAccess('mystery', 'POST', '/api/send-email').code, 'VIEW_ONLY');
  assert.ok(routeAccess('viewer', 'POST', '/api/team').ok); // the route decides (accept / leave)
  assert.ok(isRole('manager') && !isRole('admin'));
  assert.equal(routeAccess('manager', 'POST', '/api/saasy').ok, true); // prefix match is on whole path segments
});

test('seats: plan number wins, otherwise the deployment default or env; invites reserve seats', () => {
  assert.equal(seatLimit(2), 2);
  assert.equal(seatLimit(0), 0);
  assert.equal(seatLimit(null, {}), DEFAULT_MAX_SEATS);
  assert.equal(seatLimit(null, { TEAM_MAX_SEATS: '4' }), 4);
  assert.equal(seatLimit(undefined, { TEAM_MAX_SEATS: 'x' }), DEFAULT_MAX_SEATS);
  assert.equal(seatsLeft({ members: 1, pendingInvites: 1, limit: 3 }), 1);
  assert.equal(seatsLeft({ members: 3, pendingInvites: 2, limit: 3 }), 0);
});

test('an invite is only usable once, before it expires, by the right email', () => {
  const inv = { role: 'manager', email: 'a@x.com', expiresAt: inviteExpiry(NOW), usedAt: null, revokedAt: null };
  assert.ok(checkInvite(inv, { email: 'A@x.com', now: NOW }).ok);
  assert.equal(checkInvite(null).code, 'INVITE_INVALID');
  assert.equal(checkInvite({ ...inv, usedAt: 'x' }, { email: 'a@x.com', now: NOW }).code, 'INVITE_USED');
  assert.equal(checkInvite({ ...inv, revokedAt: 'x' }, { email: 'a@x.com', now: NOW }).code, 'INVITE_REVOKED');
  assert.equal(checkInvite(inv, { email: 'a@x.com', now: NOW + (INVITE_TTL_DAYS + 1) * DAY }).code, 'INVITE_EXPIRED');
  assert.equal(checkInvite(inv, { email: 'other@x.com', now: NOW }).code, 'INVITE_OTHER_EMAIL');
  assert.ok(checkInvite({ ...inv, email: '' }, { email: 'anyone@x.com', now: NOW }).ok); // link-only invite
  assert.equal(checkInvite({ ...inv, role: 'owner' }, { email: 'a@x.com', now: NOW }).code, 'INVITE_INVALID'); // nobody can be invited as owner
  assert.equal(checkInvite({ ...inv, expiresAt: 'garbage' }, { email: 'a@x.com', now: NOW }).code, 'INVITE_EXPIRED');
});

test('the roster hides used, revoked and expired invites and carries no secrets', () => {
  const r = rosterView({ members: [{ uid: 'u1', email: 'a@x.com', role: 'viewer', addedAt: '2026-10-01' }, { uid: 'u2', role: 'weird' }], invites: [
    { id: 'i1', email: 'b@x.com', role: 'manager', expiresAt: inviteExpiry(NOW) },
    { id: 'i2', usedAt: 'x', role: 'manager', expiresAt: inviteExpiry(NOW) },
    { id: 'i3', role: 'manager', expiresAt: new Date(NOW - DAY).toISOString() },
  ] }, NOW);
  assert.deepEqual(r.invites.map((i) => i.id), ['i1']);
  assert.equal(r.members.find((m) => m.uid === 'u2').role, 'viewer');
  assert.ok(!JSON.stringify(r).includes('token'));
  assert.ok(looksLikeEmail('a@b.co') && !looksLikeEmail('nope') && !looksLikeEmail('a b@c.de'));
});

test('lifecycle: each notice is due once, only for the right accounts', () => {
  const base = { email: 'o@x.com', status: 'trialing', trialEndsAt: new Date(NOW + 2 * DAY).toISOString() };
  assert.deepEqual(lifecycleDue(base, NOW).map((d) => d.kind), ['trial_ending']);
  assert.equal(lifecycleDue(base, NOW)[0].daysLeft, 2);
  assert.deepEqual(lifecycleDue({ ...base, notices: { trialEnding: 'x' } }, NOW), []);
  assert.deepEqual(lifecycleDue({ ...base, trialEndsAt: new Date(NOW + 10 * DAY).toISOString() }, NOW), []);
  assert.deepEqual(lifecycleDue({ ...base, trialEndsAt: new Date(NOW - DAY).toISOString() }, NOW).map((d) => d.kind), ['trial_ended']);
  assert.deepEqual(lifecycleDue({ ...base, trialEndsAt: new Date(NOW - DAY).toISOString(), notices: { trialEnded: 'x' } }, NOW), []);
  const pd = { email: 'o@x.com', status: 'past_due', pastDueSince: '2026-10-18' };
  assert.deepEqual(lifecycleDue(pd, NOW).map((d) => d.kind), ['payment_failed']);
  assert.deepEqual(lifecycleDue({ ...pd, notices: { paymentFailedFor: '2026-10-18' } }, NOW), []);
  assert.equal(lifecycleDue({ ...pd, notices: { paymentFailedFor: '2026-09-01' } }, NOW).length, 1); // a new episode
  assert.deepEqual(lifecycleDue({ ...base, plan: 'internal' }, NOW), []);
  assert.deepEqual(lifecycleDue({ ...base, suspended: true }, NOW), []);
  assert.deepEqual(lifecycleDue({ ...base, email: '' }, NOW), []);
  assert.deepEqual(lifecycleDue({ status: 'active', email: 'o@x.com' }, NOW), []);
});

test('system emails are short, plain and carry their one action', () => {
  const inv = teamInviteEmail({ ownerName: 'Dulran', role: 'viewer', link: 'https://app.test/join?token=abc', expiresAt: '2026-10-27T00:00:00Z', brandName: 'AutoLeads' });
  assert.match(inv.subject, /Dulran invited you/);
  assert.match(inv.text, /viewer/);
  assert.match(inv.text, /https:\/\/app\.test\/join\?token=abc/);
  assert.match(inv.text, /2026-10-27/);
  assert.match(teamInviteEmail({}).subject, /Someone invited you/);
  assert.match(trialEndingEmail({ daysLeft: 1 }).subject, /tomorrow/);
  assert.match(trialEndingEmail({ daysLeft: 3, url: 'https://a/account' }).text, /3 days/);
  assert.match(trialEndedEmail({}).text, /still there/);
  assert.match(paymentFailedEmail({ url: 'https://a/account' }).text, /https:\/\/a\/account/);
  for (const m of [inv, trialEndingEmail({}), trialEndedEmail({}), paymentFailedEmail({})]) assert.ok(!/[\u2014\u2013\u2022]/.test(m.subject + m.text), 'no special dash or bullet characters');
});

test('system mail: no provider means nothing is sent and nothing breaks; failures are reported, never thrown', async () => {
  assert.equal(mailProvider({}), 'none');
  assert.equal(mailProvider({ RESEND_API_KEY: 'k' }), 'none'); // a key without a from-address is not enough
  assert.equal(mailProvider({ RESEND_API_KEY: 'k', SYSTEM_MAIL_FROM: 'a@b.co' }), 'resend');
  assert.equal(mailProvider({ SYSTEM_MAIL_WEBHOOK_URL: 'https://h' }), 'webhook');
  assert.deepEqual(await sendSystemMail({ to: 'a@b.co', subject: 's', text: 't' }, {}), { sent: false, status: 'not_configured' });
  assert.equal((await sendSystemMail({ to: '', subject: 's', text: 't' }, { SYSTEM_MAIL_WEBHOOK_URL: 'https://h' })).status, 'failed');
  const real = globalThis.fetch; const seen = [];
  globalThis.fetch = async (url, init) => { seen.push({ url, body: JSON.parse(init.body) }); return { ok: true }; };
  try {
    assert.equal((await sendSystemMail({ to: 'a@b.co', subject: 'S', text: 'T' }, { SYSTEM_MAIL_WEBHOOK_URL: 'https://hook.test/x', SYSTEM_MAIL_FROM: 'f@b.co' })).sent, true);
    assert.deepEqual(seen[0].body, { to: 'a@b.co', subject: 'S', text: 'T', from: 'f@b.co' });
    assert.equal((await sendSystemMail({ to: 'a@b.co', subject: 'S', text: 'T' }, { RESEND_API_KEY: 'k', SYSTEM_MAIL_FROM: 'f@b.co' })).sent, true);
    assert.equal(seen[1].url, 'https://api.resend.com/emails');
    assert.deepEqual(seen[1].body.to, ['a@b.co']);
    globalThis.fetch = async () => ({ ok: false, status: 422 });
    assert.deepEqual(await sendSystemMail({ to: 'a@b.co', subject: 'S', text: 'T' }, { SYSTEM_MAIL_WEBHOOK_URL: 'https://h' }), { sent: false, status: 'failed', error: 'webhook said 422' });
    globalThis.fetch = async () => { throw new Error('boom'); };
    assert.equal((await sendSystemMail({ to: 'a@b.co', subject: 'S', text: 'T' }, { SYSTEM_MAIL_WEBHOOK_URL: 'https://h' })).status, 'failed');
  } finally { globalThis.fetch = real; }
});
