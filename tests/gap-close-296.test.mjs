// Pass 296: owners can tag deals and customers from the CRM panel (spec 2.4). Deal tags feed the same segment filter as lead tags.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applySegment } from '../lib/segments.js';
import { sanitizeTags } from '../lib/contact-tags.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the tag box cleans what it saves and never writes HTML', () => {
  const src = fs.readFileSync('app/components/TagBox.js', 'utf8');
  assert.ok(src.includes('sanitizeTags(text)'));
  assert.ok(src.includes('onBlur={save}'));
  assert.ok(!/innerHTML|dangerouslySetInnerHTML/.test(src));
});

t('the CRM page saves deal tags through the deal write, and reads them back onto each lead', () => {
  const src = fs.readFileSync('app/crm/page.js', 'utf8');
  assert.ok(src.includes('if (Array.isArray(changes.tags)) write.tags = changes.tags;'));
  assert.ok(src.includes('await writeDeal(e, { tags });'));
  assert.ok(src.includes('if (Array.isArray(deal.tags)) dealTags[email] = deal.tags;'));
  assert.ok(src.includes('tags: dealTags[lead.email] || [],'));
  assert.ok(src.includes('onSaveTags={handleSaveTags}'));
});

t('the CRM detail panel shows the tag box when a save handler is given', () => {
  const src = fs.readFileSync('app/components/CRM.js', 'utf8');
  assert.ok(src.includes('import TagBox'));
  assert.ok(src.includes('{onSaveTags ? <TagBox value={selectedLead.tags || []}'));
});

t('a tagged deal is picked up by the segment filter, the same as a tagged lead', () => {
  const contacts = [
    { email: 'deal@acme.co', tags: sanitizeTags('VIP') },
    { email: 'other@acme.co', tags: sanitizeTags('spring') },
  ];
  assert.deepEqual(applySegment(contacts, { tags: ['vip'] }, Date.now()).map((c) => c.email), ['deal@acme.co']);
});

console.log(`\n${n} passed`);
