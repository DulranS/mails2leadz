// lib/invoice-store-rules.js - which older invoices still need copying to the main invoices collection (spec 2.x, invoice store). Pure.
/** Legacy rows that are not in the main collection yet, ready to write, stamped with the owner. */
export function legacyToMove(legacyRows = [], existingIds = new Set(), uid = '', nowIso = new Date(0).toISOString()) {
  const out = [];
  for (const r of Array.isArray(legacyRows) ? legacyRows : []) {
    if (!r || !r.id || existingIds.has(r.id)) continue;
    const { id, ...data } = r;
    out.push({ id: String(id), data: { ...data, userId: String(uid), movedFromLegacyAt: nowIso } });
  }
  return out;
}
