// lib/crm-bulk.js - bulk actions on the CRM list (pass 404) and saved list views. Pure: rules and plans only, nothing is written here.
// Bulk actions: move many deals to one open stage, add or remove tags. Won and lost are not bulk moves: those close a deal and need its
// details (a lost reason, the closing figures), so they are done one deal at a time.
// Saved views: a named search and filter. The page keeps them in this browser only (see app/components/CRM.js).
import { normalizeStage, knownStage, pipelineOfStage } from './deal-utils.js';
import { customStage, stageOutcome, DEFAULT_PIPELINE_ID } from './pipelines.js';
import { sanitizeTags, TAG_MAX } from './contact-tags.js';

export const BULK_MAX = 200;
export const VIEW_MAX = 10;
export const VIEW_NAME_LEN = 40;
export const VIEW_FILTERS = ['all', 'hot', 'replied', 'followup', 'new'];
const SEARCH_LEN = 100;

/** The distinct, lowercase, well-formed emails in a selection. Anything without an @ is dropped. */
export function selectedEmails(list = []) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const e = String(raw ?? '').trim().toLowerCase();
    if (e.includes('@') && !out.includes(e)) out.push(e);
  }
  return out;
}

/**
 * Moves many deals to one open stage. Every deal must be in the target stage's pipeline (a deal moves only within its own pipeline).
 * A deal already in that stage is left out. Returns { ok, error, changes: [{ email, stage }], unchanged }.
 */
export function planBulkStage({ emails = [], stage, dealPipelines = {}, dealStages = {}, pipelines = [] } = {}) {
  const list = selectedEmails(emails);
  if (list.length === 0) return { ok: false, error: 'Select at least one deal.', changes: [], unchanged: 0 };
  if (list.length > BULK_MAX) return { ok: false, error: `Bulk changes are limited to ${BULK_MAX} deals at a time.`, changes: [], unchanged: 0 };
  const target = knownStage(stage);
  if (!target) return { ok: false, error: 'That stage is not recognised.', changes: [], unchanged: 0 };
  const outcome = stageOutcome(pipelines, target);
  if (outcome === 'won' || outcome === 'lost') {
    return { ok: false, error: 'Mark deals won or lost one at a time, so the closing details are recorded.', changes: [], unchanged: 0 };
  }
  const targetPipeline = pipelineOfStage(target) || DEFAULT_PIPELINE_ID;
  if (targetPipeline !== DEFAULT_PIPELINE_ID && !customStage(pipelines, target)) {
    return { ok: false, error: 'That stage is no longer in its pipeline.', changes: [], unchanged: 0 };
  }
  const elsewhere = list.filter((e) => (dealPipelines[e] || DEFAULT_PIPELINE_ID) !== targetPipeline);
  if (elsewhere.length > 0) {
    return { ok: false, error: `${elsewhere.length} of the selected deals are in another pipeline. A deal moves only within its own pipeline.`, changes: [], unchanged: 0 };
  }
  const changes = [];
  let unchanged = 0;
  for (const e of list) {
    if (normalizeStage(dealStages[e]) === target) { unchanged++; continue; }
    changes.push({ email: e, stage: target });
  }
  return { ok: true, error: '', changes, unchanged };
}

/**
 * Adds and removes tags on many contacts. Tags are cleaned with sanitizeTags; a contact that would go over TAG_MAX is left out and
 * counted in `capped`. Returns { ok, error, changes: [{ email, tags }], unchanged, capped }.
 */
export function planBulkTags({ emails = [], add = [], remove = [], currentTags = {} } = {}) {
  const list = selectedEmails(emails);
  if (list.length === 0) return { ok: false, error: 'Select at least one deal.', changes: [], unchanged: 0, capped: 0 };
  if (list.length > BULK_MAX) return { ok: false, error: `Bulk changes are limited to ${BULK_MAX} deals at a time.`, changes: [], unchanged: 0, capped: 0 };
  const toAdd = sanitizeTags(add);
  const toRemove = sanitizeTags(remove);
  if (toAdd.length === 0 && toRemove.length === 0) return { ok: false, error: 'Type a tag to add or remove.', changes: [], unchanged: 0, capped: 0 };
  const changes = [];
  let unchanged = 0;
  let capped = 0;
  for (const e of list) {
    const before = sanitizeTags(currentTags[e] || []);
    const kept = before.filter((t) => !toRemove.includes(t));
    const union = [...kept];
    for (const t of toAdd) if (!union.includes(t)) union.push(t);
    if (union.length > TAG_MAX) { capped++; continue; }
    const same = union.length === before.length && union.every((t, i) => t === before[i]);
    if (same) { unchanged++; continue; }
    changes.push({ email: e, tags: union });
  }
  return { ok: true, error: '', changes, unchanged, capped };
}

/** A saved view, cleaned: a name, a search text and one of the list filters. Returns { ok, error, view }. */
export function validateView(input = {}) {
  const name = String(input?.name ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, error: 'Name the view.' };
  if (name.length > VIEW_NAME_LEN) return { ok: false, error: `The name can be ${VIEW_NAME_LEN} characters at most.` };
  const filter = VIEW_FILTERS.includes(input?.filter) ? input.filter : 'all';
  const search = String(input?.search ?? '').trim().slice(0, SEARCH_LEN);
  return { ok: true, error: '', view: { name, search, filter } };
}

/** Adds a view. Names are unique without regard to case, and there is a limit on how many views are kept. */
export function addView(list = [], input = {}) {
  const checked = validateView(input);
  if (!checked.ok) return { ok: false, error: checked.error, list };
  const current = parseViews(list);
  if (current.some((v) => v.name.toLowerCase() === checked.view.name.toLowerCase())) {
    return { ok: false, error: 'A view with that name already exists.', list: current };
  }
  if (current.length >= VIEW_MAX) return { ok: false, error: `You can keep ${VIEW_MAX} views. Delete one first.`, list: current };
  return { ok: true, error: '', list: [...current, checked.view] };
}

export function removeView(list = [], name = '') {
  const key = String(name).trim().toLowerCase();
  return parseViews(list).filter((v) => v.name.toLowerCase() !== key);
}

/** Reads a stored list of views, dropping anything malformed. Never throws. */
export function parseViews(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const checked = validateView(item);
    if (checked.ok && !out.some((v) => v.name.toLowerCase() === checked.view.name.toLowerCase())) out.push(checked.view);
    if (out.length >= VIEW_MAX) break;
  }
  return out;
}
