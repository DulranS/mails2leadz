// Google calendar connection (Pass 175): the return address is the one shown to the owner, and a Google redirect mismatch is named.
import assert from 'node:assert/strict';
import { calendarRedirectUriFor, callbackStatusFor } from '../lib/server/calendar-write.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const req = (origin) => ({ nextUrl: { origin } });

t('the return address is the business base address plus the callback path, and an explicit override wins', () => {
  delete process.env.CALENDAR_OFFLINE_REDIRECT_URI;
  process.env.NEXT_PUBLIC_BASE_URL = 'https://mails2leadz.vercel.app/some/path';
  assert.equal(calendarRedirectUriFor(req('https://other.example')), 'https://mails2leadz.vercel.app/api/calendar-offline/callback');
  delete process.env.NEXT_PUBLIC_BASE_URL;
  assert.equal(calendarRedirectUriFor(req('https://here.example')), 'https://here.example/api/calendar-offline/callback');
  process.env.CALENDAR_OFFLINE_REDIRECT_URI = 'https://custom.example/api/calendar-offline/callback';
  assert.equal(calendarRedirectUriFor(req('https://here.example')), 'https://custom.example/api/calendar-offline/callback');
  delete process.env.CALENDAR_OFFLINE_REDIRECT_URI;
});

t('a Google redirect mismatch is named; any other failure stays a generic error', () => {
  assert.equal(callbackStatusFor(new Error('Error 400: redirect_uri_mismatch')), 'redirect_mismatch');
  assert.equal(callbackStatusFor({ response: { data: { error: 'redirect_uri_mismatch' } } }), 'redirect_mismatch');
  assert.equal(callbackStatusFor(new Error('network down')), 'error');
});

console.log(`\n${n} passed`);
