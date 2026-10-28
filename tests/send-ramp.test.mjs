import test from 'node:test';
import assert from 'node:assert/strict';
import { rampCap } from '../lib/send-ramp.js';

const DAY = 86400000;
const START = Date.UTC(2026, 9, 1);
const at = (d) => START + d * DAY;

test('a brand-new account starts at 20 a day and rises in weekly steps', () => {
  assert.equal(rampCap(START, at(0)), 20);
  assert.equal(rampCap(START, at(6)), 20);
  assert.equal(rampCap(START, at(7)), 50);
  assert.equal(rampCap(START, at(14)), 100);
  assert.equal(rampCap(START, at(21)), 200);
});

test('after four weeks the ramp adds no limit of its own', () => {
  assert.equal(rampCap(START, at(28)), Infinity);
  assert.equal(rampCap(START, at(400)), Infinity);
});

test('an account that has never sent is treated as brand new', () => {
  assert.equal(rampCap(null, at(100)), 20);
});
