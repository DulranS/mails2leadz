// Pass 346: Autosend stops when the owner's own spam-complaint rate is at or over the 0.3% limit. Counts are typed in from Postmaster
// Tools, saved on Account, checked before each automated run. Pure rule plus wiring checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { complaintVerdict } from '../lib/autosend.js';
import { sanitizeAutopilotSettings } from '../lib/draft-queue.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };

t('a rate at or over 0.3% pauses automated sends', () => {
  const v = complaintVerdict({ delivered: '1000', complaints: '3' });
  assert.equal(v.pause, true);
  assert.match(v.reason, /0\.3% limit/);
  assert.equal(complaintVerdict({ delivered: 1000, complaints: 5 }).pause, true);
});

t('a rate under 0.3% does not pause, even above the 0.1% aim', () => {
  assert.equal(complaintVerdict({ delivered: 1000, complaints: 2 }).pause, false);
  assert.equal(complaintVerdict({ delivered: 1000, complaints: 1 }).pause, false);
});

t('too few delivered messages never pause', () => {
  assert.equal(complaintVerdict({ delivered: 50, complaints: 1 }).pause, false);
});

t('missing or invalid counts never pause', () => {
  assert.equal(complaintVerdict({}).pause, false);
  assert.equal(complaintVerdict({ delivered: '', complaints: '' }).pause, false);
  assert.equal(complaintVerdict({ delivered: 10, complaints: 20 }).pause, false);
});

t('the counts are saved as whole numbers, cleared by a blank, kept when absent', () => {
  const a = sanitizeAutopilotSettings({ postmasterDelivered: '1200', postmasterComplaints: '4' });
  assert.equal(a.postmasterDelivered, 1200);
  assert.equal(a.postmasterComplaints, 4);
  const b = sanitizeAutopilotSettings({ postmasterDelivered: '', postmasterComplaints: '' }, a);
  assert.equal(b.postmasterDelivered, null);
  const c = sanitizeAutopilotSettings({}, a);
  assert.equal(c.postmasterDelivered, 1200);
  const bad = sanitizeAutopilotSettings({ postmasterDelivered: 'twelve', postmasterComplaints: -3 }, a);
  assert.equal(bad.postmasterDelivered, 1200);
  assert.equal(bad.postmasterComplaints, 4);
});

t('the automated run checks the complaint verdict after the bounce check, and stops there', () => {
  const src = fs.readFileSync(new URL('../lib/server/autosend.js', import.meta.url), 'utf8');
  const bounce = src.indexOf('const verdict = shouldPause');
  const complaint = src.indexOf('complaintVerdict({ delivered: cfg.postmasterDelivered');
  assert.ok(bounce > 0 && complaint > bounce, 'complaint check follows the bounce check');
  assert.ok(src.includes("out.stopped = 'complaints'"));
});

t('the Account page saves the counts and says what happens', () => {
  const src = fs.readFileSync(new URL('../app/account/page.js', import.meta.url), 'utf8');
  assert.ok(src.includes('postmasterDelivered: complaintDelivered'));
  assert.ok(src.includes('Save these counts for the Autosend check'));
  assert.ok(src.includes('stops if the rate is at or over 0.3%'));
});

t('the send route stops manual sends at the same limit, with a clear code, and reads the saved counts', () => {
  const src = fs.readFileSync(new URL('../app/api/send-email/route.js', import.meta.url), 'utf8');
  assert.ok(src.includes("complaintVerdict({ delivered: apData.postmasterDelivered"));
  assert.ok(src.includes("code: 'complaints_over'"));
  assert.ok(src.includes("{ status: 409 }"));
});

console.log(`gap-close-346: ${n} checks passed`);
