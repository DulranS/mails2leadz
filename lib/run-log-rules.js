// lib/run-log-rules.js - one owner's automation runs, as the owner sees them (spec 7.3). Pure; no database.
// A run record holds counts and plain status codes only: no customer names, addresses or message text, and no raw error text.
export const RUN_LOG_MAX = 30;
const NOTE_LABELS = {
  no_admin: 'Server database not connected, so nothing ran',
  billing_error: 'Billing step failed (see the Billing page)',
  report_error: 'Weekly report failed to send',
  brief_error: 'Morning brief failed to send',
  brief_gmail_not_connected: 'Morning brief not sent: Gmail is not connected',
  time: 'Stopped early at the time limit; the rest runs tomorrow',
  run_error: 'The run stopped with an error (details are in the server log)',
  invoice_send_gave_up: 'An invoice email failed three times and was not sent: send it from Billing',
  invoice_email_send_failed: 'An invoice email did not send; it will be tried again tomorrow',
};
const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
const clip = (v, n) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** Labels for the codes a run can leave. Unknown codes are shown as a plain phrase, never as raw text. */
export function noteLabel(code) {
  const c = clip(code, 60);
  return NOTE_LABELS[c] || c.replace(/_/g, ' ');
}

/** One stored run. `counts` come from the daily job's own result; `notes` are short codes. */
export function runRecord({ at, ok, counts = {}, notes = [] } = {}) {
  return {
    at: at || new Date().toISOString(),
    status: ok ? 'done' : 'failed',
    invoices: num(counts.invoices),
    invoiceEmails: num(counts.invoiceEmails),
    reminders: num(counts.reminders),
    posts: num(counts.posts),
    report: counts.report === true,
    notes: (Array.isArray(notes) ? notes : []).map((n) => clip(n, 60)).filter(Boolean).slice(0, 12),
  };
}

/** Newest first, capped, each row ready to show. */
export function runsView(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && (r.status === 'done' || r.status === 'failed'))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, RUN_LOG_MAX)
    .map((r) => ({
      at: String(r.at || ''),
      status: r.status,
      summary: [
        `${num(r.invoices)} invoice${num(r.invoices) === 1 ? '' : 's'} made`,
        `${num(r.invoiceEmails)} emailed`,
        `${num(r.reminders)} reminder${num(r.reminders) === 1 ? '' : 's'}`,
        r.report ? 'weekly report sent' : null,
        num(r.posts) ? `${num(r.posts)} post${num(r.posts) === 1 ? '' : 's'} published` : null,
      ].filter(Boolean).join(', '),
      notes: (Array.isArray(r.notes) ? r.notes : []).map(noteLabel),
    }));
}
