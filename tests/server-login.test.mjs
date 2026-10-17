import assert from 'node:assert/strict';
import fs from 'node:fs';
import { serverLoginConfig } from '../lib/server-login.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

t('server login is on only with a real email AND a password of 6+ characters', () => {
  assert.deepEqual(serverLoginConfig({ FIREBASE_SERVER_EMAIL: ' server@example.com ', FIREBASE_SERVER_PASSWORD: 'abcdef' }), { email: 'server@example.com', password: 'abcdef' });
  for (const env of [{}, { FIREBASE_SERVER_EMAIL: 'server@example.com' }, { FIREBASE_SERVER_PASSWORD: 'abcdef' }, { FIREBASE_SERVER_EMAIL: 'not-an-email', FIREBASE_SERVER_PASSWORD: 'abcdef' }, { FIREBASE_SERVER_EMAIL: 'a@b.co', FIREBASE_SERVER_PASSWORD: '12345' }]) assert.equal(serverLoginConfig(env), null);
});
t('the password is never trimmed or changed (spaces can be part of it)', () => {
  assert.equal(serverLoginConfig({ FIREBASE_SERVER_EMAIL: 'a@b.co', FIREBASE_SERVER_PASSWORD: ' pass word ' }).password, ' pass word ');
});
t('rules: the server identity is one UID, ships as a placeholder that matches nobody, and grants nothing else', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /function isServer\(\) \{ return request\.auth != null && request\.auth\.uid == 'PASTE_SERVER_USER_UID_HERE'; \}/);
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if isServer\(\);\s*\}/);
  assert.equal((rules.match(/isServer\(\)/g) || []).length, 2); // the definition and the one allow rule
});
t('the service account still wins when both are configured, and nothing changes when neither is', () => {
  const src = read('lib/server-firestore.js');
  assert.match(src, /const LOGIN = adminDb \? null : serverLoginConfig\(\);/);
  assert.match(src, /adminDb \? A\[name\] : LOGIN && LOGIN_OPS\[name\] \? LOGIN_OPS\[name\] : clientFs\[name\]/);
});
t('the env template and the guide document it', () => {
  assert.match(read('.env.example'), /FIREBASE_SERVER_EMAIL=/);
  assert.match(read('.env.example'), /FIREBASE_SERVER_PASSWORD=/);
  assert.match(read('DEPLOYMENT_GUIDE.md'), /## Server login/);
});
console.log(`server-login: ${n} passed`);
