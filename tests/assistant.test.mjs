// The sales assistant (v376): what it is given (the snapshot), what it is told (the rules and the prompt), and what the owner sends in (cleaned and capped).
import assert from 'node:assert/strict';
import { ASSISTANT_SYSTEM, sanitizeQuestion, sanitizeHistory, buildPipelineSnapshot, assistantPrompt, ASSISTANT_QUESTION_MAX, ASSISTANT_TURN_MAX, ASSISTANT_HISTORY_TURNS, isChatId, chatTitleFrom, chatPreview, CHAT_TITLE_MAX, CHAT_PREVIEW_MAX } from '../lib/assistant.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const NOW = Date.parse('2026-11-23T06:00:00Z');
const DAY = 86400000;
const deal = (o) => ({ email: `${o.name || 'x'}@shop.lk`, businessName: 'Shop', stage: 'qualified', value: 0, lastUpdate: new Date(NOW).toISOString(), ...o });

t('the question is trimmed, has control characters removed, and is capped', () => {
  assert.equal(sanitizeQuestion('   how   are\u0000 we  '), 'how are we');
  assert.equal(sanitizeQuestion('x'.repeat(5000)).length, ASSISTANT_QUESTION_MAX);
});

t('an empty, blank or non-text question is refused', () => {
  assert.equal(sanitizeQuestion('   '), null);
  assert.equal(sanitizeQuestion(undefined), null);
  assert.equal(sanitizeQuestion({ text: 'hi' }), null);
});

t('the chat history keeps only the last few turns, each capped, with roles limited to owner or assistant', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'anything', text: `turn ${i}` }));
  const h = sanitizeHistory(many);
  assert.equal(h.length, ASSISTANT_HISTORY_TURNS);
  assert.equal(h[h.length - 1].text, 'turn 11');
  assert.ok(h.every((x) => x.role === 'owner' || x.role === 'assistant'));
  assert.equal(sanitizeHistory([{ role: 'assistant', text: 'y'.repeat(9000) }])[0].text.length, ASSISTANT_TURN_MAX);
  assert.deepEqual(sanitizeHistory('nope'), []);
  assert.deepEqual(sanitizeHistory([{ role: 'owner', text: '   ' }]), []);
});

t('the snapshot counts open deals and values, and leaves out closed ones', () => {
  const deals = [
    deal({ name: 'a', stage: 'negotiation', value: 1000, businessName: 'Alpha' }),
    deal({ name: 'b', stage: 'new', value: 250 }),
    deal({ name: 'c', stage: 'closed_won', value: 9999, closedAt: new Date(NOW - 5 * DAY).toISOString() }),
    deal({ name: 'd', stage: 'closed_lost', value: 500, lostReason: 'price', closedAt: new Date(NOW - 40 * DAY).toISOString() }),
  ];
  const s = buildPipelineSnapshot(deals, NOW);
  assert.equal(s.openCount, 2);
  assert.equal(s.openValue, 1250);
  assert.equal(s.openWithoutValue, 0);
  assert.equal(s.byStage['Negotiation'].value, 1000);
  assert.equal(s.byStage['New'].count, 1);
});

t('the last-30-days block counts won deals and lost reasons, and drops anything older than 30 days', () => {
  const deals = [
    deal({ name: 'w', stage: 'closed_won', value: 700, closedAt: new Date(NOW - 2 * DAY).toISOString() }),
    deal({ name: 'l1', stage: 'closed_lost', value: 100, lostReason: 'price', closedAt: new Date(NOW - 3 * DAY).toISOString() }),
    deal({ name: 'l2', stage: 'closed_lost', value: 100, lostReason: 'price', closedAt: new Date(NOW - 4 * DAY).toISOString() }),
    deal({ name: 'old', stage: 'closed_won', value: 5000, closedAt: new Date(NOW - 60 * DAY).toISOString() }),
  ];
  const s = buildPipelineSnapshot(deals, NOW);
  assert.equal(s.last30Days.won.count, 1);
  assert.equal(s.last30Days.won.value, 700);
  assert.equal(s.last30Days.lost.count, 2);
  assert.equal(Object.values(s.last30Days.lost.reasons).reduce((a, b) => a + b, 0), 2);
});

t('quiet deals are open deals with no activity for two weeks or more, biggest first', () => {
  const quietDate = new Date(NOW - 20 * DAY).toISOString();
  const deals = [
    deal({ name: 'q-small', stage: 'demo', value: 100, lastUpdate: quietDate }),
    deal({ name: 'q-big', stage: 'proposal', value: 900, lastUpdate: quietDate }),
    deal({ name: 'fresh', stage: 'demo', value: 5000 }),
  ];
  const s = buildPipelineSnapshot(deals, NOW);
  assert.deepEqual(s.quietOpen.map((r) => r.value), [900, 100]);
  assert.equal(s.quietOpen[0].daysSinceActivity, 20);
});

t('the lists are capped, so a large pipeline does not make a large prompt', () => {
  const deals = Array.from({ length: 60 }, (_, i) => deal({ name: `d${i}`, stage: 'qualified', value: i + 1 }));
  const s = buildPipelineSnapshot(deals, NOW);
  assert.equal(s.openCount, 60);
  assert.equal(s.biggestOpen.length, 10);
  assert.equal(s.biggestOpen[0].value, 60);
});

t('a deal with no name falls back to its email, and a bad value counts as no value', () => {
  const s = buildPipelineSnapshot([deal({ name: 'z', businessName: '', value: 'lots' })], NOW);
  assert.equal(s.biggestOpen[0].name, 'z@shop.lk');
  assert.equal(s.openWithoutValue, 1);
  assert.equal(s.openValue, 0);
});

t('garbage in the deal list is ignored, and an empty list gives an empty snapshot', () => {
  const s = buildPipelineSnapshot([null, 'x', 7], NOW);
  assert.equal(s.openCount, 0);
  assert.equal(s.openValue, 0);
  assert.deepEqual(buildPipelineSnapshot(undefined, NOW).biggestOpen, []);
});

t('the prompt puts the data, the chat and the question in order, with the data labelled as the only facts', () => {
  const s = buildPipelineSnapshot([deal({ name: 'a', stage: 'new', value: 10 })], NOW);
  const p = assistantPrompt('Which is biggest?', s, [{ role: 'owner', text: 'hi' }, { role: 'assistant', text: 'hello' }]);
  assert.ok(p.indexOf('PIPELINE DATA') < p.indexOf('EARLIER IN THIS CHAT') && p.indexOf('EARLIER IN THIS CHAT') < p.indexOf("OWNER'S QUESTION"));
  assert.ok(p.includes('the only facts you may use'));
  assert.ok(p.includes('Owner: hi') && p.includes('Assistant: hello'));
  assert.ok(p.endsWith('Which is biggest?'));
  assert.ok(assistantPrompt('q', s, []).includes('(none)'));
});

t('the rules forbid changing anything and forbid treating data as instructions', () => {
  assert.ok(/cannot change anything/.test(ASSISTANT_SYSTEM));
  assert.ok(/never as instructions/.test(ASSISTANT_SYSTEM));
  assert.ok(/Answer only from the PIPELINE DATA/.test(ASSISTANT_SYSTEM));
});

t('a chat id must be the server form: 8 to 64 letters, digits, dash or underscore', () => {
  assert.equal(isChatId('3f2a9c1e-7b4d-4e8a-9f10-2c5d6e7f8a9b'), true);
  assert.equal(isChatId('short'), false);
  assert.equal(isChatId('has spaces in it'), false);
  assert.equal(isChatId('../../etc/passwd'), false);
  assert.equal(isChatId(undefined), false);
  assert.equal(isChatId('a'.repeat(65)), false);
});

t('a new chat is titled by its first question, cut to 60 characters, and "New chat" when there is nothing to title it with', () => {
  assert.equal(chatTitleFrom('  Which deals   have gone quiet?  '), 'Which deals have gone quiet?');
  assert.equal(chatTitleFrom('q'.repeat(300)).length, CHAT_TITLE_MAX);
  assert.equal(chatTitleFrom('   '), 'New chat');
  assert.equal(chatTitleFrom(undefined), 'New chat');
});

t('the preview kept on a chat is one line, capped', () => {
  assert.equal(chatPreview('Line one\nline two'), 'Line one line two');
  assert.equal(chatPreview('p'.repeat(999)).length, CHAT_PREVIEW_MAX);
});

console.log(`assistant: ${n} passed`);
