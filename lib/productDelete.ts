// Deleting a product (v279). A product that has sales or purchases on record cannot be deleted: its history would point at nothing, and its stock would be
// lost from the books (the cause of the missing-stock problem found on a real backup). Archive it instead (set it inactive), which keeps its history intact.
// Pure: the data layer passes in the sales and purchases it holds.
export function productDeleteBlock(productId: string, sales: { productId?: string }[], purchases: { productId?: string }[]): string | null {
  const s = sales.filter((x) => x.productId === productId).length;
  const p = purchases.filter((x) => x.productId === productId).length;
  if (s === 0 && p === 0) return null;
  return `This product has ${s} sale${s === 1 ? "" : "s"} and ${p} purchase${p === 1 ? "" : "s"} on record, so it can't be deleted. Archive it instead (set it to inactive) so its history stays intact.`;
}
