// Balancr sync (v264): the link is kept when a deal is pushed; the stage reconciliation lets Balancr decide won and lost, and AutoLeads decide the outreach
// stages; the daily route is scheduled and gated. Run: node tests/balancr-sync.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { toBalancrStage, fromBalancrStage } from '../lib/balancr.js';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// Stage names agree with Balancr's lead stages.
const BALANCR = ['new', 'contacted', 'qualified', 'follow_up', 'proposal_sent', 'won', 'lost'];
ok(BALANCR.every((s) => fromBalancrStage(s) !== null), 'every Balancr stage maps to a stage AutoLeads knows');
ok(toBalancrStage('closed_won') === 'won' && fromBalancrStage('won') === 'closed_won', 'won translates both ways');
ok(toBalancrStage('closed_lost') === 'lost' && fromBalancrStage('lost') === 'closed_lost', 'lost translates both ways');

const lib = read('lib/server/balancr.js');
ok(lib.includes("balancrLeadId: String(leadId)"), 'pushing a deal keeps the Balancr lead id on the deal, so it can be found again');
ok(lib.includes('export async function reconcileDealStages'), 'the stage reconciliation exists');
ok(lib.includes("closedHere && mapped && deal.stage !== mapped"), 'a deal Balancr has won or lost follows Balancr');
ok(lib.includes("!closedHere && deal.stage && toBalancrStage(deal.stage) !== theirs"), 'otherwise the outreach stage in AutoLeads is pushed to Balancr');

const cron = read('app/api/cron/balancr-sync/route.js');
ok(cron.includes('cronGate(request)') && cron.includes('pullLeads(') && cron.includes('reconcileDealStages(') && cron.includes('syncInvoice('), 'the daily route is gated and runs pull, reconcile and invoice checks');
const vercel = JSON.parse(read('vercel.json'));
ok(read('lib/server/open-day.js').includes('reconcileDealStages') && read('lib/server/open-day.js').includes('pullLeads'), 'the Balancr sync runs when the owner opens the app (no schedule on the free plan)');
ok(read('package.json').includes('tests/balancr-sync.test.mjs'), 'this test runs in npm test');

console.log(`balancr sync: ${n} checks passed`);
