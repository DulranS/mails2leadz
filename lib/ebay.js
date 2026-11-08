// lib/ebay.js - sends the owner's products to their own eBay seller account as inventory items (official eBay Sell Inventory API). Pure.
// Publishing an offer needs the owner's own shipping, return and payment policies in their eBay account; that step is not automated here.
const esc = (s) => String(s ?? '');

/** eBay SKUs: letters, digits, hyphen, underscore, up to 50 characters. */
export function ebaySku(raw) {
  const s = String(raw || '').trim();
  return /^[A-Za-z0-9_-]{1,50}$/.test(s) ? s : null;
}

export function ebayInventoryBody(product) {
  if (product.archived) return null;
  const sku = ebaySku(product.sku);
  if (!sku) return null;
  const qty = Number.isFinite(Number(product.stockOnHand)) ? Math.max(0, Math.floor(Number(product.stockOnHand))) : 0;
  return {
    sku,
    body: {
      availability: { shipToLocationAvailability: { quantity: qty } },
      condition: 'NEW',
      product: { title: esc(product.name || 'Product').slice(0, 80), description: esc(product.description || product.name || 'Product').slice(0, 4000) },
    },
  };
}

export const EBAY_API = 'https://api.ebay.com/sell/inventory/v1';

/** An offer that publishes the item: the owner's policies and category, the price and the stock. */
export function offerBody({ sku, marketplaceId = 'EBAY_US', categoryId, quantity = 0, price, currency = 'USD', description = '', policies }) {
  const p = Number(price);
  if (!sku || !categoryId || !(p > 0) || !policies?.fulfillmentPolicyId || !policies?.paymentPolicyId || !policies?.returnPolicyId) return null;
  return {
    sku, marketplaceId, format: 'FIXED_PRICE', categoryId,
    availableQuantity: Math.max(0, Math.floor(Number(quantity) || 0)),
    listingDescription: String(description || '').slice(0, 4000),
    pricingSummary: { price: { value: p.toFixed(2), currency: String(currency).toUpperCase().slice(0, 3) } },
    listingPolicies: { fulfillmentPolicyId: policies.fulfillmentPolicyId, paymentPolicyId: policies.paymentPolicyId, returnPolicyId: policies.returnPolicyId },
  };
}

/** The first policy of each kind from the owner's eBay account, or null when one is missing. */
export function pickPolicies({ fulfillment, payment, returns } = {}) {
  const f = fulfillment?.fulfillmentPolicies?.[0]?.fulfillmentPolicyId;
  const p = payment?.paymentPolicies?.[0]?.paymentPolicyId;
  const r = returns?.returnPolicies?.[0]?.returnPolicyId;
  return f && p && r ? { fulfillmentPolicyId: f, paymentPolicyId: p, returnPolicyId: r } : null;
}
