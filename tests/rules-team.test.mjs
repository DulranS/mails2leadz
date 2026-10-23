// The database rules are published by hand and cannot be run here, so these checks guard their SHAPE: the owner's access is untouched,
// team members get only what the role allows, and the server-only records stay unreachable from a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const old = fs.readFileSync(new URL('../firestore.rules.v31-owner-only', import.meta.url), 'utf8');
const code = (s) => s.replace(/\/\/.*$/gm, '');

test('rules are balanced and still start with the version line', () => {
  const r = code(rules);
  for (const [a, b] of [['{', '}'], ['(', ')'], ['[', ']']]) assert.equal(r.split(a).length, r.split(b).length, `${a}${b} balanced`);
  assert.ok(rules.startsWith("rules_version = '2';"));
});

test('the owner path is unchanged and comes first on every collection rule', () => {
  const r = code(rules);
  assert.ok(r.includes('allow read, write: if signedIn() && uid() == userId;'));
  for (const fn of ['ownsExisting(docId) || membersRead(docId)', 'ownsExisting(docId) || membersWrite(docId)', 'ownsNew(docId) || membersCreate(docId)', '(ownsExisting(docId) && ownsNew(docId)) || membersUpdate(docId)']) {
    assert.ok(r.includes(fn), fn);
  }
  // the original owner helpers are byte-for-byte the same as before team logins
  for (const name of ['ownsExisting', 'ownsNew']) {
    const grab = (s) => code(s).match(new RegExp(`function ${name}\\(docId\\) \\{[\\s\\S]*?\\n    \\}`))[0];
    assert.equal(grab(rules), grab(old));
  }
});

test('members never reach the roster, the keys, their pointer, or server-only records', () => {
  const r = code(rules);
  assert.ok(r.includes("!(coll in ['settings', 'team_access'])"));
  assert.ok(r.includes("!(docName in ['ingest_key', 'inbound_key', 'workspace'])"));
  for (const serverOnly of ['tenants', 'team_invites', 'system_mail_log', 'admin_audit', 'gmail_offline']) {
    assert.ok(!r.includes(`'${serverOnly}'`), `${serverOnly} must not be listed for any browser access`);
  }
  // a viewer can read but not write: write rules go through teamWrites (manager only)
  assert.ok(/function teamWrites\(ownerId\)[\s\S]*== 'manager'/.test(r));
  for (const line of r.split('\n').filter((l) => /allow (write|create|delete|update)/.test(l))) {
    if (/members|team/.test(line)) assert.ok(/membersWrite|membersCreate|membersUpdate|teamWrites/.test(line), line.trim());
  }
});

test('a member may change a document but not hand it to someone else', () => {
  const r = code(rules);
  const upd = r.match(/function membersUpdate\(docId\) \{[\s\S]*?\n    \}/)[0];
  assert.ok(upd.includes("request.resource.data.get('userId', '') == resource.data.get('userId', '')"));
  assert.ok(upd.includes("request.resource.data.get('createdBy', '') == resource.data.get('createdBy', '')"));
});
