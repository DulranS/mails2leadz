// Shelf or bin location of a product ("A-03", "Fridge 2"), used to order the stock count so the count follows the walk around the
// shop. Information only: no stock or cost figure reads it. Pure.

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

// Trimmed, spaces collapsed, cut to 20 characters. Blank = no bin (undefined, so the field clears).
export function cleanBin(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const bin = raw.replace(/\s+/g, " ").trim().slice(0, 20);
  return bin || undefined;
}

// Items with a bin come first in bin order (A-2 before A-10); items without a bin come last. Ties fall back to the name.
export function compareByBin(a: { name: string; binLocation?: string }, b: { name: string; binLocation?: string }): number {
  if (a.binLocation && !b.binLocation) return -1;
  if (!a.binLocation && b.binLocation) return 1;
  if (a.binLocation && b.binLocation) {
    const byBin = collator.compare(a.binLocation, b.binLocation);
    if (byBin !== 0) return byBin;
  }
  return a.name.localeCompare(b.name);
}
