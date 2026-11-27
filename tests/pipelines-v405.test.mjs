// v405: custom sales pipelines (lib/pipelines.js). The default pipeline keeps the fixed stage ids; a custom pipeline has 2 to 12 named stages;
// a deal moves only within its own pipeline; at most five pipelines per account. Pure. Run: node --test tests/pipelines-v405.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_STAGES, OPEN_STAGES, WON_STAGES, knownStage, buildDealWrite } from '../lib/deal-utils.js';
import { quarterForecast } from '../lib/health.js';
import {
  DEFAULT_PIPELINE, DEFAULT_PIPELINE_ID, MAX_PIPELINES, CUSTOM_STAGE_PROBABILITY,
  sanitizePipelines, dealPipelineId, checkStageForDeal, createPipeline, renamePipeline,
  addStage, renameStage, moveStage, movePipeline, pipelineForecast,
  deletePipeline, deleteStage, countDeals, moveDealToPipeline, dealsWithOutcomes, stageOutcome, stageNameOf, parseStageLine,
} from '../lib/pipelines.js';
import { planStallAlerts, lastMonthWinLoss } from '../lib/pipeline-alerts.js';
import { salesKpis } from '../lib/sales-kpis.js';

const DAY_MS = 86400000;

const NOW = Date.parse('2026-11-26T12:00:00Z');
const names = (n, prefix = 'Pipe') => Array.from({ length: n }, (_, i) => `${prefix} stage ${i + 1}`);

test('the default pipeline keeps the existing fixed stage ids, read from deal-utils', () => {
  const ids = DEFAULT_PIPELINE.stages.map((s) => s.id);
  assert.deepEqual(ids, ALL_STAGES);
  assert.deepEqual(ids, [...OPEN_STAGES, ...WON_STAGES, 'closed_lost']);
  for (const id of ids) assert.equal(knownStage(id), id, `${id} is still a known stage`);
});

test('a deal with no pipelineId reads as the default pipeline, and its default stages still check', () => {
  assert.equal(dealPipelineId({ stage: 'new' }), DEFAULT_PIPELINE_ID);
  assert.equal(dealPipelineId({ stage: 'new', pipelineId: null }), DEFAULT_PIPELINE_ID);
  assert.equal(checkStageForDeal([], { stage: 'qualified' }, 'demo').ok, true);
  assert.equal(checkStageForDeal([], { stage: 'qualified' }, 'won').stage, 'closed_won'); // an alias still resolves
});

test('a custom pipeline with one stage is refused', () => {
  const r = createPipeline([], { name: 'Partners', stages: ['Intro'] });
  assert.equal(r.ok, false);
  assert.match(r.error, /at least 2 stages/);
});

test('a stage name that is too long is refused, and one of exactly 40 characters is allowed', () => {
  const tooLong = createPipeline([], { name: 'Partners', stages: ['Intro', 'x'.repeat(41)] });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.error, /at most 40 characters/);
  const ok = createPipeline([], { name: 'Partners', stages: ['Intro', 'x'.repeat(40)] });
  assert.equal(ok.ok, true);
  assert.equal(createPipeline([], { name: 'Partners', stages: ['Intro', ''] }).ok, false);
});

test('a pipeline name must be two to forty characters', () => {
  assert.equal(createPipeline([], { name: 'A', stages: names(2) }).ok, false);
  assert.equal(createPipeline([], { name: 'x'.repeat(41), stages: names(2) }).ok, false);
});

test('moving a deal to a stage of another pipeline is refused, both ways', () => {
  const r = createPipeline([], { name: 'Partners', stages: ['Intro', 'Signed'] });
  const partners = r.pipelines;
  const partnerStage = partners[0].stages[0].id;
  const partnerDeal = { stage: partnerStage, pipelineId: partners[0].id };
  // a default deal cannot take a partner stage
  const fromDefault = checkStageForDeal(partners, { stage: 'new' }, partnerStage);
  assert.equal(fromDefault.ok, false);
  assert.match(fromDefault.error, /only within its own pipeline/);
  // a partner deal cannot take a default stage
  assert.equal(checkStageForDeal(partners, partnerDeal, 'proposal').ok, false);
  // a partner deal can move within its own pipeline
  assert.equal(checkStageForDeal(partners, partnerDeal, partners[0].stages[1].id).ok, true);
  // and the shared write refuses it too: an existing deal keeps its stage
  const write = buildDealWrite({ uid: 'u1', email: 'Lead@Example.com', stage: 'proposal', existing: { stage: partnerStage, pipelineId: partners[0].id }, now: new Date(NOW) });
  assert.equal(write.stage, partnerStage);
  assert.equal(write.pipelineId, partners[0].id);
});

test('a new deal written into a custom stage records its pipelineId, and a default deal writes none', () => {
  const r = createPipeline([], { name: 'Partners', stages: ['Intro', 'Signed'] });
  const stage = r.pipelines[0].stages[0].id;
  const partnerWrite = buildDealWrite({ uid: 'u1', email: 'a@x.co', stage, now: new Date(NOW) });
  assert.equal(partnerWrite.stage, stage);
  assert.equal(partnerWrite.pipelineId, r.pipelines[0].id);
  const defaultWrite = buildDealWrite({ uid: 'u1', email: 'b@x.co', stage: 'qualified', now: new Date(NOW) });
  assert.equal('pipelineId' in defaultWrite, false);
});

test('an account has at most five pipelines, the default one included', () => {
  assert.equal(MAX_PIPELINES, 5);
  let list = [];
  for (let i = 1; i <= 4; i++) {
    const r = createPipeline(list, { name: `Pipeline ${i}`, stages: names(2) });
    assert.equal(r.ok, true, `pipeline ${i} is allowed`);
    list = r.pipelines;
  }
  assert.equal(list.length, 4); // with the default, that is five
  const fifth = createPipeline(list, { name: 'Pipeline 5', stages: names(2) });
  assert.equal(fifth.ok, false);
  assert.match(fifth.error, /at most 5 pipelines/);
});

test('a custom pipeline keeps no more than twelve stages, and stages can be renamed and reordered without changing ids', () => {
  const r = createPipeline([], { name: 'Partners', stages: names(12) });
  assert.equal(r.ok, true);
  assert.equal(createPipeline([], { name: 'Partners', stages: names(13) }).ok, false);
  const pid = r.pipeline.id;
  const first = r.pipeline.stages[0].id;
  assert.equal(addStage(r.pipelines, pid, 'Extra').ok, false); // already at twelve
  const renamed = renameStage(r.pipelines, pid, first, 'Renamed');
  assert.equal(renamed.pipelines[0].stages[0].id, first);
  assert.equal(renamed.pipelines[0].stages[0].name, 'Renamed');
  const moved = moveStage(renamed.pipelines, pid, first, 5);
  assert.equal(moved.pipelines[0].stages[5].id, first);
});

test('the default pipeline cannot be renamed, reordered or given stages', () => {
  assert.equal(renamePipeline([], DEFAULT_PIPELINE_ID, 'Sales').ok, false);
  assert.equal(addStage([], DEFAULT_PIPELINE_ID, 'Extra').ok, false);
  assert.equal(movePipeline([], DEFAULT_PIPELINE_ID, 0).ok, false);
});

test('stored pipelines are read back as valid, and malformed ones are dropped', () => {
  const good = createPipeline([], { name: 'Partners', stages: ['Intro', 'Signed'] }).pipelines;
  const bad = [
    { id: 'pbadbad01', name: 'One stage', stages: [{ id: 'pbadbad01_aaaaaaaa', name: 'Only' }] },
    { id: 'default', name: 'Override', stages: [{ id: 'default_xxxx', name: 'x' }, { id: 'default_yyyy', name: 'y' }] },
  ];
  assert.deepEqual(sanitizePipelines([...good, ...bad]).map((p) => p.id), [good[0].id]);
  assert.deepEqual(sanitizePipelines(undefined), []);
});

test('the default forecast is unchanged by a custom-pipeline deal, which counts only in its own pipeline', () => {
  const deals = [
    { stage: 'closed_won', value: 1000, stageTimes: { closed_won: new Date(NOW - 86400000).toISOString() } },
    { stage: 'proposal', value: 2000 },
  ];
  const base = quarterForecast({ deals, monthlyTarget: 1000, now: NOW, probabilities: { proposal: 0.5 } });
  const withCustom = quarterForecast({ deals: [...deals, { stage: 'pabcdefgh_ijklmnop', pipelineId: 'pabcdefgh', value: 5000 }], monthlyTarget: 1000, now: NOW, probabilities: { proposal: 0.5 } });
  assert.equal(withCustom.expected, base.expected);
  assert.equal(withCustom.weightedOpen, base.weightedOpen);
});

test('the forecast groups custom pipelines, weights each stage, and gives custom stages the default chance', () => {
  const r = createPipeline([], { name: 'Partners', stages: ['Intro', 'Signed'] });
  const [intro, signed] = r.pipeline.stages.map((s) => s.id);
  const deals = [
    { stage: intro, pipelineId: r.pipeline.id, value: 1000 },
    { stage: signed, pipelineId: r.pipeline.id, value: 400 },
    { stage: 'proposal', value: 9999 }, // default pipeline: not in this forecast
  ];
  const [f] = pipelineForecast({ deals, pipelines: r.pipelines, probabilities: {} });
  assert.equal(f.pipelineId, r.pipeline.id);
  assert.equal(f.deals, 2);
  assert.equal(f.value, 1400);
  assert.equal(f.weighted, Math.round(1400 * CUSTOM_STAGE_PROBABILITY * 100) / 100);
  // a chance set for a custom stage id is used instead of the default
  const [g] = pipelineForecast({ deals, pipelines: r.pipelines, probabilities: { [signed]: 0.5 } });
  assert.equal(g.byStage[1].probability, 0.5);
});

test('renaming and reordering the custom pipelines keep their ids, and the list stays in the given order', () => {
  const a = createPipeline([], { name: 'Partners', stages: names(2) }).pipelines;
  const b = createPipeline(a, { name: 'Resellers', stages: names(2) }).pipelines;
  const renamed = renamePipeline(b, b[0].id, 'Channel partners');
  assert.equal(renamed.pipelines[0].id, b[0].id);
  assert.equal(renamed.pipelines[0].name, 'Channel partners');
  const reordered = movePipeline(b, b[1].id, 0);
  assert.deepEqual(reordered.pipelines.map((p) => p.id), [b[1].id, b[0].id]);
});

// --- Pass 406 fixes and gaps ---

test('quarterForecast weights open deals by the fractional default chances: 2000 at 0.6 is 1200, not 12 (worked example: 19.5 before the fix, 1950 after)', () => {
  // Default chances: proposal 0.6, negotiation 0.75. Expected = 2000 x 0.6 + 1000 x 0.75 = 1950.
  const f = quarterForecast({ deals: [{ stage: 'proposal', value: 2000 }, { stage: 'negotiation', value: 1000 }], monthlyTarget: 0, now: NOW });
  assert.equal(f.weightedOpen, 1950);
  assert.equal(f.expected, 1950);
});

test("quarterForecast reads the owner's fractional chances, and a chance outside 0 to 1 counts as none", () => {
  const deals = [{ stage: 'proposal', value: 2000 }];
  assert.equal(quarterForecast({ deals, now: NOW, probabilities: { proposal: 0.5 } }).weightedOpen, 1000);
  assert.equal(quarterForecast({ deals, now: NOW, probabilities: { proposal: 50 } }).weightedOpen, 0);
});

test('a stage can be marked won or lost when it is made; a line with no mark is open, and the mark is not part of the name', () => {
  const r = createPipeline([], { name: 'Partners', stages: ['Intro call', 'Signed [won]', 'Went quiet [lost]'] });
  assert.equal(r.ok, true);
  const [intro, signed, quiet] = r.pipeline.stages;
  assert.equal(intro.outcome, null);
  assert.equal(signed.name, 'Signed');
  assert.equal(signed.outcome, 'won');
  assert.equal(quiet.outcome, 'lost');
  assert.deepEqual(parseStageLine('Deal gone  [LOST]'), { name: 'Deal gone', outcome: 'lost' });
  // a pipeline needs at least one open stage
  const allMarked = createPipeline([], { name: 'Partners', stages: ['Signed [won]', 'Gone [lost]'] });
  assert.equal(allMarked.ok, false);
  assert.match(allMarked.error, /at least one open stage/);
});

test('a deal that reaches a custom won or lost stage closes like a default one; a custom lost deal keeps its reason; re-opening clears the close', () => {
  const { pipeline } = createPipeline([], { name: 'Partners', stages: ['Intro', 'Signed [won]', 'Went quiet [lost]'] });
  const list = [pipeline];
  const [intro, signed, quiet] = pipeline.stages.map((s) => s.id);
  const outcomeOf = (s) => stageOutcome(list, s);
  const at = new Date(NOW);
  const won = buildDealWrite({ uid: 'u1', email: 'a@x.co', stage: signed, existing: { stage: intro, pipelineId: pipeline.id }, outcomeOf, now: at });
  assert.equal(won.stage, signed);
  assert.equal(won.closedAt, at.toISOString());
  const lost = buildDealWrite({ uid: 'u1', email: 'b@x.co', stage: quiet, lostReason: 'price', existing: { stage: intro, pipelineId: pipeline.id }, outcomeOf, now: at });
  assert.equal(lost.closedAt, at.toISOString());
  assert.equal(lost.lostReason, 'price');
  const reopened = buildDealWrite({ uid: 'u1', email: 'b@x.co', stage: intro, existing: { stage: quiet, pipelineId: pipeline.id, closedAt: at.toISOString(), lostReason: 'price' }, outcomeOf, now: at });
  assert.equal(reopened.closedAt, null);
  assert.equal(reopened.lostReason, null);
});

test('a custom won or lost deal counts in the same revenue, win-rate, monthly and forecast figures as a default one', () => {
  const { pipeline } = createPipeline([], { name: 'Partners', stages: ['Intro', 'Signed [won]', 'Went quiet [lost]'] });
  const list = [pipeline];
  const [, signed, quiet] = pipeline.stages.map((s) => s.id);
  const thisQuarter = new Date(NOW - 5 * DAY_MS).toISOString(); // 21 November 2026
  const lastMonth = '2026-10-15T12:00:00.000Z';
  const make = (t) => [
    { stage: 'closed_won', value: 1000, stageTimes: { closed_won: t } },                              // default won
    { stage: signed, pipelineId: pipeline.id, value: 3000, stageTimes: { [signed]: t } },             // custom won
    { stage: 'closed_lost', value: 500, lostReason: 'price', stageTimes: { closed_lost: t } },        // default lost
    { stage: quiet, pipelineId: pipeline.id, value: 700, lostReason: 'timing', stageTimes: { [quiet]: t } }, // custom lost
  ];
  const figures = dealsWithOutcomes(make(thisQuarter), list);
  assert.equal(quarterForecast({ deals: figures, monthlyTarget: 0, now: NOW }).wonThisQuarter, 4000);
  assert.equal(salesKpis({ deals: figures, now: NOW }).sales.winRatePct, 50); // 2 won of 4 closed
  const monthly = lastMonthWinLoss(dealsWithOutcomes(make(lastMonth), list), NOW);
  assert.equal(monthly.won, 2);
  assert.equal(monthly.wonValue, 4000);
  assert.equal(monthly.lost, 2);
  assert.equal(monthly.winRate, 50);
  // a custom won or lost deal is not open value in its pipeline
  const open = { stage: pipeline.stages[0].id, pipelineId: pipeline.id, value: 400 };
  const [pf] = pipelineForecast({ deals: [...make(thisQuarter), open], pipelines: list, probabilities: {} });
  assert.equal(pf.deals, 1);
  assert.equal(pf.value, 400);
  assert.equal(pf.byStage.find((s) => s.stageId === signed).outcome, 'won');
});

test('a custom pipeline or stage with deals cannot be deleted; the count says why; the default pipeline is never deleted', () => {
  const list = createPipeline([], { name: 'Partners', stages: ['Intro', 'Signed'] }).pipelines;
  const pid = list[0].id;
  const refused = deletePipeline(list, pid, 3);
  assert.equal(refused.ok, false);
  assert.equal(refused.dealCount, 3);
  assert.match(refused.error, /3 deals are in Partners/);
  const gone = deletePipeline(list, pid, 0);
  assert.equal(gone.ok, true);
  assert.equal(gone.pipelines.length, 0);
  assert.equal(deletePipeline(list, DEFAULT_PIPELINE_ID, 0).ok, false);
  // a stage with deals is refused with its count
  const r = createPipeline([], { name: 'Partners', stages: ['Intro', 'Signed [won]', 'Demo'] });
  const [intro, signed] = r.pipeline.stages.map((s) => s.id);
  const stageRefused = deleteStage(r.pipelines, r.pipeline.id, intro, 2);
  assert.equal(stageRefused.ok, false);
  assert.equal(stageRefused.dealCount, 2);
  assert.match(stageRefused.error, /2 deals are at Intro/);
  const stageGone = deleteStage(r.pipelines, r.pipeline.id, signed, 0);
  assert.deepEqual(stageGone.pipelines[0].stages.map((s) => s.name), ['Intro', 'Demo']);
  // a pipeline keeps at least two stages, and at least one open stage
  const two = createPipeline([], { name: 'Two', stages: ['A', 'B'] });
  assert.equal(deleteStage(two.pipelines, two.pipeline.id, two.pipeline.stages[0].id, 0).ok, false);
  const open = createPipeline([], { name: 'Open', stages: ['Open one', 'Won [won]', 'Lost [lost]'] });
  assert.equal(deleteStage(open.pipelines, open.pipeline.id, open.pipeline.stages[0].id, 0).ok, false);
  // deal counts for the screens
  const counts = countDeals([{ pipelineId: pid, stage: intro }, { stage: 'new' }, { stage: 'closed_won' }]);
  assert.equal(counts.byPipeline[pid], 1);
  assert.equal(counts.byPipeline[DEFAULT_PIPELINE_ID], 2);
  assert.equal(counts.byStage[intro], 1);
});

test('moving a deal to another pipeline puts it on that pipeline first stage and logs the move; a stage of another pipeline is still refused', () => {
  const r = createPipeline([], { name: 'Partners', stages: ['Intro', 'Signed'] });
  const list = r.pipelines;
  const pid = r.pipeline.id;
  const first = r.pipeline.stages[0].id;
  const at = new Date(NOW);
  const moved = moveDealToPipeline(list, { pipelineId: undefined }, pid);
  assert.equal(moved.ok, true);
  assert.equal(moved.stage, first);
  const write = buildDealWrite({ uid: 'u1', email: 'a@x.co', stage: 'proposal', existing: { stage: 'proposal', value: 900 }, pipelineMove: moved.pipelineMove, now: at });
  assert.equal(write.stage, first);
  assert.equal(write.pipelineId, pid);
  assert.deepEqual(write.pipelineLog, [{ at: at.toISOString(), from: 'default', to: pid, stage: first }]);
  // back to the default pipeline: its first stage, and no pipelineId
  const back = moveDealToPipeline(list, { pipelineId: pid }, 'default');
  assert.equal(back.stage, 'new');
  const backWrite = buildDealWrite({ uid: 'u1', email: 'a@x.co', stage: first, existing: { stage: first, pipelineId: pid, pipelineLog: write.pipelineLog }, pipelineMove: back.pipelineMove, now: at });
  assert.equal(backWrite.stage, 'new');
  assert.equal(backWrite.pipelineId, null);
  assert.equal(backWrite.pipelineLog.length, 2);
  // refused: already in that pipeline, an unknown pipeline, no pipeline named
  assert.equal(moveDealToPipeline(list, { pipelineId: pid }, pid).ok, false);
  assert.equal(moveDealToPipeline(list, {}, 'pnotthere1').ok, false);
  assert.equal(moveDealToPipeline(list, {}, '').ok, false);
  // a stage change into another pipeline's stage is still refused
  assert.equal(checkStageForDeal(list, { pipelineId: 'default' }, first).ok, false);
  // a lead with no deal record yet is put on the chosen pipeline by its first move
  const fresh = buildDealWrite({ uid: 'u1', email: 'new@x.co', stage: 'contacted', pipelineMove: moved.pipelineMove, now: at });
  assert.equal(fresh.stage, first);
  assert.equal(fresh.pipelineId, pid);
});

test('stall alerts cover custom open stages, name them, skip won or lost custom stages, and keep the old behaviour without the pipelines', () => {
  const r = createPipeline([], { name: 'Partners', stages: ['Intro call', 'Signed [won]'] });
  const [intro, signed] = r.pipeline.stages.map((s) => s.id);
  const since = new Date(NOW - 20 * DAY_MS).toISOString();
  const deals = [
    { email: 'stalled@x.co', stage: intro, pipelineId: r.pipeline.id, stageTimes: { [intro]: since } },
    { email: 'won@x.co', stage: signed, pipelineId: r.pipeline.id, stageTimes: { [signed]: since } },
  ];
  const plan = planStallAlerts({ deals, now: NOW, pipelines: r.pipelines });
  assert.deepEqual(plan.map((a) => a.email), ['stalled@x.co']);
  assert.match(plan[0].task.reason, /In Intro call for 20 days/);
  assert.equal(planStallAlerts({ deals, now: NOW }).length, 0); // without the pipelines a custom stage is not checked
});

test('a stage is shown by its name, never a raw custom id; a removed stage says so', () => {
  const r = createPipeline([], { name: 'Partners', stages: ['Intro call', 'Signed [won]'] });
  const [intro] = r.pipeline.stages.map((s) => s.id);
  assert.equal(stageNameOf(r.pipelines, intro), 'Intro call');
  assert.equal(stageNameOf(r.pipelines, 'proposal'), 'Proposal');
  assert.equal(stageNameOf(r.pipelines, 'pzzzzzzzz_zzzzzzzz'), 'Removed stage');
});
