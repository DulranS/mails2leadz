// v401: brand survey counts, share of voice, media plan against actual, and positioning texts. Pure. Run: node --test tests/marketing-plan-v401.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeBrandSurvey, brandSummary } from '../lib/brand-survey.js';
import { sanitizeCompetitorSpend, shareOfVoice } from '../lib/share-of-voice.js';
import { sanitizePlanLine, mediaPlanVariance } from '../lib/media-plan.js';
import { sanitizePositioning, positioningGaps, POSITIONING_LIMITS } from '../lib/positioning.js';

// Brand survey
test('a brand survey keeps the counts and leaves unasked questions blank', () => {
  const r = sanitizeBrandSurvey({ date: '2026-11-01', sample: '250', aware: '125', recalled: '', favourable: '100' });
  assert.deepEqual(r.entry, { date: '2026-11-01', sample: 250, aware: 125, recalled: null, favourable: 100 });
});

test('brand survey rejects impossible counts', () => {
  assert.ok(sanitizeBrandSurvey({ date: '2026-11-01', sample: '0', aware: '0' }).error);
  assert.ok(sanitizeBrandSurvey({ date: '2026-11-01', sample: '50', aware: '60' }).error, 'aware above the sample');
  assert.ok(sanitizeBrandSurvey({ date: '2026-11-01', sample: '50', aware: '20', recalled: '25' }).error, 'recall above awareness');
  assert.ok(sanitizeBrandSurvey({ date: '2026-11-01', sample: '50', aware: '20', favourable: '21' }).error, 'favourable above awareness');
  assert.ok(sanitizeBrandSurvey({ date: '2026-02-30', sample: '50', aware: '20' }).error, '30 February');
  assert.ok(sanitizeBrandSurvey({ date: '2026-11-01', sample: '50', aware: '2.5' }).error, 'not a whole number');
  assert.ok(sanitizeBrandSurvey({ date: '2026-11-01', sample: '50', aware: '' }).error, 'awareness is required');
});

test('brand summary gives the latest shares and the change in awareness', () => {
  const s = brandSummary([
    { date: '2026-06-01', sample: 200, aware: 80, recalled: null, favourable: null },
    { date: '2026-11-01', sample: 250, aware: 125, recalled: 25, favourable: 100 },
  ]);
  assert.equal(s.surveys, 2);
  assert.equal(s.latest.date, '2026-11-01');
  assert.equal(s.latest.awarePct, 50);
  assert.equal(s.latest.recallPct, 10);
  assert.equal(s.latest.favourablePct, 40);
  assert.equal(s.previous.awarePct, 40);
  assert.equal(s.awarePointsChange, 10);
});

test('brand summary with no surveys, and a survey with no recall question', () => {
  assert.deepEqual(brandSummary([]), { surveys: 0, latest: null, awarePointsChange: null });
  const one = brandSummary([{ date: '2026-11-01', sample: 100, aware: 30, recalled: null, favourable: null }]);
  assert.equal(one.latest.recallPct, null);
  assert.equal(one.awarePointsChange, null, 'one survey has no change to show');
});

// Share of voice
test('a competitor spend entry needs a name, a month and an amount', () => {
  assert.ok(sanitizeCompetitorSpend({ competitor: '  ', month: '2026-11', amount: '100' }).error);
  assert.ok(sanitizeCompetitorSpend({ competitor: 'Acme', month: '2026-13', amount: '100' }).error);
  assert.ok(sanitizeCompetitorSpend({ competitor: 'Acme', month: '2026-11', amount: '-5' }).error);
  assert.deepEqual(sanitizeCompetitorSpend({ competitor: '  Acme   Co ', month: '2026-11', amount: '100.456' }).entry, { competitor: 'Acme Co', month: '2026-11', amount: 100.46 });
});

test('share of voice: own spend as a share of all spend, month by month and overall', () => {
  const r = shareOfVoice({
    months: ['2026-11', '2026-10'],
    ownSpend: [{ amount: 300, month: '2026-11' }, { amount: 100, month: '2026-10' }],
    competitorSpend: [
      { competitor: 'Acme', amount: 100, month: '2026-11' },
      { competitor: 'Acme', amount: 50, month: '2026-11' },
      { competitor: 'Beta', amount: 50, month: '2026-11' },
      { competitor: 'Beta', amount: 999, month: '2026-08' }, // outside the window
    ],
  });
  assert.equal(r.months[0].month, '2026-11');
  assert.equal(r.months[0].own, 300);
  assert.equal(r.months[0].total, 500);
  assert.equal(r.months[0].sharePct, 60);
  assert.deepEqual(r.months[0].competitors, [{ name: 'Acme', amount: 150 }, { name: 'Beta', amount: 50 }]);
  assert.equal(r.months[1].sharePct, 100, 'no competitor spend in October');
  assert.equal(r.ownTotal, 400);
  assert.equal(r.competitorTotal, 200);
  assert.equal(r.overallSharePct, 66.7);
  assert.deepEqual(r.competitors.map((c) => c.name), ['Acme', 'Beta'], 'only competitors in the window, largest first');
});

test('a month with no spend at all has no share', () => {
  const r = shareOfVoice({ months: ['2026-09'], ownSpend: [], competitorSpend: [] });
  assert.equal(r.months[0].sharePct, null);
  assert.equal(r.overallSharePct, null);
});

// Media plan
test('a plan line needs a channel, a month and a planned amount', () => {
  assert.ok(sanitizePlanLine({ channel: 'tv', month: '2026-11', planned: '100' }).error);
  assert.ok(sanitizePlanLine({ channel: 'paid_ads', month: '2026-11', planned: '' }).error);
  assert.ok(sanitizePlanLine({ channel: 'paid_ads', month: 'Nov', planned: '100' }).error);
  assert.deepEqual(sanitizePlanLine({ channel: 'paid_ads', month: '2026-11', planned: '1000', note: '  Meta  burst ' }).entry, {
    channel: 'paid_ads',
    month: '2026-11',
    planned: 1000,
    note: 'Meta burst',
  });
});

test('media plan against actual: over, on plan, under, unplanned and not spent', () => {
  const r = mediaPlanVariance({
    plan: [
      { channel: 'paid_ads', month: '2026-11', planned: 1000 },
      { channel: 'content', month: '2026-11', planned: 500 },
      { channel: 'paid_ads', month: '2026-10', planned: 800 },
      { channel: 'outreach_tools', month: '2026-10', planned: 300 },
    ],
    spend: [
      { channel: 'paid_ads', month: '2026-11', amount: 1200 },
      { channel: 'content', month: '2026-11', amount: 480 },
      { channel: 'paid_ads', month: '2026-10', amount: 800 },
      { channel: 'events', month: '2026-11', amount: 200 },
    ],
  });
  assert.equal(r.rows.length, 5);
  const find = (month, channel) => r.rows.find((x) => x.month === month && x.channel === channel);
  assert.equal(find('2026-11', 'paid_ads').status, 'over');
  assert.equal(find('2026-11', 'paid_ads').variancePct, 20);
  assert.equal(find('2026-11', 'content').status, 'on_plan', '480 against 500 is within 5%');
  assert.equal(find('2026-11', 'events').status, 'unplanned');
  assert.equal(find('2026-10', 'paid_ads').status, 'on_plan');
  assert.equal(find('2026-10', 'outreach_tools').status, 'not_spent');
  assert.equal(r.rows[0].month, '2026-11', 'newest month first');
  assert.equal(r.plannedTotal, 2600);
  assert.equal(r.actualTotal, 2680);
  assert.equal(r.overallVariancePct, 3.1);
});

test('under plan is flagged when spend falls more than 5% short', () => {
  const r = mediaPlanVariance({ plan: [{ channel: 'content', month: '2026-11', planned: 1000 }], spend: [{ channel: 'content', month: '2026-11', amount: 900 }] });
  assert.equal(r.rows[0].status, 'under');
  assert.equal(r.rows[0].variancePct, -10);
});

test('an empty plan and no spend give no total and no percentage', () => {
  const r = mediaPlanVariance({});
  assert.deepEqual(r.rows, []);
  assert.equal(r.overallVariancePct, null);
});

// Positioning
test('positioning texts are trimmed and limited, and anything that is not text is blank', () => {
  const r = sanitizePositioning({ usp: '  fast  ', valueProposition: 'x'.repeat(POSITIONING_LIMITS.valueProposition + 50), persona: 42 });
  assert.equal(r.usp, 'fast');
  assert.equal(r.valueProposition.length, POSITIONING_LIMITS.valueProposition);
  assert.equal(r.persona, '');
});

test('positioning shows which texts are still blank', () => {
  assert.deepEqual(positioningGaps({ usp: 'x', valueProposition: '', persona: '   ' }), ['valueProposition', 'persona']);
  assert.deepEqual(positioningGaps(null), ['usp', 'valueProposition', 'persona']);
  assert.deepEqual(positioningGaps({ usp: 'a', valueProposition: 'b', persona: 'c' }), []);
});
