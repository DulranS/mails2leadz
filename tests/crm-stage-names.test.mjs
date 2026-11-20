// HubSpot stage names mirrored for display (pass 336). Run: node tests/crm-stage-names.test.mjs
import assert from 'node:assert/strict';
import { hubspotStageLabels, hubspotPipelineStages } from '../lib/crm.js';
import { dealHistory } from '../lib/deal-history.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };

const custom = { id: '9001', label: 'Agency', stages: [
  { id: 'brief', label: 'New brief', displayOrder: 0, metadata: { probability: '0.1' } },
  { id: 'pitch', label: 'Pitch sent', displayOrder: 1, metadata: { probability: '0.5' } },
  { id: 'signed', label: 'Signed', displayOrder: 2, metadata: { probability: '1.0' } },
  { id: 'dropped', label: 'Dropped', displayOrder: 3, metadata: { probability: '0.0' } },
] };
const defaultPipe = { id: 'default', stages: [
  { id: 'appointmentscheduled', label: 'Appointment Scheduled', displayOrder: 0, metadata: { probability: '0.2' } },
  { id: 'closedwon', label: 'Closed Won', displayOrder: 6, metadata: { probability: '1.0' } },
  { id: 'closedlost', label: 'Closed Lost', displayOrder: 7, metadata: { probability: '0.0' } },
] };

t('labels come from the same pipeline the stages come from', () => {
  const json = { results: [custom] };
  assert.deepEqual(hubspotStageLabels(json), { brief: 'New brief', pitch: 'Pitch sent', signed: 'Signed', dropped: 'Dropped' });
  assert.equal(hubspotPipelineStages(json).pipeline, '9001');
});

t('the default pipeline is preferred, as for the stages', () => {
  const json = { results: [custom, defaultPipe] };
  assert.equal(hubspotStageLabels(json).closedwon, 'Closed Won');
  assert.ok(!('brief' in hubspotStageLabels(json)));
});

t('no usable pipeline gives no labels, not an error', () => {
  assert.deepEqual(hubspotStageLabels({}), {});
  assert.deepEqual(hubspotStageLabels({ results: [{ id: 'x' }] }), {});
  assert.deepEqual(hubspotStageLabels(null), {});
});

t('a stage with no label is left out; a very long label is cut to 80', () => {
  const json = { results: [{ id: 'default', stages: [{ id: 'a' }, { id: 'b', label: 'L'.repeat(200) }] }] };
  const labels = hubspotStageLabels(json);
  assert.ok(!('a' in labels));
  assert.equal(labels.b.length, 80);
});

const openDeal = { stage: 'contacted', value: 500, stageTimes: {}, crmStageNames: { hubspot: 'Pitch sent' } };

t('an open deal shows the owner\'s CRM stage name', () => {
  assert.equal(dealHistory(openDeal).crmStage, 'Pitch sent');
});

t('a won or lost deal does not show the CRM stage name', () => {
  assert.equal(dealHistory({ ...openDeal, stage: 'closed_won' }).crmStage, null);
  assert.equal(dealHistory({ ...openDeal, stage: 'closed_lost' }).crmStage, null);
});

t('no name known gives null, and empty or odd values are ignored', () => {
  assert.equal(dealHistory({ stage: 'contacted', stageTimes: {} }).crmStage, null);
  assert.equal(dealHistory({ stage: 'contacted', crmStageNames: { hubspot: '   ' } }).crmStage, null);
  assert.equal(dealHistory({ stage: 'contacted', crmStageNames: 'nope' }).crmStage, null);
});

console.log(`crm stage names: ${n} checks passed`);
