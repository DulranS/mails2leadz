"use client";

import { Field, Label, Select } from "@/components/ui";
import { entryUnitsFor, type EntryUnit } from "@/lib/units";
import type { Product } from "@/lib/types";

// "Buying in: [pc | Box (6) | Carton (12)]". Renders nothing for a product with no packs, which is every product
// that hasn't set any up, so nobody else sees a thing change. See lib/units.ts for how the entry is converted.
export function PackUnitSelect({
  product,
  value,
  onChange,
  label = "Buying in",
}: {
  product: Pick<Product, "baseUnit" | "packSizes"> | undefined;
  value: string;
  onChange: (id: string, unit: EntryUnit) => void;
  label?: string;
}) {
  const units = entryUnitsFor(product);
  if (units.length <= 1) return null;
  return (
    <Field>
      <Label>{label}</Label>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value, units.find((u) => u.id === e.target.value) ?? units[0])}
      >
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.id === "" ? u.name : `${u.name} (${u.factor} ${units[0].name} each)`}
          </option>
        ))}
      </Select>
    </Field>
  );
}
