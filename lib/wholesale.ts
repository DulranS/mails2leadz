// Wholesale price suggestion. A customer marked wholesale (Customer.wholesale) buying an item that has a wholesale
// price (Product.wholesalePrice) is offered that price as a one-tap suggestion on the sale form. The price on the sale
// is whatever is entered: nothing here changes a price, a cost or any figure by itself.

// The wholesale price in the unit being typed. The product stores it per base unit (per piece); a pack of 12 is priced
// at 12 times that, rounded to the cent, the same way the usual price is carried across when the unit is switched.
export function wholesaleEntryPrice(wholesalePrice: number | null | undefined, unitFactor: number): number | undefined {
  if (typeof wholesalePrice !== "number" || !Number.isFinite(wholesalePrice) || !(wholesalePrice > 0)) return undefined;
  const f = Number.isFinite(unitFactor) && unitFactor > 0 ? unitFactor : 1;
  return Math.round(wholesalePrice * f * 100) / 100;
}

// Whether to show the suggestion: only when there is one and the price currently typed is not already it.
export function shouldOfferWholesale(suggested: number | undefined, typedPrice: number): boolean {
  return suggested !== undefined && Math.abs((Number.isFinite(typedPrice) ? typedPrice : 0) - suggested) > 0.005;
}
