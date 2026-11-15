// Pass 284: /api/kpis used variables before they were declared (a ReferenceError on every call); fixed, and the
// acquisition figures take a 3, 6 or 12 month look-back. Source checks, because the route needs Firebase to run.
import assert from 'node:assert/strict';
import fs from 'node:fs';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const route = fs.readFileSync('app/api/kpis/route.js', 'utf8');
const panel = fs.readFileSync('app/components/SupportAndKpis.js', 'utf8');
const pos = (src, needle) => src.indexOf(needle);

t('the route declares funnel before the revenue figures that read it', () => {
  assert.ok(pos(route, 'const funnel = funnelRates') !== -1);
  assert.ok(pos(route, 'const funnel = funnelRates') < pos(route, 'const revenueFigures'));
});

t('the route declares the ticket rows before the support figures and the trust score read them', () => {
  assert.ok(pos(route, 'const ticketRows') < pos(route, 'const supportFigures'));
  assert.ok(pos(route, 'const ticketRows') < pos(route, 'const trust'));
});

t('no leftover names from the old fixed 12-month window', () => {
  for (const old of ['YEAR', 'inYear', 'spend12', 'leads12', 'won12', 'qualified12', 'paidLast12', 'payers12']) {
    assert.ok(!new RegExp(`\\b${old}\\b`).test(route), `still uses ${old}`);
  }
});

t('the window is 3, 6 or 12 months, defaulting to 12, and the answer says which', () => {
  assert.ok(route.includes('[3, 6, 12].includes(asked) ? asked : 12'));
  assert.ok(/NextResponse\.json\(\{ months,/.test(route));
});

t('the KPI panel asks for the chosen window and offers 3, 6 and 12 months', () => {
  assert.ok(panel.includes('/api/kpis?months=${months}'));
  assert.ok(panel.includes('[3, 6, 12].map'));
  assert.ok(panel.includes('last ${months} months')); // the heading also shows a picked range (Pass 304)
});

t('the Stripe pay page defines env inside payFlow (it used a name only GET and POST had)', () => {
  const pay = fs.readFileSync('app/api/pay/route.js', 'utf8');
  const body = pay.slice(pay.indexOf('async function payFlow('));
  assert.ok(/const env = operatorEnv\(\)/.test(body.slice(0, 200)), 'payFlow must define env before use');
});

t('the pipeline digest creates its lines before the new-leads block writes to them', () => {
  const src = fs.readFileSync('lib/pipeline-alerts.js', 'utf8');
  assert.ok(src.indexOf('const out = [') !== -1);
  assert.ok(src.indexOf('const out = [') < src.indexOf('New leads waiting for a first reply'));
});

console.log(`\n${n} passed`);
