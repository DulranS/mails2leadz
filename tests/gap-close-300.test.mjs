// Pass 300: Autosend can be paused for a set time (1 day, 7 days) and then goes back on by itself (spec 7.8).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { autosendPausedNow, pauseUntilClean, sanitizeAutoSend, autosendStatusLine, autopilotAlert, AUTOSEND_PAUSE_MAX_DAYS } from '../lib/autosend.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.parse('2026-11-15T06:00:00Z');
const DAY = 86400000;

t('not paused when the owner has not paused', () => {
  assert.equal(autosendPausedNow({ autoSendPaused: false, autoSendPausedUntil: new Date(NOW + DAY).toISOString() }, NOW), false);
});

t('a timed pause holds until its end time, then ends', () => {
  const s = { autoSendPaused: true, autoSendPausedUntil: new Date(NOW + DAY).toISOString() };
  assert.equal(autosendPausedNow(s, NOW), true);
  assert.equal(autosendPausedNow(s, NOW + DAY + 1), false);
});

t('a pause with no end time holds until the owner resumes; an unreadable end time is treated as no end', () => {
  assert.equal(autosendPausedNow({ autoSendPaused: true, autoSendPausedUntil: '' }, NOW + 365 * DAY), true);
  assert.equal(autosendPausedNow({ autoSendPaused: true, autoSendPausedUntil: 'soon' }, NOW + 365 * DAY), true);
});

t('the end time is cleaned: unreadable -> empty, far off -> capped at 30 days, a past time is kept so the pause has ended', () => {
  assert.equal(pauseUntilClean('nonsense', NOW), '');
  assert.equal(pauseUntilClean(new Date(NOW + 400 * DAY).toISOString(), NOW), new Date(NOW + AUTOSEND_PAUSE_MAX_DAYS * DAY).toISOString());
  const past = new Date(NOW - DAY).toISOString();
  assert.equal(pauseUntilClean(past, NOW), past);
});

t('the settings keep the end time while paused and clear it when resumed', () => {
  const until = new Date(NOW + 7 * DAY).toISOString();
  const paused = sanitizeAutoSend({ autoSend: true, autoSendPaused: true, autoSendPausedUntil: until }, {});
  assert.equal(paused.autoSendPausedUntil, until);
  const resumed = sanitizeAutoSend({ autoSend: true, autoSendPaused: false, autoSendPausedUntil: until }, paused);
  assert.equal(resumed.autoSendPausedUntil, '');
});

t('the Account line says when a timed pause ends, and says On once it has run out', () => {
  const until = new Date(NOW + DAY).toISOString();
  const line = autosendStatusLine({ autoSend: true, autoSendPaused: true, autoSendPausedUntil: until, autoSendPauseReason: 'You paused it for 1 day.' }, { connected: true, canSend: true, now: NOW });
  assert.match(line, /^Paused until 2026-11-16 06:00 UTC\./);
  const after = autosendStatusLine({ autoSend: true, autoSendPaused: true, autoSendPausedUntil: until, autoSendPauseReason: 'You paused it for 1 day.' }, { connected: true, canSend: true, now: NOW + 2 * DAY });
  assert.ok(!after.startsWith('Paused'), after);
});

t('an expired timed pause does not raise the Today alert', () => {
  const s = { autoSend: true, autoSendPaused: true, autoSendPausedUntil: new Date(NOW - DAY).toISOString(), autoSendPauseReason: 'You paused it for 1 day.' };
  assert.equal(autopilotAlert(s, null, NOW), null);
});

t('the daily send run clears an expired pause before it decides to stop', () => {
  const src = fs.readFileSync('lib/server/autosend.js', 'utf8');
  assert.ok(src.includes('!autosendPausedNow(cfg, now)'));
  assert.ok(src.includes("autoSendPausedUntil: '', updatedAt"));
});

t('Account offers 1 day, 7 days and until resumed, and resume uses the same rule', () => {
  const src = fs.readFileSync('app/account/page.js', 'utf8');
  assert.ok(src.includes('"Pause for 1 day"') && src.includes('"Pause for 7 days"') && src.includes('"Pause until I resume"'));
  assert.ok(src.includes('autosendPausedNow(ap.settings)'));
});

console.log(`gap-close-300: ${n} checks passed`);
