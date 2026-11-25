// v398: lead-to-pipeline conversion (lib/pipelineConversion.js). Pure. Run: node --test tests/lead-to-pipeline-v398.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadToPipeline, PIPELINE_STAGES } from '../lib/pipelineConversion.js';

test('counts deals at or beyond qualified as in the pipeline', () => {
  const r = leadToPipeline([{ stage: 'new' }, { stage: 'contacted' }, { stage: 'qualified' }, { stage: 'won' }]);
  assert.equal(r.total, 4);
  assert.equal(r.inPipeline, 2);
  assert.equal(r.ratePct, 50);
});

test('no deals gives no rate, not zero', () => {
  assert.equal(leadToPipeline([]).ratePct, null);
  assert.equal(leadToPipeline(undefined).ratePct, null);
});

test('deals with no stage are ignored', () => {
  const r = leadToPipeline([{ stage: '' }, {}, null, { stage: 'demo' }]);
  assert.equal(r.total, 1);
  assert.equal(r.ratePct, 100);
});

test('lost deals count as leads', () => {
  const r = leadToPipeline([{ stage: 'lost' }, { stage: 'closed_lost' }, { stage: 'proposal' }]);
  assert.equal(r.inPipeline, 1);
  assert.equal(r.ratePct, 33.3);
});

test('the pipeline stages include the open sales stages', () => {
  for (const s of ['qualified', 'demo', 'proposal', 'negotiation']) assert.ok(PIPELINE_STAGES.includes(s), s);
  assert.ok(!PIPELINE_STAGES.includes('new'));
  assert.ok(!PIPELINE_STAGES.includes('contacted'));
});
