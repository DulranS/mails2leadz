"use client";

import { useEffect } from "react";
import { useData } from "@/contexts/DataContext";
import { Field, Label, Select } from "@/components/ui";
import type { Location } from "@/lib/types";
import { defaultLocationForScope, offeredLocations } from "@/lib/locationScope";

// The business's default Location (see Location.isDefault in lib/types.ts)
// — every form that logs a transaction should initialize its locationId
// state to this, so a legacy single-location business's forms submit
// exactly the value that already reads as "the default" with no field set.
export function defaultLocationId(locations: Location[]): string {
  return locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? "";
}

// A location <select>. Deliberately renders nothing at all — not even a
// single-option dropdown — once a business has one or zero active
// Locations, which is every business that hasn't turned this on: the whole
// point of the "lighter" multi-location model is that nothing changes for
// anyone who never adds a second location. See Location in lib/types.ts.
//
// A branch-restricted staff member is offered only their own locations
// (lib/locationScope.ts). If the form starts on a location they may not use,
// it moves to their default one straight away, so nothing is entered on
// another branch by mistake.
export function LocationField({
  value,
  onChange,
  label = "Location",
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const { locations, myLocationScope } = useData();
  const offered = offeredLocations(myLocationScope, locations);
  const target = defaultLocationForScope(myLocationScope, locations);
  const restricted = myLocationScope !== null;
  const valueOffered = offered.some((l) => l.id === value);
  useEffect(() => {
    if (restricted && target && !valueOffered) onChange(target);
    // onChange is left out on purpose: it changes identity on every render, and only the location matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restricted, target, valueOffered]);
  if (offered.length <= 1) return null;
  return (
    <Field>
      <Label>{label}</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {offered.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
