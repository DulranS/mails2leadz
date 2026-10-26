// lib/ops-status.js - is the automation actually running? Reads only what the jobs already record. Pure: no I/O.
// Only features the owner has switched on are checked, so nothing is reported as broken when it was never set up.
const HOUR = 3600000;
export const STALE_HOURS = 26; // the nightly jobs run once a day; a little slack for a late run
const NIGHTLY_SWITCHES = ['autoBilling', 'autoContent', 'weeklyReport', 'dailyBrief', 'autoLearn', 'autoPost'];

/**
 * @param {{ autopilot?: object, connection?: object|null, finder?: object|null, now?: number }} args
 * @returns {{ items: { id: string, label: string, status: 'ok'|'warn'|'problem', detail: string, action: string }[], healthy: boolean }}
 */
export function opsStatus({ autopilot = {}, connection = null, finder = null, now = Date.now() } = {}) {
  const items = [];
  const ap = autopilot || {};
  const hoursAgo = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? (now - t) / HOUR : null; };

  if (NIGHTLY_SWITCHES.some((k) => ap[k] === true)) {
    const h = hoursAgo(ap.lastRunAt);
    if (h === null) items.push({ id: 'nightly', label: 'Nightly routine', status: 'warn', detail: 'It has not run yet. It runs each morning once an Autopilot switch is on.', action: 'Check the switches in Account > Autopilot are saved; it runs tomorrow morning.' });
    else if (h > STALE_HOURS) items.push({ id: 'nightly', label: 'Nightly routine', status: 'warn', detail: `It last ran ${Math.round(h)} hours ago.`, action: 'Open Account > Autopilot and check the switches are still on.' });
    else items.push({ id: 'nightly', label: 'Nightly routine', status: 'ok', detail: `It ran ${Math.round(h)} hours ago.`, action: '' });
  }

  if (connection && connection.status) {
    if (connection.status === 'expired') {
      items.push({ id: 'gmail', label: 'Gmail connection', status: 'problem', detail: connection.lastError || 'Gmail has disconnected.', action: 'Reconnect Gmail in Account.' });
    } else if (ap.autoReplyCheck !== false) {
      const h = hoursAgo(connection.lastCheckAt);
      if (h === null) items.push({ id: 'replies', label: 'Reply check', status: 'warn', detail: 'It has not checked for replies yet.', action: 'It runs each night; check tomorrow. If it still has not run, reconnect Gmail in Account.' });
      else if (h > STALE_HOURS) items.push({ id: 'replies', label: 'Reply check', status: 'warn', detail: `It last checked ${Math.round(h)} hours ago.`, action: 'Open Account and check the Gmail connection.' });
      else items.push({ id: 'replies', label: 'Reply check', status: 'ok', detail: `It checked ${Math.round(h)} hours ago.`, action: '' });
    }
  }

  if (ap.autoPostError) items.push({ id: 'posting', label: 'Automatic posting', status: 'problem', detail: String(ap.autoPostError).slice(0, 160), action: 'Check the posting hook address in Account > Autopilot.' });

  if (finder && finder.enabled && finder.autoFind) {
    const note = String(finder.autoNote || '');
    if (!finder.area) items.push({ id: 'finder', label: 'Find businesses for me', status: 'warn', detail: 'Set your area and auto-find can start.', action: 'Type your area on the Find leads page.' });
    else {
      const broken = /could not suggest|Describe what you sell/.test(note);
      items.push({ id: 'finder', label: 'Find businesses for me', status: broken ? 'warn' : 'ok', detail: note || 'Waiting for the first refresh.', action: broken ? 'Describe what you sell in Account, then it tries again on a later night.' : '' });
    }
  }

  return { items, healthy: items.every((i) => i.status === 'ok') };
}
