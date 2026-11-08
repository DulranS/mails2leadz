// lib/shopify.js - sends the owner's products to their own Shopify store, through Shopify's official Admin API. Pure: the store check and the product body.
// The owner creates a custom app in their own Shopify admin and pastes its Admin API access token; the app never scrapes a store.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** A store domain must be a Shopify store domain, so the token is only ever sent to Shopify. */
export function storeDomain(raw) {
  const d = String(raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/.test(d) ? d : null;
}

/** The product as Shopify takes it. Price is a string with two decimals. Archived products are not sent. */
export function shopifyProductBody(product) {
  const price = Number(product.price);
  if (!(price >= 0) || product.archived) return null;
  return {
    product: {
      title: String(product.name || 'Product').slice(0, 255),
      body_html: `<p>${esc(product.description || '')}</p>`,
      status: 'active',
      variants: [{ price: price.toFixed(2), sku: String(product.sku || '').slice(0, 255) }],
    },
  };
}

export const SHOPIFY_API = (domain) => `https://${domain}/admin/api/2024-10`;
