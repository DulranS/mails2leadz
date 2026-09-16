/**
 * lib/leadSourcing.js
 * -------------------
 * "Find businesses on Google Maps" — automated top-of-funnel lead sourcing.
 *
 * Why this calls the Google Places API instead of scraping the Google Maps
 * website directly: scraping Google's own map UI (a) breaks Google's Terms
 * of Service, (b) gets your server IP rate-limited or blocked within
 * minutes at any real volume, and (c) returns brittle, unstructured HTML
 * that changes without notice. The Places API is Google's own supported,
 * ToS-compliant way to programmatically get exactly this data — business
 * name, address, phone, website, category, rating, review count — for a
 * flat, predictable per-request cost with an official uptime guarantee.
 * It's the version of "scrape Google Maps" that a real SaaS can build a
 * paying product on top of without the whole pipeline breaking every time
 * Google tweaks a CSS class.
 *
 * Cost control: Places API "Text Search" is billed per request, not per
 * result, and each request already returns up to 20 places — so one search
 * (~$0.032 at published Google rates, verify current pricing at
 * https://mapsplatform.google.com/pricing) can source ~20 leads. A search
 * with pagination (3 pages) sources up to 60 leads for ~$0.10. That's a
 * rounding error next to a single manual research hour, which is the whole
 * point of this feature.
 */

const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACE_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.internationalPhoneNumber',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.primaryTypeDisplayName',
  'places.businessStatus',
  'nextPageToken',
].join(',');

function getApiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('Missing GOOGLE_PLACES_API_KEY in .env.local — lead sourcing is disabled without it.');
  return key;
}

/**
 * Searches Google Maps business listings for `query` (e.g. "dentists",
 * "plumbers", "boutique hotels") near/in `location` (e.g. "Austin, TX" or
 * "Colombo, Sri Lanka"). Returns up to `maxResults` normalized business
 * records (default 20, max 60 — 3 pages). Never throws for "no results";
 * throws only for a missing/invalid API key or a hard API error, so a
 * caller can distinguish "nothing found" from "misconfigured."
 */
async function searchBusinesses({ query, location, maxResults = 20 }) {
  const apiKey = getApiKey();
  const textQuery = location ? `${query} in ${location}` : query;
  const results = [];
  let pageToken = null;
  let pagesFetched = 0;
  const maxPages = Math.min(3, Math.ceil(maxResults / 20));

  do {
    const body = pageToken
      ? { pageToken }
      : { textQuery, pageSize: Math.min(20, maxResults) };

    const res = await fetch(PLACES_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': PLACE_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Google Places API error (${res.status}): ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    for (const place of data.places || []) {
      results.push(normalizePlace(place));
    }
    pageToken = data.nextPageToken || null;
    pagesFetched++;

    // Google requires a short delay before a page token becomes valid.
    if (pageToken && pagesFetched < maxPages && results.length < maxResults) {
      await new Promise((r) => setTimeout(r, 2000));
    } else {
      pageToken = null;
    }
  } while (pageToken && pagesFetched < maxPages && results.length < maxResults);

  return results.slice(0, maxResults);
}

function normalizePlace(place) {
  return {
    place_id: place.id || null,
    company_name: place.displayName?.text || null,
    address: place.formattedAddress || null,
    phone: place.internationalPhoneNumber || place.nationalPhoneNumber || null,
    website: place.websiteUri || null,
    rating: typeof place.rating === 'number' ? place.rating : null,
    review_count: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
    category: place.primaryTypeDisplayName?.text || null,
    business_status: place.businessStatus || null,
  };
}

module.exports = { searchBusinesses };
