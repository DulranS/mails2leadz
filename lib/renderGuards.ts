// Render efficiency helpers (v246). shallowSame: two objects with the same keys and identical values for each key, so the older one can be kept.
// mergeFlags: merge a batch of "loaded" flags into the current ones, returning the same object when nothing new was set (so no render is caused).
export function shallowSame(a: Record<string, unknown> | null, b: Record<string, unknown>): boolean {
  if (!a) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return kb.every((k) => Object.prototype.hasOwnProperty.call(a, k) && a[k] === b[k]);
}

export function mergeFlags(current: Record<string, boolean>, batch: Record<string, boolean>): Record<string, boolean> {
  const keys = Object.keys(batch);
  if (keys.every((k) => current[k] === true)) return current;
  return { ...current, ...batch };
}
