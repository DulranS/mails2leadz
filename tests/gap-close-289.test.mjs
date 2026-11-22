// Pass 289: business audit log (spec 10.4). Who emailed an invoice or quote, changed the team or replaced the enquiry key, and when.
// Entries hold no secrets, no customer addresses and no message text. Only the owner reads the log.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { contactPurposeFor } from '../lib/consent-rules.js';
import { auditEntry, auditView, canReadAudit, AUDIT_ACTIONS, AUDIT_MAX_ENTRIES } from '../lib/audit-rules.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('only known actions are recorded; an unknown action or a missing actor is refused', () => {
  assert.equal(auditEntry({ action: 'made.up', actorUid: 'u1' }), null);
  assert.equal(auditEntry({ action: 'invoice.sent' }), null, 'no one named');
  assert.equal(auditEntry({ action: 'invoice.sent', actorUid: '   ' }), null);
  assert.equal(auditEntry({ action: '__proto__', actorUid: 'u1' }), null);
});

t('an entry keeps only its own fields, so customer addresses and message text never reach the log', () => {
  const e = auditEntry({
    action: 'invoice.sent', actorUid: 'u1', actorEmail: 'owner@x.com', entityId: 'inv_123',
    summary: 'Emailed', customerEmail: 'buyer@private.com', message: 'hello there', amount: 99,
  });
  assert.deepEqual(Object.keys(e).sort(), ['action', 'actorEmail', 'actorUid', 'at', 'entityId', 'summary']);
  assert.ok(!JSON.stringify(e).includes('buyer@private.com'));
});

t('text is flattened and capped, and a time is always set', () => {
  const e = auditEntry({ action: 'team.removed', actorUid: 'u1', summary: 'a\nb\tc' + 'x'.repeat(300), entityId: 'e'.repeat(200) });
  assert.equal(e.summary.length, 200);
  assert.ok(!/[\r\n\t]/.test(e.summary));
  assert.equal(e.entityId.length, 80);
  assert.ok(!Number.isNaN(Date.parse(e.at)));
});

t('the view is newest first, drops unknown rows, caps at 200 and shows a label for each action', () => {
  const rows = [
    { action: 'invoice.sent', actorUid: 'a', at: '2026-11-10T00:00:00.000Z' },
    { action: 'quote.sent', actorUid: 'b', actorEmail: 'bob@x.com', at: '2026-11-14T00:00:00.000Z' },
    { action: 'bogus', actorUid: 'c', at: '2026-11-15T00:00:00.000Z' },
  ];
  const v = auditView(rows);
  assert.equal(v.length, 2);
  assert.equal(v[0].label, AUDIT_ACTIONS['quote.sent']);
  assert.equal(v[0].who, 'bob@x.com', 'email shown when there is one');
  assert.equal(v[1].who, 'a', 'the user id shown when there is no email');
  const many = Array.from({ length: AUDIT_MAX_ENTRIES + 50 }, (_, i) => ({ action: 'invoice.sent', actorUid: 'u', at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString() }));
  assert.equal(auditView(many).length, AUDIT_MAX_ENTRIES);
  assert.equal(auditView(undefined).length, 0);
});

t('only the owner of the workspace can read the log; a team member acting in it cannot', () => {
  assert.equal(canReadAudit({ uid: 'owner1', tenantUid: 'owner1' }), true);
  assert.equal(canReadAudit({ uid: 'staff9', tenantUid: 'owner1' }), false);
  assert.equal(canReadAudit({ uid: '', tenantUid: '' }), false);
  assert.equal(canReadAudit(null), false);
});

t('the money and access actions are all wired to the log', () => {
  const hook = (f, needles) => { const s = fs.readFileSync(f, 'utf8'); for (const x of needles) assert.ok(s.includes(x), `${f} missing ${x}`); };
  hook('app/api/invoices/send/route.js', ["recordAudit(db, uid, { action: 'invoice.sent'"]);
  hook('app/api/quotes/send/route.js', ["'quote.followup_sent' : 'quote.sent'"]);
  hook('app/api/team/route.js', ["'team.invited'", "'team.invite_revoked'", "'team.removed'", "'team.role_changed'"]);
  hook('app/api/inbound-key/route.js', ["'enquiry_key.rotated'", "'enquiry_key.revoked'"]);
});

t('no audit call writes the enquiry key itself', () => {
  const s = fs.readFileSync('app/api/inbound-key/route.js', 'utf8');
  for (const line of s.split('\n').filter((l) => l.includes('recordAudit('))) assert.ok(!/\bkey\b\s*[,}]/.test(line.replace(/\{ key, last4/, '')), line);
});

t('the writer never blocks the action it records, and writes only to the owner workspace', () => {
  const s = fs.readFileSync('lib/server/audit.js', 'utf8');
  assert.ok(s.includes("collection(db, 'users', String(uid), 'audit')"));
  assert.ok(s.includes('try {') && s.includes('catch (e)'));
});

t('the read route is signed-in, owner-only, newest first, and never edits the log', () => {
  const s = fs.readFileSync('app/api/audit/route.js', 'utf8');
  assert.ok(s.includes('identify(request, null)'));
  assert.ok(s.includes('canReadAudit(actorFromRequest(request))'));
  assert.ok(s.includes("orderBy('at', 'desc')"));
  assert.ok(!/setDoc|updateDoc|deleteDoc|addDoc/.test(s));
});

t('the page is in the menu and in the shell routes, and it reads through the owner-only route', () => {
  const routes = fs.readFileSync('lib/app-routes.js', 'utf8');
  assert.ok(routes.includes("href: '/audit'"));
  assert.ok(routes.includes("'/account', '/audit'"));
  const page = fs.readFileSync('app/audit/page.js', 'utf8');
  assert.ok(page.includes('fetch("/api/audit")'));
  assert.ok(!/dangerouslySetInnerHTML/.test(page));
});

t('every enquiry records its purpose next to its basis (spec 9.3)', () => {
  assert.equal(contactPurposeFor({ email: 'a@gmail.com' }), 'enquiry_reply', 'personal address without consent: enquiry only');
  assert.equal(contactPurposeFor({ email: 'ops@acme.co' }), 'enquiry_and_marketing', 'business address: marketing allowed under the B2B basis');
  assert.equal(contactPurposeFor({ email: 'a@gmail.com', marketingConsent: true, consentSource: 'form' }), 'enquiry_and_marketing');
  const src = fs.readFileSync('app/api/inbound/route.js', 'utf8');
  assert.ok(src.includes('write.contactPurpose = contactPurposeFor({ email: e.email, country: e.country })')); // the chosen country is passed (opt-in-country test)
});

console.log(`\n${n} passed`);
