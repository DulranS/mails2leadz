// lib/help-center.js - the public help centre shows only the answer library, and only when the owner has switched it on. Pure.
import { cleanLibrary } from './support-bot.js';

/** The entries a customer may see: none unless published; otherwise the cleaned library, as question and answer. */
export function publicHelpEntries(list = [], published = false) {
  if (published !== true) return [];
  return cleanLibrary(list).map((x) => ({ question: x.q, answer: x.a }));
}
