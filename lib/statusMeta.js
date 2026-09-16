// Single source of truth for how a lead's `status` renders across the app
// (Today view, Pipeline board, Leads table). Keeping this in one place
// means the color/label for "replied" can't drift between pages.

export const PIPELINE_ORDER = [
  'new',
  'drafted',
  'contacted',
  'followup_1',
  'followup_2',
  'followup_3',
  'replied',
  'won',
  'lost',
  'sequence_exhausted',
  'do_not_contact',
];

const META = {
  new: { label: 'New', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-700' },
  drafted: { label: 'Drafted', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800' },
  contacted: { label: 'Contacted', dot: 'bg-indigo-500', badge: 'bg-indigo-50 text-indigo-700' },
  replied: { label: 'Replied', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
  won: { label: 'Won', dot: 'bg-emerald-600', badge: 'bg-emerald-600 text-white' },
  lost: { label: 'Lost', dot: 'bg-rose-400', badge: 'bg-rose-50 text-rose-700' },
  do_not_contact: { label: 'Do not contact', dot: 'bg-slate-300', badge: 'bg-slate-100 text-slate-500' },
  sequence_exhausted: { label: 'Sequence ended', dot: 'bg-slate-300', badge: 'bg-slate-100 text-slate-500' },
};

export function statusMeta(status) {
  if (META[status]) return META[status];
  if (status?.startsWith('followup_')) {
    const n = status.split('_')[1];
    return { label: `Follow-up ${n}`, dot: 'bg-indigo-400', badge: 'bg-indigo-50 text-indigo-700' };
  }
  return { label: status || 'Unknown', dot: 'bg-slate-300', badge: 'bg-slate-100 text-slate-500' };
}

export const SCORE_META = {
  HOT: { label: 'Hot', badge: 'bg-rose-100 text-rose-700' },
  WARM: { label: 'Warm', badge: 'bg-amber-100 text-amber-800' },
  COLD: { label: 'Cold', badge: 'bg-sky-100 text-sky-700' },
  UNSCORED: { label: 'Unscored', badge: 'bg-slate-100 text-slate-500' },
};

// Buckets used by the Pipeline board \u2014 coarser than raw status, because
// "followup_1" vs "followup_2" isn't a distinction an SME owner scanning
// a board needs; they need to see broad progress toward a reply.
export function pipelineColumn(status) {
  if (status === 'new') return 'new';
  if (status === 'drafted') return 'drafted';
  if (status === 'replied') return 'replied';
  if (status === 'won') return 'won';
  if (status === 'lost' || status === 'do_not_contact') return 'closed';
  return 'in_sequence'; // contacted, followup_N, sequence_exhausted
}

export const PIPELINE_COLUMNS = [
  { key: 'new', label: 'New' },
  { key: 'drafted', label: 'Drafted' },
  { key: 'in_sequence', label: 'In sequence' },
  { key: 'replied', label: 'Replied' },
  { key: 'won', label: 'Won' },
  { key: 'closed', label: 'Closed' },
];
