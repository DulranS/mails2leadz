import test from 'node:test';
import assert from 'node:assert/strict';
import { findDecisionMakers, estimateCompanySize, cleanPersonName, sitemapLocs, isSiteSeedPath, plainTextFromHtml } from '../lib/enrich-extract.js';
import { parsePage, buildRow } from '../lib/lead-finder.js';

// The same expectations as the Python test suite (test_worker.py), so the port behaves like the original.
test('decision makers: a name next to a leadership title, in the same order of seniority', () => {
  assert.deepEqual(findDecisionMakers('Jane Doe, Founder and more')[0], { name: 'Jane Doe', title: 'Founder' });
  assert.deepEqual(findDecisionMakers('Managing Director: Ravi Perera')[0], { name: 'Ravi Perera', title: 'Managing Director' });
  assert.deepEqual(findDecisionMakers('Founded by Mary Ann Lee in 1999')[0], { name: 'Mary Ann Lee', title: 'Founder' });
  assert.equal(findDecisionMakers('John Smith CEO & Founder')[0].name, 'John Smith');
  assert.equal(findDecisionMakers('Meet Jane Doe Founder')[0].name, 'Jane Doe');
});

test('decision makers: marketing words on their own are not people', () => {
  for (const text of ['We help business owners grow. Partner with us. Our founder story. Contact Us Director of Sales team',
    'Meet The Team Our Owner', 'Read More Owner']) {
    assert.deepEqual(findDecisionMakers(text), [], text);
  }
});

test('decision makers: the most senior person comes first and the list is capped', () => {
  const text = 'Head of Sales: Amal Silva. Chief Executive: Nimal Perera. Owner: Kamal Fernando. Director: Ruwan Jayasena.';
  const found = findDecisionMakers(text);
  assert.equal(found[0].name, 'Kamal Fernando');
  assert.equal(found.length, 3);
});

test('company size: an explicit headcount beats a wording hint, and nothing said means unknown', () => {
  assert.deepEqual(estimateCompanySize('a team of 25 employees'), { size: 'small', strength: 2 });
  assert.deepEqual(estimateCompanySize('we have 120 employees'), { size: 'medium', strength: 2 });
  assert.deepEqual(estimateCompanySize('over 1,000 employees worldwide'), { size: 'large', strength: 2 });
  assert.deepEqual(estimateCompanySize('10,000 people served; global enterprise'), { size: 'unknown', strength: 0 });
  assert.deepEqual(estimateCompanySize('a family-owned boutique'), { size: 'small', strength: 1 });
});

test('cleanPersonName keeps only plausible 2 to 4 word names', () => {
  assert.equal(cleanPersonName('Mr Jane Doe'), 'Mr Jane Doe');
  assert.equal(cleanPersonName('Founder'), '');
  assert.equal(cleanPersonName('Contact Us'), '');
});

test('sitemap: the page addresses are read, with XML entities decoded', () => {
  const xml = '<urlset><url><loc>https://acme.example/about</loc></url><url><loc>https://acme.example/a?x=1&amp;y=2</loc></url></urlset>';
  assert.deepEqual(sitemapLocs(xml), ['https://acme.example/about', 'https://acme.example/a?x=1&y=2']);
});

test('sitemap: only contact, about and team pages are followed, never blog or shop pages', () => {
  assert.equal(isSiteSeedPath('/contact-us'), true);
  assert.equal(isSiteSeedPath('/about'), true);
  assert.equal(isSiteSeedPath('/meet-the-team/'), true);
  assert.equal(isSiteSeedPath('/blog/contact-tips'), false);
  assert.equal(isSiteSeedPath('/shop/teams-jerseys'), false);
  assert.equal(isSiteSeedPath('/pricing'), false);
});

test('visible text drops scripts, styles and tags', () => {
  assert.equal(plainTextFromHtml('<style>p{}</style><script>var x=1</script><p>Jane&nbsp;Doe,&amp; Founder</p>'), 'Jane Doe,& Founder');
});

test('a page with a named founder yields that person and the company size', () => {
  const page = parsePage('<html><body><h2>Meet us</h2><p>Jane Doe, Founder. A team of 12 employees.</p></body></html>',
    'https://acme.example/about', new Set(['acme.example']), 0);
  assert.equal(page.people[0].name, 'Jane Doe');
  assert.deepEqual(page.size, { size: 'small', strength: 2 });
});

test('a found name fills the decision-maker fields and the first name the outreach greets', () => {
  const row = buildRow({ business_name: 'Acme', website: 'https://acme.example' }, {
    emails: [], phones: [], whatsapp: [], socials: {}, tech: [], contactUrl: '',
    people: [{ name: 'Jane Doe', title: 'Founder' }], size: { size: 'small', strength: 2 },
  });
  assert.equal(row.decision_maker_found, 'Yes');
  assert.equal(row.decision_maker_name, 'Jane Doe');
  assert.equal(row.decision_maker_title, 'Founder');
  assert.equal(row.first_name, 'Jane');
  assert.equal(row.last_name, 'Doe');
  assert.equal(row.company_size, 'small');
});

test('without a named person the row behaves as before', () => {
  const row = buildRow({ business_name: 'Acme', website: 'https://acme.example' }, { emails: [], phones: [], whatsapp: [], socials: {}, tech: [], contactUrl: '', people: [], size: { size: 'unknown', strength: 0 } });
  assert.equal(row.decision_maker_found, 'No');
  assert.ok(!row.first_name);
  assert.equal(row.company_size, '');
});
