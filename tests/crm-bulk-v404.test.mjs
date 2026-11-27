// v404: bulk stage and tag changes on the CRM list, and saved views (lib/crm-bulk.js). Pure. Run: node --test tests/crm-bulk-v404.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectedEmails, planBulkStage, planBulkTags, validateView, addView, removeView, parseViews, BULK_MAX, VIEW_MAX } from '../lib/crm-bulk.js';
import { DEFAULT_PIPELINE_ID } from '../lib/pipelines.js';

const custom = [{ id: 'pabcdefg1', name: 'Partners', isDefault: false, stages: [{ id: 'pabcdefg1_intro001', name: 'Intro', outcome: null }, { id: 'pabcdefg1_signed1', name: 'Signed', outcome: 'won' }] }];

test('selectedEmails: lowercases, trims, drops non-emails and duplicates', () => {
  assert.deepEqual(selectedEmails([' A@x.com ', 'a@x.com', 'nope', '', 'b@y.org']), ['a@x.com', 'b@y.org']);
  assert.deepEqual(selectedEmails(null), []);
});

test('planBulkStage: moves deals in the default pipeline to an open stage', () => {
  const r = planBulkStage({ emails: ['a@x.com', 'b@x.com'], stage: 'demo', dealPipelines: {}, dealStages: { 'a@x.com': 'new' }, pipelines: [] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.changes, [{ email: 'a@x.com', stage: 'demo' }, { email: 'b@x.com', stage: 'demo' }]);
  assert.equal(r.unchanged, 0);
});

test('planBulkStage: a deal already in the stage is left out and counted', () => {
  const r = planBulkStage({ emails: ['a@x.com', 'b@x.com'], stage: 'demo', dealStages: { 'a@x.com': 'demo' }, pipelines: [] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.changes.map((c) => c.email), ['b@x.com']);
  assert.equal(r.unchanged, 1);
});

test('planBulkStage: won and lost are refused, one at a time', () => {
  for (const stage of ['closed_won', 'closed_lost']) {
    const r = planBulkStage({ emails: ['a@x.com'], stage, pipelines: [] });
    assert.equal(r.ok, false);
    assert.match(r.error, /one at a time/);
    assert.deepEqual(r.changes, []);
  }
});

test('planBulkStage: a custom won stage is refused too', () => {
  const r = planBulkStage({ emails: ['a@x.com'], stage: 'pabcdefg1_signed1', dealPipelines: { 'a@x.com': 'pabcdefg1' }, pipelines: custom });
  assert.equal(r.ok, false);
});

test('planBulkStage: refuses a mix of pipelines and a stage that does not exist', () => {
  const mixed = planBulkStage({ emails: ['a@x.com', 'b@x.com'], stage: 'pabcdefg1_intro001', dealPipelines: { 'a@x.com': 'pabcdefg1' }, pipelines: custom });
  assert.equal(mixed.ok, false);
  assert.match(mixed.error, /another pipeline/);
  const gone = planBulkStage({ emails: ['a@x.com'], stage: 'pzzzzzzz9_intro001', dealPipelines: { 'a@x.com': 'pzzzzzzz9' }, pipelines: custom });
  assert.equal(gone.ok, false);
});

test('planBulkStage: a custom open stage works when every deal is in that pipeline', () => {
  const r = planBulkStage({ emails: ['a@x.com', 'b@x.com'], stage: 'pabcdefg1_intro001', dealPipelines: { 'a@x.com': 'pabcdefg1', 'b@x.com': 'pabcdefg1' }, pipelines: custom });
  assert.equal(r.ok, true);
  assert.equal(r.changes.length, 2);
});

test('planBulkStage: nothing selected, too many, or an unknown stage', () => {
  assert.equal(planBulkStage({ emails: [], stage: 'demo' }).ok, false);
  assert.equal(planBulkStage({ emails: ['a@x.com'], stage: 'not a stage' }).ok, false);
  const many = Array.from({ length: BULK_MAX + 1 }, (_, i) => `u${i}@x.com`);
  assert.match(planBulkStage({ emails: many, stage: 'demo' }).error, /limited to/);
});

test('planBulkTags: adds tags and keeps the ones already there', () => {
  const r = planBulkTags({ emails: ['a@x.com'], add: ['VIP', 'vip'], currentTags: { 'a@x.com': ['warm'] } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.changes, [{ email: 'a@x.com', tags: ['warm', 'vip'] }]);
});

test('planBulkTags: removes tags', () => {
  const r = planBulkTags({ emails: ['a@x.com'], remove: ['warm'], currentTags: { 'a@x.com': ['warm', 'vip'] } });
  assert.deepEqual(r.changes, [{ email: 'a@x.com', tags: ['vip'] }]);
});

test('planBulkTags: no change is counted, not written', () => {
  const r = planBulkTags({ emails: ['a@x.com', 'b@x.com'], add: ['vip'], currentTags: { 'a@x.com': ['vip'] } });
  assert.equal(r.unchanged, 1);
  assert.deepEqual(r.changes.map((c) => c.email), ['b@x.com']);
});

test('planBulkTags: a contact that would go over the tag limit is left out and counted', () => {
  const full = Array.from({ length: 20 }, (_, i) => `t${i}`);
  const r = planBulkTags({ emails: ['a@x.com', 'b@x.com'], add: ['extra'], currentTags: { 'a@x.com': full } });
  assert.equal(r.capped, 1);
  assert.deepEqual(r.changes.map((c) => c.email), ['b@x.com']);
});

test('planBulkTags: needs a tag to add or remove', () => {
  assert.equal(planBulkTags({ emails: ['a@x.com'], add: ['  '] }).ok, false);
});

test('validateView: name required, limited, filter defaulted', () => {
  assert.equal(validateView({ name: '   ' }).ok, false);
  assert.equal(validateView({ name: 'x'.repeat(41) }).ok, false);
  const v = validateView({ name: '  Hot   leads ', search: '  acme ', filter: 'bogus' });
  assert.deepEqual(v.view, { name: 'Hot leads', search: 'acme', filter: 'all' });
  assert.equal(validateView({ name: 'Replied', filter: 'replied' }).view.filter, 'replied');
});

test('addView: unique names, and a limit', () => {
  const a = addView([], { name: 'Hot', filter: 'hot' });
  assert.equal(a.ok, true);
  assert.equal(addView(a.list, { name: 'hot' }).ok, false);
  let list = [];
  for (let i = 0; i < VIEW_MAX; i++) list = addView(list, { name: `v${i}` }).list;
  const over = addView(list, { name: 'one more' });
  assert.equal(over.ok, false);
  assert.match(over.error, /keep/);
});

test('removeView and parseViews: remove by name, drop bad stored entries', () => {
  const list = [{ name: 'Hot', search: '', filter: 'hot' }, { name: '', filter: 'hot' }, 'junk', { name: 'Replied', filter: 'replied' }];
  assert.deepEqual(parseViews(list).map((v) => v.name), ['Hot', 'Replied']);
  assert.deepEqual(removeView(list, 'hot').map((v) => v.name), ['Replied']);
  assert.deepEqual(parseViews('not a list'), []);
});

test('the default pipeline id is the one the bulk plan uses for untagged deals', () => {
  assert.equal(DEFAULT_PIPELINE_ID, 'default');
});

// Wiring: the list passes the bulk handler down, and the page writes through the same rules as a single change (string checks,
// the React components are not run here).
import { readFileSync } from 'node:fs';
test('wiring: the CRM list uses the bulk plans and the page applies them', () => {
  const crm = readFileSync(new URL('../app/components/CRM.js', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../app/crm/page.js', import.meta.url), 'utf8');
  assert.match(crm, /from "\.\.\/\.\.\/lib\/crm-bulk\.js"/);
  assert.match(crm, /planBulkStage\(/);
  assert.match(crm, /planBulkTags\(/);
  assert.match(crm, /onBulkChanges\?\.\(plan\.changes, "stage"\)/);
  assert.match(page, /onBulkChanges=\{handleBulkChanges\}/);
  assert.match(page, /writeDeal\(c\.email, \{ stage: c\.stage \}\)/);
  assert.match(page, /writeDeal\(c\.email, \{ tags: c\.tags \}\)/);
});
