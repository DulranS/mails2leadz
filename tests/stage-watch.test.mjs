// Pass 368: the scheduled watch that alerts on stage changes made anywhere, and where it resumes from.
import assert from 'node:assert/strict';
import { newStageAlerts, nextWatermark } from '../lib/stage-watch.js';

const since = '2026-11-23T04:00:00.000Z';
const now = Date.parse('2026-11-23T04:15:00Z');
const deals = [
  { userId: 'u1', email: 'a@x.com', stage: 'negotiation', lastUpdate: '2026-11-23T04:10:00.000Z' }, // updated after the watermark, alert stage: alert
  { userId: 'u1', email: 'b@x.com', stage: 'negotiation', lastUpdate: '2026-11-23T03:50:00.000Z' }, // before the watermark: no
  { userId: 'u1', email: 'c@x.com', stage: 'demo', lastUpdate: '2026-11-23T04:10:00.000Z' }, // not an alert stage: no
  { userId: 'u2', email: 'd@x.com', stage: 'closed_won', lastUpdate: '2026-11-23T04:12:00.000Z' }, // a win: alert, for u2
  { userId: 'u2', stage: 'proposal', lastUpdate: '2026-11-23T04:12:00.000Z' }, // no email: no
  { userId: 'u2', email: 'e@x.com', stage: 'proposal' }, // no update time: no
];
const found = newStageAlerts(deals, { sinceIso: since, now });
assert.equal(found.length, 2, 'only the two recent alert-stage deals');
assert.equal(found[0].userId, 'u1');
assert.equal(found[0].alert.leadEmail, 'a@x.com');
assert.equal(found[0].alert.stageKey, 'moved:a@x.com:negotiation:2026-11-23');
assert.equal(found[1].userId, 'u2');
assert.equal(found[1].alert.reason, 'Moved to Won. Next step is yours.');
assert.equal(newStageAlerts([], { sinceIso: since, now }).length, 0, 'nothing to watch, nothing to alert');

// Where the next run starts.
const rows = [{ lastUpdate: '2026-11-23T04:01:00.000Z' }, { lastUpdate: '2026-11-23T04:02:00.000Z' }];
assert.equal(nextWatermark(rows, '2026-11-23T04:15:00.000Z', 500), '2026-11-23T04:15:00.000Z', 'a short page starts from the run time');
assert.equal(nextWatermark(rows, '2026-11-23T04:15:00.000Z', 2), '2026-11-23T04:02:00.000Z', 'a full page resumes from its last deal');
assert.equal(nextWatermark([], '2026-11-23T04:15:00.000Z', 1), '2026-11-23T04:15:00.000Z', 'no rows starts from the run time');
console.log('stage watch: all checks pass');
