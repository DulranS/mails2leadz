// lib/work-mode.js - what AutoLeads is used for: sales and marketing (the default) or recruitment and headhunting.
//
// Only the words change. The data model stays the same: a candidate is a "lead", a role you fill is a "deal", the placement fee
// is the deal value, and the stored stage names do not move. So every report, guard, sync and stage rule keeps working, and the
// sales view is unchanged. Switching back to sales changes the labels only.
import { STAGE_LABELS } from './deal-utils.js';

export const WORK_MODES = ['sales', 'recruitment', 'events'];
export const DEFAULT_WORK_MODE = 'sales';

export function normalizeWorkMode(value) {
  return WORK_MODES.includes(value) ? value : DEFAULT_WORK_MODE;
}

export const WORK_MODE_INFO = {
  sales: {
    label: 'Sales and marketing',
    help: 'Your leads are prospects you contact to sell a product or service.',
  },
  events: {
    label: 'Events and bookings',
    help: 'Your leads are enquiries for an event or a booking, and each deal is a booking you confirm. The deal value is the booking total.',
  },
  recruitment: {
    label: 'Recruitment and headhunting',
    help: 'Your leads are candidates, and each deal is a role you fill. The placement fee is the deal value. Approach people only where you have a lawful reason to contact them, and keep a note of that reason.',
  },
};

// Recruiter words for the same stages. Keys are the stored stage names; the sales words are STAGE_LABELS.
export const RECRUITMENT_STAGE_LABELS = {
  new: 'Sourced',
  contacted: 'Approached',
  qualified: 'Screened',
  demo: 'Interviewed',
  proposal: 'Submitted to client',
  negotiation: 'Offer stage',
  closed_won: 'Placed',
  delivery: 'Guarantee period',
  retention: 'Retained search',
  expansion: 'Repeat client role',
  closed_lost: 'Not placed',
};

// The same pipeline, in events words (pass 331).
export const EVENT_STAGE_LABELS = {
  new: 'Enquiry',
  contacted: 'Responded',
  qualified: 'Call or site visit',
  demo: 'Proposal sent',
  proposal: 'Quote sent',
  negotiation: 'Deposit pending',
  closed_won: 'Confirmed',
  delivery: 'Event delivered',
  retention: 'Final payment',
  expansion: 'Repeat booking',
  closed_lost: 'Not booked',
};

export function stageLabels(mode) {
  const m = normalizeWorkMode(mode);
  if (m === 'recruitment') return RECRUITMENT_STAGE_LABELS;
  if (m === 'events') return EVENT_STAGE_LABELS;
  return STAGE_LABELS;
}

/** The word shown for a stored stage in the owner's chosen mode. Unknown stages show as they are stored. */
export function stageLabel(stage, mode) {
  return stageLabels(mode)[stage] || STAGE_LABELS[stage] || stage;
}

/**
 * The extra instruction added to AI drafts. Sales drafts sell; recruitment drafts must not sell to a candidate or promise a
 * job or a salary. Empty in sales mode, so the sales prompts are byte-for-byte what they were.
 */
export function recruiterRule(mode) {
  if (normalizeWorkMode(mode) !== 'recruitment') return '';
  return 'You are writing to a candidate on behalf of a recruiter about a role. Do not sell to them. Say what the role is in one or two lines, ask whether they are interested, and never promise a job, a salary or an outcome.';
}

/** The system prompt with the recruiter rule added at the end. Unchanged in sales mode. */
export function withRecruiterRule(system, mode) {
  const rule = recruiterRule(mode);
  return rule ? `${system}\n${rule}` : system;
}
