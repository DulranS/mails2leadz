// When to window the data (v265). The data layer loads each collection whole, which is right while a business is small. This rule says when a session has
// grown big enough that the windowing design should be built: a total document count, or one collection that alone is large. Thresholds are set high on
// purpose, so a small business never sees a warning. Pure.

export const TOTAL_DOCS_TRIGGER = 5000;
export const ONE_COLLECTION_TRIGGER = 2000;

export function windowingDue(s: { totalDocs: number; top: { name: string; docs: number }[] }): { due: boolean; reason: string | null } {
  const biggest = s.top[0];
  if (biggest && biggest.docs >= ONE_COLLECTION_TRIGGER) {
    return { due: true, reason: `${biggest.name} alone has ${biggest.docs.toLocaleString()} documents.` };
  }
  if (s.totalDocs >= TOTAL_DOCS_TRIGGER) {
    return { due: true, reason: `This session has received ${s.totalDocs.toLocaleString()} documents.` };
  }
  return { due: false, reason: null };
}
