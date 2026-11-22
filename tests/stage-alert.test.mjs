// Pass 367: an alert when a deal moves into a stage that needs the owner's next step.
import assert from 'node:assert/strict';
import { STAGE_ALERT_STAGES, stageAlertFor, stageAlertPushPayload } from '../lib/stage-alert.js';

assert.ok(STAGE_ALERT_STAGES.includes('proposal') && STAGE_ALERT_STAGES.includes('negotiation'), 'proposal and negotiation alert');
assert.ok(STAGE_ALERT_STAGES.includes('closed_won') && STAGE_ALERT_STAGES.includes('delivery'), 'a win and the stages after it alert');
for (const s of ['new', 'contacted', 'qualified', 'demo', 'closed_lost']) assert.ok(!STAGE_ALERT_STAGES.includes(s), `${s} does not alert`);

const now = Date.parse('2026-11-23T04:00:00Z');
const a = stageAlertFor({ email: 'Buyer@Example.com', stage: 'negotiation', now });
assert.equal(a.kind, 'stage_moved');
assert.equal(a.leadEmail, 'buyer@example.com', 'the address is lower-cased');
assert.equal(a.stage, 'negotiation');
assert.equal(a.stageKey, 'moved:buyer@example.com:negotiation:2026-11-23', 'one alert per deal, per stage, per day');
assert.equal(a.reason, 'Moved to Negotiation. Next step is yours.');
assert.equal(a.status, 'pending');
assert.equal(a.completedAt, null);
assert.equal(stageAlertFor({ email: 'x@y.com', stage: 'closed_won', now }).reason, 'Moved to Won. Next step is yours.', 'won is named Won');
const p = stageAlertPushPayload({ email: 'buyer@example.com', stage: 'proposal' });
assert.equal(p.title, 'Deal moved to Proposal');
assert.equal(p.url, '/crm');
console.log('stage alerts: all checks pass');
