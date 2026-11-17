// Work mode (Pass 324): sales is the default and is unchanged; recruitment changes only the words, the stored stages stay the same,
// and the recruiter rule is added to the two candidate-facing AI drafts only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ALL_STAGES, STAGE_LABELS, WON_STAGES, PIPELINE_STAGES, OPEN_STAGES } from '../lib/deal-utils.js';
import { WORK_MODES, DEFAULT_WORK_MODE, normalizeWorkMode, stageLabel, stageLabels, recruiterRule, withRecruiterRule, RECRUITMENT_STAGE_LABELS } from '../lib/work-mode.js';
import { dealHistory } from '../lib/deal-history.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('sales is the default; anything unknown falls back to sales', () => {
  assert.equal(DEFAULT_WORK_MODE, 'sales');
  assert.deepEqual(WORK_MODES, ['sales', 'recruitment']);
  assert.equal(normalizeWorkMode('recruitment'), 'recruitment');
  assert.equal(normalizeWorkMode('bogus'), 'sales');
  assert.equal(normalizeWorkMode(undefined), 'sales');
  assert.equal(normalizeWorkMode(null), 'sales');
});

t('sales words are exactly the existing stage labels (no change for existing accounts)', () => {
  assert.equal(stageLabels('sales'), STAGE_LABELS);
  assert.equal(stageLabels(undefined), STAGE_LABELS);
  for (const s of ALL_STAGES) assert.equal(stageLabel(s, 'sales'), STAGE_LABELS[s], s);
});

t('every stored stage has a recruitment word, and an unknown stage shows as it is stored', () => {
  for (const s of ALL_STAGES) assert.ok(RECRUITMENT_STAGE_LABELS[s], `no recruitment word for ${s}`);
  assert.equal(stageLabel('qualified', 'recruitment'), 'Screened');
  assert.equal(stageLabel('closed_won', 'recruitment'), 'Placed');
  assert.equal(stageLabel('closed_lost', 'recruitment'), 'Not placed');
  assert.equal(stageLabel('negotiation', 'recruitment'), 'Offer stage');
  assert.equal(stageLabel('mystery_stage', 'recruitment'), 'mystery_stage');
});

t('the stored stage rules do not move: won, lost and open sets are the same in both modes', () => {
  assert.ok(WON_STAGES.includes('closed_won'));
  assert.ok(OPEN_STAGES.includes('qualified') && PIPELINE_STAGES.includes('proposal'));
  // the labels differ but the keys are the same set
  assert.deepEqual(Object.keys(RECRUITMENT_STAGE_LABELS).sort(), [...ALL_STAGES].sort());
});

t('the recruiter rule is empty in sales, so the sales AI prompts are unchanged', () => {
  assert.equal(recruiterRule('sales'), '');
  assert.equal(withRecruiterRule('Write a nudge.', 'sales'), 'Write a nudge.');
  assert.equal(withRecruiterRule('Write a nudge.', undefined), 'Write a nudge.');
});

t('the recruiter rule forbids selling to a candidate, promising a job or a salary', () => {
  const r = recruiterRule('recruitment');
  assert.match(r, /candidate/);
  assert.match(r, /Do not sell/);
  assert.match(r, /never promise a job, a salary or an outcome/);
  assert.equal(withRecruiterRule('Write a nudge.', 'recruitment'), `Write a nudge.\n${r}`);
});

t('deal history: sales keeps the old words, recruitment uses the recruiter words, the default is sales', () => {
  const deal = { stage: 'qualified', value: 0, stageTimes: { new: '2026-11-01T09:00:00Z', qualified: '2026-11-05T09:00:00Z' } };
  const sales = dealHistory(deal);
  assert.deepEqual(sales.steps.map((s) => s.label), ['New', 'Qualified']);
  assert.equal(sales.stage, 'Qualified');
  assert.deepEqual(dealHistory(deal, 'sales'), sales);
  const rec = dealHistory(deal, 'recruitment');
  assert.deepEqual(rec.steps.map((s) => s.label), ['Sourced', 'Screened']);
  assert.equal(rec.stage, 'Screened');
  assert.equal(rec.outcome, 'open');
  assert.equal(dealHistory(null, 'recruitment'), null);
});

t('deal history: the stored outcome is the same in both modes', () => {
  const won = { stage: 'closed_won', value: 5000, stageTimes: {} };
  assert.equal(dealHistory(won, 'sales').outcome, 'won');
  assert.equal(dealHistory(won, 'recruitment').outcome, 'won');
  assert.equal(dealHistory(won, 'recruitment').stage, 'Placed');
});

t('the server files that show a stage word take the mode', () => {
  const read = (p) => fs.readFileSync(p, 'utf8');
  assert.match(read('lib/pipeline-alerts.js'), /stageLabel\(stage, mode\)/);
  assert.match(read('lib/pipeline-alerts.js'), /stallDays = STALL_DAYS, mode = 'sales'/);
  assert.match(read('lib/server/pipeline-run.js'), /mode: await workModeFor\(db, uid\)/);
  assert.match(read('lib/customer-timeline.js'), /stageLabel\(stage, mode\)/);
  assert.match(read('lib/server/customer-timeline.js'), /workModeFor\(db, uid\)/);
  assert.match(read('app/api/ai-deal-draft/route.js'), /withRecruiterRule\(system, workMode\)/);
});

t('the screens read the mode live, and the account screen offers the choice', () => {
  const acc = read('app/account/page.js');
  assert.match(acc, /What do you use AutoLeads for\?/);
  assert.match(acc, /\.\.\.\(modeDraft \? \{ workMode: modeDraft \} : \{\}\)/, 'a save writes the mode only after the owner changes it');
  assert.match(acc, /\}, \{ merge: true \}\);/);
  for (const p of ['app/components/CRM.js', 'app/business/page.js', 'app/conversations/page.js', 'app/customers/page.js']) {
    assert.ok(read(p).includes('useWorkMode'), `${p} reads the work mode`);
  }
  assert.match(read('app/components/useWorkMode.js'), /onSnapshot/);
});

function read(p) { return fs.readFileSync(p, 'utf8'); }

console.log(`  ${n} work-mode checks passed`);
