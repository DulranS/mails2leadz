// Route planning (v319): puts a driver's delivery stops in a sensible order. Each customer address is located once with the Google
// Geocoding API, the distances between the business (the depot) and the stops come from the Google Distance Matrix API, and a
// nearest-neighbour pass gives the visiting order. The order is a suggestion for the driver: nothing is changed on any order.
//
// Keys: GOOGLE_MAPS_KEY is read on the server only. Without it planRoute answers { configured: false } and makes no call. The key is
// sent in the request URL to Google (the only place Google accepts it) and is never put in an error message, a result or a log.
// fetch is passed in, so the verifier can mock every call. Pure otherwise.

export const MAX_ROUTE_STOPS = 9; // the depot plus 9 stops is 10 points, a 10 x 10 matrix (100 elements, Google's limit per request)
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json";

export interface Point { lat: number; lng: number }
export interface RouteStop { id: string; name: string; address: string }

/** The visiting order (indices into the matrix, not counting `start`) from nearest-neighbour. Ties go to the lower index. A stop
 * that cannot be reached (infinite distance) goes last, in index order. */
export function nearestNeighbourOrder(matrix: number[][], start = 0): number[] {
  const n = matrix.length;
  const todo = new Set<number>();
  for (let i = 0; i < n; i++) if (i !== start) todo.add(i);
  const order: number[] = [];
  let at = start;
  while (todo.size > 0) {
    let best = -1;
    let bestDist = Infinity;
    for (const j of [...todo].sort((a, b) => a - b)) {
      const d = matrix[at]?.[j];
      const v = typeof d === "number" && Number.isFinite(d) ? d : Infinity;
      if (best === -1 || v < bestDist) {
        best = j;
        bestDist = v;
      }
    }
    order.push(best);
    todo.delete(best);
    at = best;
  }
  return order;
}

/** Metres along the order, from start, and back to start at the end. Unreachable legs make the total Infinity. */
export function routeMetres(matrix: number[][], start: number, order: number[]): { legs: number[]; returnLeg: number; total: number } {
  const legs: number[] = [];
  let at = start;
  for (const j of order) {
    legs.push(matrix[at]?.[j] ?? Infinity);
    at = j;
  }
  const returnLeg = matrix[at]?.[start] ?? Infinity;
  const total = [...legs, returnLeg].reduce((t, x) => t + x, 0);
  return { legs, returnLeg, total };
}

export function geocodeUrl(address: string, key: string): string {
  return `${GEOCODE_URL}?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}`;
}

/** The distance matrix for points given as "lat,lng" (a square: every point is an origin and a destination). */
export function distanceMatrixUrl(points: Point[], key: string): string {
  const joined = points.map((p) => `${p.lat},${p.lng}`).join("|");
  return `${MATRIX_URL}?origins=${encodeURIComponent(joined)}&destinations=${encodeURIComponent(joined)}&units=metric&key=${encodeURIComponent(key)}`;
}

/** The location from a geocode answer, or null when Google found nothing (or the answer is not what was expected). */
export function parseGeocode(json: unknown): Point | null {
  const j = json as { status?: string; results?: Array<{ geometry?: { location?: { lat?: unknown; lng?: unknown } } }> } | null;
  if (!j || j.status !== "OK" || !j.results?.length) return null;
  const loc = j.results[0].geometry?.location;
  if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;
  return { lat: loc.lat, lng: loc.lng };
}

/** The n x n matrix of metres from a distance matrix answer. An element Google could not route becomes Infinity. Null when the shape is wrong. */
export function parseDistanceMatrix(json: unknown, n: number): number[][] | null {
  const j = json as { status?: string; rows?: Array<{ elements?: Array<{ status?: string; distance?: { value?: unknown } }> }> } | null;
  if (!j || j.status !== "OK" || !Array.isArray(j.rows) || j.rows.length !== n) return null;
  const out: number[][] = [];
  for (const row of j.rows) {
    if (!row.elements || row.elements.length !== n) return null;
    out.push(
      row.elements.map((el) => {
        const v = el.distance?.value;
        return el.status === "OK" && typeof v === "number" && Number.isFinite(v) ? v : Infinity;
      })
    );
  }
  return out;
}

export type RoutePlan =
  | { configured: false; error: string }
  | { configured: true; ok: false; error: string }
  | {
      configured: true;
      ok: true;
      stops: Array<{ id: string; name: string; address: string; legKm: number | null; cumulativeKm: number | null }>;
      totalKm: number | null; // from the depot through every stop; null when a stop could not be routed
      returnKm: number | null; // from the last stop back to the depot
      unlocated: Array<{ id: string; name: string; reason: string }>;
    };

const NOT_CONFIGURED = "Route planning isn't set up on this server yet. The operator needs to set GOOGLE_MAPS_KEY.";

/**
 * Plans one driver's stops. The depot is the business address. Stops whose address Google cannot place are listed as unlocated and left
 * out of the order. Makes at most one geocode call per address and one distance matrix call.
 */
export async function planRoute(input: {
  depotAddress: string;
  stops: RouteStop[];
  key: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<RoutePlan> {
  const key = (input.key ?? "").trim();
  if (!key) return { configured: false, error: NOT_CONFIGURED };
  const doFetch = input.fetchImpl ?? fetch;
  const depot = input.depotAddress.trim();
  if (!depot) return { configured: true, ok: false, error: "Set the business address in Settings first, so routes can start from it." };
  if (input.stops.length > MAX_ROUTE_STOPS) {
    return { configured: true, ok: false, error: `Plan up to ${MAX_ROUTE_STOPS} stops at a time. Split the run into smaller groups.` };
  }

  const getJson = async (url: string): Promise<unknown> => {
    try {
      const res = await doFetch(url);
      if (!res.ok) throw new Error("status");
      return await res.json();
    } catch {
      return { __failed: true };
    }
  };

  const depotJson = await getJson(geocodeUrl(depot, key));
  const depotPoint = parseGeocode(depotJson);
  if (!depotPoint) return { configured: true, ok: false, error: "The business address could not be found on the map. Check it in Settings." };

  const located: Array<RouteStop & { point: Point }> = [];
  const unlocated: Array<{ id: string; name: string; reason: string }> = [];
  for (const s of input.stops) {
    if (!s.address.trim()) {
      unlocated.push({ id: s.id, name: s.name, reason: "No delivery address on the order." });
      continue;
    }
    const point = parseGeocode(await getJson(geocodeUrl(s.address.trim(), key)));
    if (point) located.push({ ...s, point });
    else unlocated.push({ id: s.id, name: s.name, reason: "The address could not be found on the map." });
  }
  if (located.length === 0) return { configured: true, ok: true, stops: [], totalKm: 0, returnKm: 0, unlocated };

  const points = [depotPoint, ...located.map((s) => s.point)];
  const matrix = parseDistanceMatrix(await getJson(distanceMatrixUrl(points, key)), points.length);
  if (!matrix) return { configured: true, ok: false, error: "The distances could not be worked out just now. Try again." };

  const order = nearestNeighbourOrder(matrix, 0);
  const m = routeMetres(matrix, 0, order);
  let cumulative = 0;
  const stops = order.map((idx, k) => {
    const leg = m.legs[k];
    const finite = Number.isFinite(leg);
    cumulative = finite ? cumulative + leg : NaN; // NaN carries on to the stops after an unreachable one
    const s = located[idx - 1];
    return {
      id: s.id,
      name: s.name,
      address: s.address,
      legKm: finite ? round1(leg / 1000) : null,
      cumulativeKm: Number.isFinite(cumulative) ? round1(cumulative / 1000) : null,
    };
  });
  return {
    configured: true,
    ok: true,
    stops,
    totalKm: Number.isFinite(m.total) && Number.isFinite(m.returnLeg) ? round1((m.total - m.returnLeg) / 1000) : null,
    returnKm: Number.isFinite(m.returnLeg) ? round1(m.returnLeg / 1000) : null,
    unlocated,
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
