import assert from 'node:assert/strict';
import { fillTemplate, resolveSenderName } from '../lib/server/template-vars.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const vars = { firstName: 'Ana', lastName: 'Perera', businessName: 'Acme Ltd', senderName: 'Sam' };
t('the default starter template is fully filled (no placeholder leaks)', () => {
  const out = fillTemplate("Hi {{business_name}},\n\nI'm {{sender_name}}. Help {{business_name}}?\n\nBest,\n{{sender_name}}", vars);
  assert.equal(out, "Hi Acme Ltd,\n\nI'm Sam. Help Acme Ltd?\n\nBest,\nSam");
  assert.ok(!out.includes('{{'));
});
t('every occurrence is replaced, whatever the spacing or case', () => {
  assert.equal(fillTemplate('{{ First Name }} / {{first_name}} / {{firstName}}', vars), 'Ana / Ana / Ana');
  assert.equal(fillTemplate('{{Sender_Name}} {{ sender name }}', vars), 'Sam Sam');
  assert.equal(fillTemplate('{{company}} {{Business}} {{business name}}', vars), 'Acme Ltd Acme Ltd Acme Ltd');
});
t('unknown placeholders are left alone; empty text is safe', () => {
  assert.equal(fillTemplate('Hi {{pet_name}}', vars), 'Hi {{pet_name}}');
  assert.equal(fillTemplate('', vars), '');
  assert.equal(fillTemplate(null, vars), '');
});
t('missing values become empty, never "undefined"', () => {
  assert.equal(fillTemplate('Hi {{first_name}}!', {}), 'Hi !');
});
t('sender name: dashboard sentinel uses the typed name, a mapped column uses the row value', () => {
  assert.equal(resolveSenderName({ mappedTo: 'sender_name', rowValues: {}, typedName: 'Sam' }), 'Sam');
  assert.equal(resolveSenderName({ mappedTo: 'owner', rowValues: { owner: 'Lee' }, typedName: 'Sam' }), 'Lee');
  assert.equal(resolveSenderName({ mappedTo: 'owner', rowValues: { owner: '' }, typedName: 'Sam' }), 'Sam');
  assert.equal(resolveSenderName({ mappedTo: '', rowValues: {}, typedName: '' }), '');
});
console.log(`\n${n} passed`);
