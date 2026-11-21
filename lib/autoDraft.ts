// Automatic draft orders (v243): each day, the lines on the buying list that are due, with a known cost, and that do not already have an open order,
// become draft orders for review. A draft is not sent: sending it applies the usual approval rule. Pure: picks the lines; the caller writes them.

export interface DraftCandidate { productId: string; name: string; supplier: string | null; suggestQty: number; unitCost: number; costKnown: boolean; onOrder: number }
export interface ExistingOrder { productId: string; status: string }

const OPEN = new Set(["draft", "awaiting_approval", "ordered", "in_transit"]);

export function draftLinesFor(lines: DraftCandidate[], existing: ExistingOrder[]): DraftCandidate[] {
  const open = new Set(existing.filter((o) => OPEN.has(o.status)).map((o) => o.productId));
  return lines.filter((l) => l.costKnown && l.unitCost > 0 && l.suggestQty > 0 && l.onOrder === 0 && !open.has(l.productId));
}

// The draft is for the day's buying list only: once one has been made today, the owner decides whether to make another.
export function alreadyDraftedToday(lastAutoDraftOn: string | undefined, today: string): boolean {
  return lastAutoDraftOn === today;
}
