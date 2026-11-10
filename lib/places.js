// lib/places.js - Google Places (New) text search, for finding local businesses to contact. Pure: the request and the reply. Official API; no scraping.
export const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
export const PLACES_FIELDS = 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber';
export const MAX_RESULTS = 20;

export function placesRequest(textQuery, max = MAX_RESULTS) {
  const n = Number(max);
  const count = Number.isFinite(n) ? n : MAX_RESULTS;
  return { textQuery: String(textQuery).slice(0, 120), maxResultCount: Math.min(MAX_RESULTS, Math.max(1, Math.floor(count))) };
}

/** Places reply -> rows for the lead-list import ("Business name", "Website", "Phone", "Address"). */
export function placesToRows(json) {
  return (json?.places || []).map((p) => ({
    'Business name': String(p.displayName?.text || '').slice(0, 160),
    Website: String(p.websiteUri || ''),
    Phone: String(p.nationalPhoneNumber || ''),
    Address: String(p.formattedAddress || '').slice(0, 200),
  })).filter((r) => r['Business name']);
}

/** Saved searches the owner writes, one per line (up to three). */
export function parseQueries(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 3 && l.length <= 120).slice(0, 3);
}
