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

const { getSupabase } = require('./supabase');

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

// How long a (query, location) search result is reused before a repeat
// search pays for a fresh Places API call again. Short on purpose — this
// exists to absorb an accidental double-click or a quick re-run while
// reviewing results, not to serve stale business listings. See the
// `places_search_cache` table comment in database/schema.sql for why the
// once-a-day automated sourcing cron is deliberately NOT affected by this.
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function cacheKeyFor(query, location, maxResults) {
  return `${query.trim().toLowerCase()}|${(location || '').trim().toLowerCase()}|${maxResults}`;
}

async function readCache(key) {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('places_search_cache')
      .select('results, fetched_at')
      .eq('cache_key', key)
      .maybeSingle();
    if (!data) return null;
    const age = Date.now() - new Date(data.fetched_at).getTime();
    if (age > CACHE_TTL_MS) return null;
    return data.results;
  } catch (err) {
    // A cache lookup failure should never block a real search.
    console.error('places search cache read failed (non-fatal):', err.message);
    return null;
  }
}

async function writeCache(key, results) {
  try {
    const supabase = getSupabase();
    await supabase
      .from('places_search_cache')
      .upsert({ cache_key: key, results, fetched_at: new Date().toISOString() }, { onConflict: 'cache_key' });
  } catch (err) {
    console.error('places search cache write failed (non-fatal):', err.message);
  }
}

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
 *
 * Checks a short-TTL cache first (see CACHE_TTL_MS above) — a real cache
 * hit skips the paid API call entirely.
 */
async function searchBusinesses({ query, location, maxResults = 20 }) {
  const cacheKey = cacheKeyFor(query, location, maxResults);
  const cached = await readCache(cacheKey);
  if (cached) return cached;

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

  const final = results.slice(0, maxResults);
  await writeCache(cacheKey, final);
  return final;
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
