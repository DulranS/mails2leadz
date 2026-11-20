// HubSpot deal stages (pass 324): won, lost and open come from the owner's own pipeline, with the default ids as the fallback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hubspotPipelineStages, hubspotOutcome, hubspotDealBody, hubspotStageBody, HUBSPOT_DEFAULT_PIPELINE, HUBSPOT_STAGE } from '../lib/crm.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const defaultPipe = { id: 'default', label: 'Sales Pipeline', stages: [
  { id: 'appointmentscheduled', displayOrder: 0, metadata: { probability: '0.2' } },
  { id: 'qualifiedtobuy', displayOrder: 1, metadata: { probability: '0.4' } },
  { id: 'closedwon', displayOrder: 6, metadata: { probability: '1.0' } },
  { id: 'closedlost', displayOrder: 7, metadata: { probability: '0.0' } },
] };
const custom = { id: '9001', label: 'Agency', stages: [
  { id: 'brief', displayOrder: 0, metadata: { probability: '0.1' } },
  { id: 'pitch', displayOrder: 1, metadata: { probability: '0.5' } },
  { id: 'signed', displayOrder: 2, metadata: { probability: '1.0' } },
  { id: 'dropped', displayOrder: 3, metadata: { probability: '0.0' } },
] };

t('the default pipeline gives the default ids', () => {
  assert.deepEqual(hubspotPipelineStages({ results: [defaultPipe] }), {
    pipeline: 'default', stages: { open: 'appointmentscheduled', won: 'closedwon', lost: 'closedlost' },
  });
});

t('a custom pipeline gives its own won, lost and open ids, found by probability', () => {
  assert.deepEqual(hubspotPipelineStages({ results: [custom] }), { pipeline: '9001', stages: { open: 'brief', won: 'signed', lost: 'dropped' } });
});

t('the default pipeline is preferred when the account has several', () => {
  assert.equal(hubspotPipelineStages({ results: [custom, defaultPipe] }).pipeline, 'default');
});

t('no usable pipeline gives null, so the caller keeps the defaults', () => {
  assert.equal(hubspotPipelineStages({}), null);
  assert.equal(hubspotPipelineStages(null), null);
  assert.equal(hubspotPipelineStages({ results: [{ id: 'x', stages: [{ id: 'a', metadata: { probability: '0.5' } }] }] }), null);
});

t('the outcome reads the stages it is given; a default id means nothing in a custom pipeline', () => {
  const s = { open: 'brief', won: 'signed', lost: 'dropped' };
  assert.equal(hubspotOutcome('signed', s), 'won');
  assert.equal(hubspotOutcome('dropped', s), 'lost');
  assert.equal(hubspotOutcome('pitch', s), 'open');
  assert.equal(hubspotOutcome('closedwon', s), 'open');
});

t('defaults are unchanged when no stages are given', () => {
  assert.equal(hubspotOutcome('closedwon'), 'won');
  assert.equal(hubspotOutcome('closedlost'), 'lost');
  assert.equal(hubspotOutcome('appointmentscheduled'), 'open');
  assert.equal(hubspotDealBody({ title: 'T', contactId: 1, outcome: 'won' }).properties.dealstage, 'closedwon');
  assert.equal(hubspotDealBody({ title: 'T', contactId: 1, outcome: 'won' }).properties.pipeline, 'default');
  assert.equal(hubspotStageBody('lost').properties.dealstage, 'closedlost');
});

t('a custom pipeline is written to the deal create and to a stage change', () => {
  const s = { open: 'brief', won: 'signed', lost: 'dropped' };
  const body = hubspotDealBody({ title: 'T', contactId: 7, outcome: 'won', amount: 500, pipeline: '9001', stages: s });
  assert.equal(body.properties.pipeline, '9001');
  assert.equal(body.properties.dealstage, 'signed');
  assert.equal(body.properties.amount, '500.00');
  assert.equal(hubspotStageBody('open', s).properties.dealstage, 'brief');
});

t('the fallback is the default pipeline with the default ids', () => {
  assert.deepEqual(HUBSPOT_DEFAULT_PIPELINE.stages, HUBSPOT_STAGE);
  assert.equal(HUBSPOT_DEFAULT_PIPELINE.pipeline, 'default');
});

t('the sync reads the pipeline once per run and uses its stages', () => {
  const src = fs.readFileSync('lib/server/crm.js', 'utf8');
  assert.match(src, /hubspotAdapter\(cfg\.hubspot\.token, fetchImpl, await hubspotPipeline\(cfg\.hubspot\.token, fetchImpl\)\)/);
  assert.match(src, /\/crm\/v3\/pipelines\/deals/);
  // Pass 336: the read now returns the outcome and the owner's stage name together (remoteDeal).
  assert.match(src, /const stageId = \(await r\.json\(\)\)\?\.properties\?\.dealstage;\s*return \{ outcome: hubspotOutcome\(stageId, pipe\.stages\)/);
});

console.log(`  ${n} HubSpot pipeline checks passed`);
