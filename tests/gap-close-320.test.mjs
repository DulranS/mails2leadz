// Pass 320: deals sync with the CRM on won / lost, both ways. The rules and request shapes are pure (lib/crm.js) and tested here;
// the calls and the per-deal loop are in lib/server/crm.js and are checked against their source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  outcomeOfStage, stageForOutcome, hubspotOutcome, hubspotDealBody, hubspotStageBody, HUBSPOT_STAGE,
  pipedriveOutcome, pipedriveDealBody, pipedriveStatusBody, decideSync,
} from '../lib/crm.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('an AutoLeads stage maps to won, lost, or open', () => {
  assert.equal(outcomeOfStage('closed_won'), 'won');
  assert.equal(outcomeOfStage('closed_lost'), 'lost');
  assert.equal(outcomeOfStage('demo'), 'open');
  assert.equal(outcomeOfStage('new'), 'open');
});

t('a CRM win or loss lands on the closed stage', () => {
  assert.equal(stageForOutcome('won', 'proposal'), 'closed_won');
  assert.equal(stageForOutcome('lost', 'negotiation'), 'closed_lost');
});

t('a deal reopened in the CRM goes back to contacted from a closed stage, and an open deal keeps its stage', () => {
  assert.equal(stageForOutcome('open', 'closed_won'), 'contacted');
  assert.equal(stageForOutcome('open', 'closed_lost'), 'contacted');
  assert.equal(stageForOutcome('open', 'demo'), 'demo');
});

t('HubSpot stage ids: closedwon and closedlost are closed, any other stage is open', () => {
  assert.equal(hubspotOutcome('closedwon'), 'won');
  assert.equal(hubspotOutcome('closedlost'), 'lost');
  assert.equal(hubspotOutcome('presentationscheduled'), 'open');
  assert.equal(hubspotOutcome(undefined), 'open');
  assert.equal(HUBSPOT_STAGE.open, 'appointmentscheduled');
});

t('a HubSpot deal is created in the open stage, linked to its contact with association type 3 (deal to contact)', () => {
  const body = hubspotDealBody({ title: 'Acme', contactId: '201', outcome: 'open' });
  assert.equal(body.properties.dealname, 'Acme');
  assert.equal(body.properties.dealstage, 'appointmentscheduled');
  assert.deepEqual(body.associations, [{ to: { id: 201 }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }] }]);
});

t('a HubSpot deal created already won starts in the closed-won stage', () => {
  assert.equal(hubspotDealBody({ title: 'A', contactId: '1', outcome: 'won' }).properties.dealstage, 'closedwon');
  assert.deepEqual(hubspotStageBody('lost'), { properties: { dealstage: 'closedlost' } });
});

t('Pipedrive status: open, won, lost pass through; deleted or anything else means the CRM no longer has the deal', () => {
  assert.equal(pipedriveOutcome('won'), 'won');
  assert.equal(pipedriveOutcome('lost'), 'lost');
  assert.equal(pipedriveOutcome('open'), 'open');
  assert.equal(pipedriveOutcome('deleted'), 'missing');
  assert.equal(pipedriveOutcome(undefined), 'missing');
});

t('a Pipedrive deal is created with a title and its person (v2: title, person_id), and its status is set by PATCH', () => {
  assert.deepEqual(pipedriveDealBody({ title: 'Acme', personId: '123' }), { title: 'Acme', person_id: 123 });
  assert.deepEqual(pipedriveStatusBody('won'), { status: 'won' });
});

t('decision: a deal with no CRM record yet is created with our outcome', () => {
  assert.deepEqual(decideSync({ linked: false, remote: null, ours: 'open', synced: null }), { action: 'create', outcome: 'open' });
});

t('decision: the CRM changed it since we last wrote, so we take the CRM value (pull)', () => {
  // We wrote open. Someone marked it won in the CRM.
  assert.deepEqual(decideSync({ linked: true, remote: 'won', ours: 'open', synced: 'open' }), { action: 'pull', outcome: 'won' });
});

t('decision: only we changed it, so we send our value (push)', () => {
  // We wrote open. We moved it to won here; the CRM still says open.
  assert.deepEqual(decideSync({ linked: true, remote: 'open', ours: 'won', synced: 'open' }), { action: 'push', outcome: 'won' });
});

t('decision: both changed since the last sync, and the CRM wins (its change is taken, ours is overwritten)', () => {
  assert.deepEqual(decideSync({ linked: true, remote: 'lost', ours: 'won', synced: 'open' }), { action: 'pull', outcome: 'lost' });
});

t('decision: nothing changed on either side, nothing is sent', () => {
  assert.deepEqual(decideSync({ linked: true, remote: 'won', ours: 'won', synced: 'won' }), { action: 'none', outcome: 'won' });
});

t('decision: a record deleted in the CRM is created again (not linked)', () => {
  assert.deepEqual(decideSync({ linked: false, remote: null, ours: 'won', synced: 'won' }), { action: 'create', outcome: 'won' });
});

t('a sequence of runs: an open deal won in the CRM, then reopened here, converges without looping', () => {
  // Run 1: created open. Run 2: the CRM marks it won -> pull. Run 3: nothing changed -> none. Run 4: we reopen it here -> push.
  let synced = null;
  const steps = [];
  let remote = null;
  let ours = 'open';
  let dec = decideSync({ linked: false, remote, ours, synced });
  steps.push(dec.action); synced = dec.outcome;
  remote = 'open';
  dec = decideSync({ linked: true, remote, ours, synced });
  steps.push(dec.action);
  remote = 'won';
  dec = decideSync({ linked: true, remote, ours, synced });
  steps.push(dec.action); synced = dec.outcome; ours = dec.outcome;
  dec = decideSync({ linked: true, remote, ours, synced });
  steps.push(dec.action);
  ours = 'open';
  dec = decideSync({ linked: true, remote, ours, synced });
  steps.push(dec.action);
  assert.deepEqual(steps, ['create', 'none', 'pull', 'none', 'push']);
});

// ---- the per-deal loop and the calls: checked against the source (they need the Firebase packages to run) ----
const crm = fs.readFileSync('lib/server/crm.js', 'utf8');
t('the HubSpot deal endpoints and the contact association are used in the loop', () => {
  assert.match(crm, /crm\/objects\/2026-09\/deals/);
  assert.match(crm, /hubspotDealBody\(/);
  assert.match(crm, /hubspotStageBody\(/);
});
t('the Pipedrive deal endpoints are the v2 ones: create, read by id, status PATCH', () => {
  assert.match(crm, /\$\{base\}\/deals`, \{ method: 'POST'/);
  assert.match(crm, /\$\{base\}\/deals\/\$\{encodeURIComponent\(id\)\}`, \{ method: 'PATCH'/);
  assert.match(crm, /\$\{base\}\/deals\/\$\{encodeURIComponent\(id\)\}`, \{ headers/);
});
t('a deal the CRM no longer has (404, or deleted) is treated as missing and created again', () => {
  assert.match(crm, /if \(r\.status === 404\) return 'missing'/);
  assert.match(crm, /linked: !!linkId && remote !== 'missing'/);
});
t('each CRM keeps its own contact id, so a HubSpot id is never used as a Pipedrive person', () => {
  assert.match(crm, /const contactIds = \{\}/);
  assert.match(crm, /contactId: contact\.id/); // pass 347: the contact is { id, created }
});
t('the sync writes the outcome it sent back to the deal, and the stage when the CRM changed it', () => {
  assert.match(crm, /crmSynced: synced/);
  assert.match(crm, /if \(stage !== d\.stage\) Object\.assign\(write, \{ stage, updatedAt: nowIso/);
});
t('linked deals are re-read each run, so changes made in the CRM are found', () => {
  assert.match(crm, /const linked = all/);
  assert.match(crm, /crmHubspotDealId \|\| d\.crmPipedriveDealId/);
});
t('a deal changed in either field (lastUpdate or updatedAt) is picked up', () => {
  assert.match(crm, /filter\(\(x\) => typeof x === 'string'\)/);
});

console.log(`\n${n} passed`);
