// lib/worker-categories.js - the kinds of business the lead worker (worker/autoleads_worker.py) understands as a
// proper category search. The AI target finder may ONLY suggest these, so every suggestion becomes a real search
// instead of a weak name match. worker/test_worker.py checks that the worker recognises every term below.

export const WORKER_SEARCH_TERMS = [
  'plumber', 'electrician', 'carpenter', 'painter', 'roofer', 'builder', 'air conditioning', 'welding', 'mechanic', 'car dealer',
  'tyre', 'car wash', 'driving school', 'restaurant', 'cafe', 'bakery', 'bar', 'fast food', 'catering', 'hotel',
  'travel agency', 'dentist', 'doctor', 'pharmacy', 'hospital', 'vet', 'optician', 'physiotherapy', 'laboratory', 'salon',
  'spa', 'gym', 'yoga', 'lawyer', 'accountant', 'insurance', 'estate agent', 'architect', 'engineer', 'consultant',
  'marketing', 'software', 'computer shop', 'mobile phone', 'electronics', 'school', 'kindergarten', 'bank', 'supermarket', 'clothing',
  'tailor', 'shoe', 'jewellery', 'furniture', 'hardware', 'florist', 'book shop', 'printing', 'photographer', 'laundry',
  'cleaning', 'courier', 'event', 'gift shop', 'pet shop', 'motorcycle', 'farm', 'manufacturer', 'ngo', 'church',
];

/** Place text that is safe to show inside a copy-and-paste command: letters, digits, spaces, commas, dots, hyphens only. */
export function cleanLocation(text) {
  return String(text || '').replace(/[^\p{L}\p{N} ,.\-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** The command that runs one search with the worker. `term` must come from WORKER_SEARCH_TERMS. */
export function searchCommand(term, location) {
  const place = cleanLocation(location);
  return `python autoleads_worker.py find -q "${term}"${place ? ` --location "${place}"` : ''}`;
}

/**
 * Turn the AI's JSON into at most `max` valid suggestions. Anything not in the worker's vocabulary is dropped
 * (the AI is told the list, but its answer is never trusted), duplicates removed, text clipped.
 * @returns {{customerProfile:string, targets:Array<{term:string, why:string, command:string}>}}
 */
export function validateTargets(data, location = '', max = 6) {
  const allowed = new Map(WORKER_SEARCH_TERMS.map((t) => [t, t]));
  const seen = new Set();
  const targets = [];
  const list = Array.isArray(data?.targets) ? data.targets : [];
  for (const item of list) {
    const term = String(item?.term || '').trim().toLowerCase();
    if (!allowed.has(term) || seen.has(term)) continue;
    seen.add(term);
    const why = String(item?.why || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    targets.push({ term, why, command: searchCommand(term, location) });
    if (targets.length >= max) break;
  }
  return { customerProfile: String(data?.customerProfile || '').replace(/\s+/g, ' ').trim().slice(0, 300), targets };
}
