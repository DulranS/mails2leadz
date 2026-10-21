// lib/sops.js - standard operating procedures: how each part of the business is done, written down so someone else (or the app)
// can do it. A business that lives in your head is a job. Stored in users/{uid}/settings/sops. Pure helpers here.

export const PROCESSES = [
  { id: 'outreach', label: 'Finding and contacting leads' },
  { id: 'sales', label: 'Replying and closing' },
  { id: 'onboarding', label: 'Onboarding new customers' },
  { id: 'delivery', label: 'Delivering the work or product' },
  { id: 'billing', label: 'Invoicing and collecting' },
  { id: 'support', label: 'Support and retention' },
];
export const OWNERS = [
  { id: 'me', label: 'Me' },
  { id: 'team', label: 'Someone else' },
  { id: 'automated', label: 'Automated' },
];
export const LIMITS = { sops: 24, steps: 14, title: 80, step: 220 };
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export function sanitizeSops(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const s of list) {
    if (!s || typeof s !== 'object') continue;
    const title = clean(s.title, LIMITS.title);
    if (!title) continue;
    const steps = (Array.isArray(s.steps) ? s.steps : []).map((x) => clean(x, LIMITS.step)).filter(Boolean).slice(0, LIMITS.steps);
    out.push({
      id: clean(s.id, 40) || `s${out.length}`,
      process: PROCESSES.some((p) => p.id === s.process) ? s.process : 'delivery',
      title, steps,
      owner: OWNERS.some((o) => o.id === s.owner) ? s.owner : 'me',
      reviewedAt: typeof s.reviewedAt === 'string' && !Number.isNaN(Date.parse(s.reviewedAt)) ? s.reviewedAt : null,
    });
    if (out.length >= LIMITS.sops) break;
  }
  return out;
}

/** Documented = at least 3 real steps. Handed over = documented AND owned by someone else or automated (not still "me"). */
export const isDocumented = (s) => !!s && Array.isArray(s.steps) && s.steps.length >= 3;
export const isHanded = (s) => isDocumented(s) && s.owner !== 'me';

export function computeSopCoverage(sops) {
  const list = sanitizeSops(sops);
  const byProcess = {};
  for (const p of PROCESSES) {
    const mine = list.filter((s) => s.process === p.id);
    byProcess[p.id] = { total: mine.length, documented: mine.some(isDocumented), handed: mine.some(isHanded) };
  }
  const ids = PROCESSES.map((p) => p.id);
  return {
    byProcess,
    total: list.length,
    documentedProcesses: ids.filter((id) => byProcess[id].documented).length,
    handedProcesses: ids.filter((id) => byProcess[id].handed).length,
    processes: ids.length,
  };
}

/** Starting points that use the app's own screens. The owner edits them to match how THEY work; nothing here is a rule. */
export function starterSops() {
  const mk = (process, title, steps, owner = 'me') => ({ id: `starter-${process}`, process, title, steps, owner, reviewedAt: null });
  return [
    mk('outreach', 'Weekly outreach routine', [
      'Open Lead Inbox. Press Find leads now for this week\'s target (kind of business and place).',
      'Skim the leads shown. Untick anything that is not a fit, then load the rest into Dashboard.',
      'Open Dashboard. Review the drafted emails. Edit any that sound off, then send, or leave autopilot on.',
      'Friday: open Business Value and read the weekly numbers. Change next week\'s target if replies are low.',
    ]),
    mk('sales', 'Replying and closing', [
      'Open Conversations once a day. Reply to anyone waiting, using the AI draft as a starting point.',
      'When someone is interested, move them to Qualified in CRM and fill in what they need and their budget.',
      'Send a proposal from the deal. Follow up using the due follow-ups list until yes or a clear no.',
      'On a yes, mark the deal won. On a no, record the reason so the numbers can learn from it.',
    ]),
    mk('onboarding', 'Onboarding a new customer', [
      'Open Customers. Send the welcome message within one day of the win.',
      'Book the kick-off and tick it off once done.',
      'Deliver the first result and tick that off: this is when the customer counts as activated.',
      'Check in after two weeks. Fix any issue before asking for anything.',
    ]),
    mk('delivery', 'Delivering the work or product', [
      'Write here exactly what you do for a customer, in order, as if briefing a new hire.',
      'Add what good looks like for each step, and the most common mistake.',
      'Add where the files, logins and templates live so nobody has to ask you.',
    ]),
    mk('billing', 'Invoicing and collecting', [
      'Open Billing. Create the invoice the day the work starts or the product ships.',
      'Send it. Record each payment as it arrives.',
      'For anything overdue, send the reminder from Billing. Phone after the second reminder.',
      'Record what it cost to deliver on the customer so profit is right.',
    ]),
    mk('support', 'Support and retention', [
      'Log every customer issue in Customers so none is lost. Answer within one working day.',
      'Check Customers once a week for at-risk customers and renewals coming up.',
      'After 14 days of a good result, ask how it went. After a good answer, ask for an introduction.',
    ]),
  ];
}
