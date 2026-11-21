// Extra details the owner names for customers (up to four, e.g. "Vehicle number", "Birthday"). Each customer holds a value per name.
// Information only: nothing in the books, the balances or the credit checks reads them. Pure.

export const MAX_CUSTOMER_FIELDS = 4;
const MAX_LABEL = 30;
const MAX_VALUE = 200;

// "Vehicle number, Birthday" -> ["Vehicle number", "Birthday"]. Labels are trimmed, blanks dropped, repeats (ignoring case)
// refused rather than silently merged.
export function parseCustomerFieldLabels(text: string): { labels: string[]; error?: string } {
  const parts = text.split(",").map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (parts.length > MAX_CUSTOMER_FIELDS) return { labels: [], error: `At most ${MAX_CUSTOMER_FIELDS} extra details.` };
  const seen = new Set<string>();
  for (const label of parts) {
    if (label.length > MAX_LABEL) return { labels: [], error: `"${label.slice(0, 20)}..." is longer than ${MAX_LABEL} characters.` };
    const key = label.toLowerCase();
    if (seen.has(key)) return { labels: [], error: `"${label}" is listed more than once.` };
    seen.add(key);
  }
  return { labels: parts };
}

// The values typed for the named labels. Only labels still in the list are kept; blanks are dropped; no values gives undefined,
// so an empty customer stores nothing.
export function cleanCustomFields(labels: string[], values: Record<string, string>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const label of labels) {
    const v = (values[label] ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_VALUE);
    if (v) out[label] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
