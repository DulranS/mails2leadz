// Server-side search for the prospect finder: place name -> map area -> businesses of one kind in it.
//
// Uses two free public OpenStreetMap services, with no key and no account:
//   - Nominatim (geocoding): one lookup per search, with a User-Agent that names this app, as its usage policy requires
//   - Overpass (map data): one query per search
// Both are shared community services, so a search is one request each, never a loop; the route also limits each business to a
// few searches a day. `fetchImpl` is passed in so the error handling is tested without a network (scripts/verify-prospect-finder.ts).
import {
  bboxFromGeocode, bboxProblem, buildOverpassQuery, categoryByValue, cleanArea, parseOverpass, type Prospect,
} from "./prospectFinder";

export type ProspectSearchResult =
  | { ok: true; prospects: Prospect[]; place: string; categoryLabel: string }
  | { ok: false; status: number; error: string };

const BUSY = "The free map service is busy right now. Nothing was lost: try again in a minute.";

export async function runProspectSearch(params: {
  category: unknown;
  area: unknown;
  fetchImpl: typeof fetch;
  contact?: string; // shown in the User-Agent so the map services can reach the app's operator
  geocodeUrl?: string;
  overpassUrl?: string;
}): Promise<ProspectSearchResult> {
  const cat = categoryByValue(params.category);
  if (!cat) return { ok: false, status: 400, error: "Choose what kind of business to look for." };
  const area = cleanArea(params.area);
  if (!area) return { ok: false, status: 400, error: "Type a city or district, for example Dehiwala, Sri Lanka." };

  const headers = { "User-Agent": `Balancr/1.0 (${params.contact || "business management app"})`, Accept: "application/json" };
  const f = params.fetchImpl;

  // 1. Where is it?
  let place: { boundingbox?: unknown; display_name?: unknown } | undefined;
  try {
    const url = `${params.geocodeUrl ?? "https://nominatim.openstreetmap.org/search"}?format=jsonv2&limit=1&q=${encodeURIComponent(area)}`;
    const res = await f(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { ok: false, status: res.status === 429 ? 503 : 502, error: BUSY };
    const arr = (await res.json()) as unknown;
    place = Array.isArray(arr) ? (arr[0] as typeof place) : undefined;
  } catch {
    return { ok: false, status: 502, error: BUSY };
  }
  if (!place) return { ok: false, status: 404, error: `Couldn't find "${area}" on the map. Try the town name with the country.` };
  const box = bboxFromGeocode(place);
  if (!box) return { ok: false, status: 404, error: `Couldn't work out an area for "${area}". Try the town name with the country.` };
  const tooBig = bboxProblem(box);
  if (tooBig) return { ok: false, status: 400, error: tooBig };
  const query = buildOverpassQuery(cat.value, box);
  if (!query) return { ok: false, status: 400, error: "That search can't be made. Try a different area." };

  // 2. Who is there?
  let json: unknown;
  try {
    const res = await f(params.overpassUrl ?? "https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false, status: res.status === 429 || res.status === 504 ? 503 : 502, error: BUSY };
    json = await res.json();
  } catch {
    return { ok: false, status: 502, error: BUSY };
  }
  const placeName = typeof place.display_name === "string" ? place.display_name.slice(0, 120) : area;
  return { ok: true, prospects: parseOverpass(json), place: placeName, categoryLabel: cat.label };
}
