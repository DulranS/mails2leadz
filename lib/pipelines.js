// lib/pipelines.js - custom sales pipelines: up to five per account, the default one included. Pure: no I/O.
// The default pipeline is the fixed sales model in lib/deal-utils.js with its existing stage ids, so existing deals are unchanged.
// Custom pipelines are stored on the account's business settings as `pipelines` (the default is implicit, never stored).
// A custom stage can be marked `won` or `lost` (its `outcome`; open when null). A deal in a won or lost stage counts in the same
// revenue, win-rate and forecast figures as a default won or lost deal (see dealsWithOutcomes).
import { ALL_STAGES, STAGE_LABELS, WON_STAGES, CUSTOM_STAGE_RE, pipelineOfStage, knownStage, normalizeStage } from './deal-utils.js';

export const DEFAULT_PIPELINE_ID = 'default';
export const MAX_PIPELINES = 5; // the default counts, so an account has at most four custom pipelines
export const MAX_CUSTOM_PIPELINES = MAX_PIPELINES - 1;
export const PIPELINE_NAME_LIMITS = { min: 2, max: 40 };
export const STAGE_NAME_LIMITS = { min: 1, max: 40 };
export const STAGE_COUNT_LIMITS = { min: 2, max: 12 };
// The existing model keeps a chance for each fixed stage id only. A custom stage has none, so it uses this default (the same as Qualified).
export const CUSTOM_STAGE_PROBABILITY = 0.25;

const PIPELINE_ID_RE = /^p[a-z0-9]{8}$/;
const TOKEN_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** The default pipeline: the fixed sales stages with their existing ids and labels. Its name and stages cannot be changed. */
export const DEFAULT_PIPELINE = {
  id: DEFAULT_PIPELINE_ID,
  name: 'Default',
  isDefault: true,
  stages: ALL_STAGES.map((id) => ({ id, name: STAGE_LABELS[id] })),
};

const text = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
const r2 = (n) => Math.round(n * 100) / 100;
const plural = (n, one, many) => (n === 1 ? one : many);
const outcomeOfInput = (v) => (v === 'won' || v === 'lost' ? v : null);

/** A name, trimmed and checked against its length. Too long is refused, never cut short. */
export function checkName(raw, limits, what) {
  const name = text(raw);
  if (name.length < limits.min) return { ok: false, error: `${what} needs at least ${limits.min} character${limits.min === 1 ? '' : 's'}.` };
  if (name.length > limits.max) return { ok: false, error: `${what} can be at most ${limits.max} characters (this one is ${name.length}).` };
  return { ok: true, name };
}

/** A typed stage line: "Signed [won]" is the stage Signed, marked won; "Went quiet [lost]" is marked lost; no mark is an open stage. */
export function parseStageLine(raw) {
  const s = text(raw);
  const m = s.match(/^(.*?)\s*\[(won|lost)\]$/i);
  return m ? { name: m[1], outcome: m[2].toLowerCase() } : { name: s, outcome: null };
}
// A stage given as a typed line (string) or as { name, outcome }.
function stageInput(raw) {
  if (raw && typeof raw === 'object') return { name: raw.name, outcome: outcomeOfInput(raw.outcome) };
  return parseStageLine(raw);
}

function token(rand) {
  let s = '';
  for (let i = 0; i < 8; i++) s += TOKEN_CHARS[Math.floor(rand() * TOKEN_CHARS.length) % TOKEN_CHARS.length];
  return s;
}
const idsIn = (list) => new Set(list.flatMap((p) => [p.id, ...p.stages.map((s) => s.id)]));
// A stage id is its pipeline id, "_", and a fresh token (see pipelineOfStage in lib/deal-utils.js).
const freshPipelineId = (used, rand) => { for (let i = 0; i < 50; i++) { const id = `p${token(rand)}`; if (!used.has(id)) return id; } return null; };
const freshStageId = (pipelineId, used, rand) => { for (let i = 0; i < 50; i++) { const id = `${pipelineId}_${token(rand)}`; if (!used.has(id)) return id; } return null; };

/** The custom pipelines read from settings. A malformed one is dropped, and no more than the cap is kept. */
export function sanitizePipelines(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const used = new Set([DEFAULT_PIPELINE_ID]);
  for (const p of raw) {
    if (out.length >= MAX_CUSTOM_PIPELINES) break;
    if (!p || typeof p !== 'object' || !PIPELINE_ID_RE.test(p.id) || used.has(p.id) || !Array.isArray(p.stages)) continue;
    const name = checkName(p.name, PIPELINE_NAME_LIMITS, 'Pipeline name');
    if (!name.ok) continue;
    const stages = [];
    for (const s of p.stages) {
      if (!s || typeof s !== 'object' || !CUSTOM_STAGE_RE.test(s.id) || pipelineOfStage(s.id) !== p.id || used.has(s.id)) continue;
      const sn = checkName(s.name, STAGE_NAME_LIMITS, 'Stage name');
      if (!sn.ok) continue;
      stages.push({ id: s.id, name: sn.name, outcome: outcomeOfInput(s.outcome) });
      used.add(s.id);
    }
    if (stages.length < STAGE_COUNT_LIMITS.min || stages.length > STAGE_COUNT_LIMITS.max) continue;
    used.add(p.id);
    out.push({ id: p.id, name: name.name, stages });
  }
  return out;
}

/** The pipeline a deal is in. A deal with no pipelineId is in the default pipeline. */
export const dealPipelineId = (deal) => (deal?.pipelineId ? String(deal.pipelineId) : DEFAULT_PIPELINE_ID);

/** A pipeline by id (the default one included), or null when there is no such pipeline. */
export function findPipeline(list = [], pipelineId) {
  if (!pipelineId || pipelineId === DEFAULT_PIPELINE_ID) return DEFAULT_PIPELINE;
  return (Array.isArray(list) ? list : []).find((p) => p.id === pipelineId) || null;
}
export const stagesOf = (list, pipelineId) => findPipeline(list, pipelineId)?.stages || [];

/** The custom stage a stage id names, or null (a default stage, or an id that is not in the list). */
export function customStage(list = [], stage) {
  const s = knownStage(stage);
  const pid = s ? pipelineOfStage(s) : null;
  if (!pid) return null;
  const p = (Array.isArray(list) ? list : []).find((x) => x.id === pid);
  return p?.stages.find((x) => x.id === s) || null;
}

/** 'won', 'lost', or null while the stage is open. Default stages: their existing won and lost stages. Custom stages: the owner's mark. */
export function stageOutcome(list = [], stage) {
  const s = knownStage(stage);
  if (!s) return null;
  if (!pipelineOfStage(s)) return WON_STAGES.includes(s) ? 'won' : s === 'closed_lost' ? 'lost' : null;
  return customStage(list, s)?.outcome || null;
}

/** True for a custom stage that is in the list and still open (not marked won or lost). */
export const isOpenCustomStage = (list, stage) => { const st = customStage(list, stage); return !!st && !st.outcome; };

/** The name to show for a stage: the default label, or the custom stage's name. Never a raw custom id. */
export function stageNameOf(list = [], stage) {
  const s = knownStage(stage);
  if (!s) return String(stage ?? '');
  if (!pipelineOfStage(s)) return STAGE_LABELS[s] || s;
  return customStage(list, s)?.name || 'Removed stage';
}

/** A deal's stage must be one of its own pipeline's stages. A stage of another pipeline, or an unknown one, is refused. */
export function checkStageForDeal(list, deal, stage) {
  const s = knownStage(stage);
  if (!s) return { ok: false, error: 'Unknown stage.' };
  if (!stagesOf(list, dealPipelineId(deal)).some((x) => x.id === s)) {
    return { ok: false, error: "That stage is not in this deal's pipeline. A deal moves only within its own pipeline; to change pipeline, use the pipeline choice." };
  }
  return { ok: true, stage: s };
}

/**
 * Moves a deal to another pipeline. It goes to that pipeline's FIRST stage. Pure: the caller saves it with buildDealWrite
 * (pipelineMove), which logs the move on the deal. Refused for the pipeline the deal is already in, or an unknown one.
 */
export function moveDealToPipeline(list = [], deal = {}, targetPipelineId) {
  const to = String(targetPipelineId || '');
  if (!to) return { ok: false, error: 'Choose the pipeline to move the deal to.' };
  const target = findPipeline(list, to);
  if (!target) return { ok: false, error: 'That pipeline is not on this account.' };
  if (dealPipelineId(deal) === target.id) return { ok: false, error: 'The deal is already in that pipeline.' };
  const first = target.stages[0];
  if (!first) return { ok: false, error: 'That pipeline has no stages.' };
  return { ok: true, toName: target.name, stage: first.id, pipelineMove: { to: target.id, stage: first.id } };
}

/** A new custom pipeline with its stages (two to twelve lines). A stage line may end in [won] or [lost]. The account keeps at most five pipelines, the default included. */
export function createPipeline(list = [], { name, stages = [] } = {}, rand = Math.random) {
  if (list.length >= MAX_CUSTOM_PIPELINES) return { ok: false, error: `An account has at most ${MAX_PIPELINES} pipelines, the default one included.` };
  const n = checkName(name, PIPELINE_NAME_LIMITS, 'Pipeline name');
  if (!n.ok) return n;
  const names = Array.isArray(stages) ? stages : [];
  if (names.length < STAGE_COUNT_LIMITS.min) return { ok: false, error: `A pipeline needs at least ${STAGE_COUNT_LIMITS.min} stages.` };
  if (names.length > STAGE_COUNT_LIMITS.max) return { ok: false, error: `A pipeline can have at most ${STAGE_COUNT_LIMITS.max} stages.` };
  const used = idsIn([DEFAULT_PIPELINE, ...list]);
  const id = freshPipelineId(used, rand);
  if (!id) return { ok: false, error: 'Could not make a new pipeline. Try again.' };
  used.add(id);
  const built = [];
  for (const raw of names) {
    const item = stageInput(raw);
    const sn = checkName(item.name, STAGE_NAME_LIMITS, 'Stage name');
    if (!sn.ok) return sn;
    const sid = freshStageId(id, used, rand);
    if (!sid) return { ok: false, error: 'Could not make a new stage. Try again.' };
    used.add(sid);
    built.push({ id: sid, name: sn.name, outcome: item.outcome });
  }
  if (!built.some((s) => !s.outcome)) return { ok: false, error: 'A pipeline needs at least one open stage, one with no [won] or [lost] mark.' };
  const pipeline = { id, name: n.name, stages: built };
  return { ok: true, pipeline, pipelines: [...list, pipeline] };
}

/** Renames a custom pipeline. The default pipeline keeps its name. */
export function renamePipeline(list = [], pipelineId, name) {
  if (pipelineId === DEFAULT_PIPELINE_ID) return { ok: false, error: 'The default pipeline keeps its name and stages.' };
  const idx = list.findIndex((p) => p.id === pipelineId);
  if (idx < 0) return { ok: false, error: 'Pipeline not found.' };
  const n = checkName(name, PIPELINE_NAME_LIMITS, 'Pipeline name');
  if (!n.ok) return n;
  return { ok: true, pipelines: list.map((p, i) => (i === idx ? { ...p, name: n.name } : p)) };
}

/** Moves a custom pipeline to a new position in the list (the default pipeline stays first and cannot move). */
export function movePipeline(list = [], pipelineId, toIndex) {
  if (pipelineId === DEFAULT_PIPELINE_ID) return { ok: false, error: 'The default pipeline stays first.' };
  const from = list.findIndex((p) => p.id === pipelineId);
  if (from < 0) return { ok: false, error: 'Pipeline not found.' };
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= list.length) return { ok: false, error: 'That position is not in the list.' };
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(toIndex, 0, moved);
  return { ok: true, pipelines: next };
}

/**
 * Deletes a custom pipeline. Refused while it still has deals (dealCount, from the deals the screen has loaded): the owner moves
 * them first. The default pipeline cannot be deleted.
 */
export function deletePipeline(list = [], pipelineId, dealCount = 0) {
  if (pipelineId === DEFAULT_PIPELINE_ID) return { ok: false, error: 'The default pipeline cannot be deleted.' };
  const p = list.find((x) => x.id === pipelineId);
  if (!p) return { ok: false, error: 'Pipeline not found.' };
  const n = Math.max(0, Number(dealCount) || 0);
  if (n > 0) {
    return { ok: false, dealCount: n, error: `${n} ${plural(n, 'deal is', 'deals are')} in ${p.name}. Move ${plural(n, 'it', 'them')} to another pipeline first, then delete it.` };
  }
  return { ok: true, pipelines: list.filter((x) => x.id !== pipelineId) };
}

// Stage edits share one shape: find the pipeline, change its stages, return the whole list. The default pipeline's stages are fixed.
function editStages(list = [], pipelineId, change) {
  if (pipelineId === DEFAULT_PIPELINE_ID) return { ok: false, error: 'The default pipeline keeps its stages.' };
  const idx = list.findIndex((p) => p.id === pipelineId);
  if (idx < 0) return { ok: false, error: 'Pipeline not found.' };
  const r = change(list[idx].stages);
  if (!r.ok) return r;
  return { ok: true, pipelines: list.map((p, i) => (i === idx ? { ...p, stages: r.stages } : p)) };
}

/** Adds a stage to the end of a custom pipeline (at most twelve). The input is a name, optionally ending in [won] or [lost]. */
export function addStage(list = [], pipelineId, input, rand = Math.random) {
  return editStages(list, pipelineId, (stages) => {
    if (stages.length >= STAGE_COUNT_LIMITS.max) return { ok: false, error: `A pipeline can have at most ${STAGE_COUNT_LIMITS.max} stages.` };
    const item = stageInput(input);
    const n = checkName(item.name, STAGE_NAME_LIMITS, 'Stage name');
    if (!n.ok) return n;
    const sid = freshStageId(pipelineId, idsIn(list), rand);
    if (!sid) return { ok: false, error: 'Could not make a new stage. Try again.' };
    return { ok: true, stages: [...stages, { id: sid, name: n.name, outcome: item.outcome }] };
  });
}

/** Renames a stage. Its id does not change, so deals in it stay in it. */
export function renameStage(list = [], pipelineId, stageId, name) {
  return editStages(list, pipelineId, (stages) => {
    const idx = stages.findIndex((s) => s.id === stageId);
    if (idx < 0) return { ok: false, error: 'Stage not found.' };
    const n = checkName(name, STAGE_NAME_LIMITS, 'Stage name');
    if (!n.ok) return n;
    return { ok: true, stages: stages.map((s, i) => (i === idx ? { ...s, name: n.name } : s)) };
  });
}

/** Moves a stage to a new position in its pipeline. Ids do not change. */
export function moveStage(list = [], pipelineId, stageId, toIndex) {
  return editStages(list, pipelineId, (stages) => {
    const from = stages.findIndex((s) => s.id === stageId);
    if (from < 0) return { ok: false, error: 'Stage not found.' };
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= stages.length) return { ok: false, error: 'That position is not in the list.' };
    const next = [...stages];
    const [moved] = next.splice(from, 1);
    next.splice(toIndex, 0, moved);
    return { ok: true, stages: next };
  });
}

/**
 * Deletes a custom stage. Refused while deals are in it (dealCount): the owner moves them first. A pipeline keeps at least two
 * stages and at least one open stage.
 */
export function deleteStage(list = [], pipelineId, stageId, dealCount = 0) {
  return editStages(list, pipelineId, (stages) => {
    const st = stages.find((s) => s.id === stageId);
    if (!st) return { ok: false, error: 'Stage not found.' };
    const n = Math.max(0, Number(dealCount) || 0);
    if (n > 0) {
      return { ok: false, dealCount: n, error: `${n} ${plural(n, 'deal is', 'deals are')} at ${st.name}. Move ${plural(n, 'it', 'them')} to another stage first, then delete it.` };
    }
    if (stages.length <= STAGE_COUNT_LIMITS.min) return { ok: false, error: `A pipeline needs at least ${STAGE_COUNT_LIMITS.min} stages. Add one before you delete this one.` };
    if (!st.outcome && stages.filter((s) => !s.outcome).length <= 1) return { ok: false, error: 'A pipeline needs at least one open stage. Add an open stage before you delete this one.' };
    return { ok: true, stages: stages.filter((s) => s.id !== stageId) };
  });
}

/** Deal counts for the screens: by pipeline and by stage, from deals shaped { pipelineId, stage }. */
export function countDeals(deals = []) {
  const byPipeline = {};
  const byStage = {};
  for (const d of Array.isArray(deals) ? deals : []) {
    if (!d) continue;
    const pid = dealPipelineId(d);
    const s = normalizeStage(d.stage);
    byPipeline[pid] = (byPipeline[pid] || 0) + 1;
    byStage[s] = (byStage[s] || 0) + 1;
  }
  return { byPipeline, byStage };
}

/**
 * The deals as the revenue, win-rate and forecast figures read them: a deal in a custom won or lost stage counts as the default
 * won or lost stage, so those figures are the same whichever pipeline a deal is in. Returns copies; nothing is written.
 */
export function dealsWithOutcomes(deals = [], list = []) {
  return (Array.isArray(deals) ? deals : []).map((d) => {
    if (!d) return d;
    const stage = normalizeStage(d.stage);
    if (!pipelineOfStage(stage)) return d;
    const o = stageOutcome(list, stage);
    if (!o) return d;
    const to = o === 'won' ? 'closed_won' : 'closed_lost';
    const times = d.stageTimes && typeof d.stageTimes === 'object' ? d.stageTimes : {};
    return { ...d, stage: to, stageTimes: { ...times, [to]: times[stage] || times[to] } };
  });
}

/**
 * The open value of each CUSTOM pipeline, weighted by each stage's chance. The default pipeline keeps quarterForecast.
 * probabilities are fractions (0 to 1), keyed by stage id, as in the business settings. A custom stage has no chance of its own yet,
 * so it uses CUSTOM_STAGE_PROBABILITY unless one is given for its id. Deals in a won or lost stage are not open, so they are not counted.
 */
export function pipelineForecast({ deals = [], pipelines = [], probabilities = {} } = {}) {
  const rows = Array.isArray(deals) ? deals : [];
  return sanitizePipelines(pipelines).map((p) => {
    const byStage = p.stages.map((s) => {
      const given = Number(probabilities?.[s.id]);
      const probability = Number.isFinite(given) && given >= 0 && given <= 1 ? given : CUSTOM_STAGE_PROBABILITY;
      return { stageId: s.id, name: s.name, outcome: s.outcome, probability, deals: 0, value: 0 };
    });
    const index = new Map(byStage.map((r) => [r.stageId, r]));
    for (const d of rows) {
      if (!d || dealPipelineId(d) !== p.id) continue;
      const row = index.get(d.stage);
      if (!row) continue;
      row.deals += 1;
      row.value += Number(d.value) > 0 ? Number(d.value) : 0;
    }
    const open = byStage.filter((r) => !r.outcome);
    const total = (list, f) => list.reduce((a, r) => a + f(r), 0);
    return {
      pipelineId: p.id,
      name: p.name,
      deals: total(open, (r) => r.deals),
      value: r2(total(open, (r) => r.value)),
      weighted: r2(total(open, (r) => r.value * r.probability)),
      byStage: byStage.map((r) => ({
        stageId: r.stageId, name: r.name, outcome: r.outcome,
        probability: r.outcome ? null : r.probability, deals: r.deals, value: r2(r.value),
        weighted: r.outcome ? 0 : r2(r.value * r.probability),
      })),
      note: 'Custom stages use the default chance until you set one. Won and lost deals are not in the open value.',
    };
  });
}
