// Branch-restricted staff: a team member can be limited to some of the business's locations.
//
// A member record may carry locationIds: the locations this person works at. Nothing set (or an empty list) means every
// location, which is exactly how everyone worked before this existed. The owner is never restricted.
//
// A restricted person sees only the sales, purchases, stock adjustments, estimates and sale returns recorded at their
// locations, and their location picker offers only those. A record with no location belongs to the business's default
// location (legacy data, see Location in lib/types.ts). This is applied in the app's data layer; it is not a database-level
// lock. Pure: no I/O. See scripts/verify-location-scope.ts.
import type { Location } from "./types";

export interface ScopedMember {
  locationIds?: string[];
}

// The locations a person may use: null means no restriction (every location); otherwise the set of allowed location ids.
// Only locations that still exist and are active count, so a deleted or closed branch quietly drops out of the list.
export function locationScopeFor(member: ScopedMember | undefined, role: string | null | undefined, locations: Location[]): Set<string> | null {
  if (role === "owner") return null;
  const ids = member?.locationIds ?? [];
  if (ids.length === 0) return null;
  const active = new Set(locations.filter((l) => l.active).map((l) => l.id));
  return new Set(ids.filter((id) => active.has(id)));
}

// The location a record belongs to: its own locationId, or the default location for a record written before locations existed.
export function recordLocationId(locationId: string | undefined, locations: Location[]): string {
  if (locationId) return locationId;
  return locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? "";
}

export function inScope(scope: Set<string> | null, locations: Location[], locationId: string | undefined): boolean {
  if (scope === null) return true;
  return scope.has(recordLocationId(locationId, locations));
}

// Keeps only the rows a person may see. With no restriction the same array comes back, so owners pay nothing for this.
export function scopedRows<T extends { locationId?: string }>(rows: T[], scope: Set<string> | null, locations: Location[]): T[] {
  if (scope === null) return rows;
  return rows.filter((r) => inScope(scope, locations, r.locationId));
}

// The active locations the person's location picker offers, in the order the business set them.
export function offeredLocations(scope: Set<string> | null, locations: Location[]): Location[] {
  const active = locations.filter((l) => l.active);
  return scope === null ? active : active.filter((l) => scope.has(l.id));
}

// The location a new entry starts on: the default one if they may use it, otherwise their first allowed location.
export function defaultLocationForScope(scope: Set<string> | null, locations: Location[]): string {
  const offered = offeredLocations(scope, locations);
  return offered.find((l) => l.isDefault)?.id ?? offered[0]?.id ?? "";
}
