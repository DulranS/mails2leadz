// lib/app-routes.js - which pages sit inside the persistent app frame, and what the sidebar lists. Pure, shared by the frame and its tests.
// Sections keep a long menu easy to scan on a phone. Every route and label is the same as before.
export const NAV_ITEMS = [
  { href: '/dashboard', icon: '📊', label: 'Dashboard', group: 'Today' },
  { href: '/inbox', icon: '📥', label: 'Lead Inbox', group: 'Today' },
  { href: '/conversations', icon: '💬', label: 'Conversations', group: 'Today' },
  { href: '/crm', icon: '💼', label: 'CRM & Deals', group: 'Sell' },
  { href: '/customers', icon: '🤝', label: 'Customers', group: 'Sell' },
  { href: '/owners', icon: '👥', label: 'Deal owners', group: 'Sell' },
  { href: '/quotes', icon: '🧾', label: 'Quotes', group: 'Sell' },
  { href: '/bookings', icon: '📅', label: 'Bookings', group: 'Sell' },
  { href: '/partners', icon: '🤝', label: 'Partners', group: 'Sell' },
  { href: '/products', icon: '🛍️', label: 'Products', group: 'Sell' },
  { href: '/content', icon: '📣', label: 'Content', group: 'Market' },
  { href: '/landing', icon: '🌐', label: 'Landing page', group: 'Market' },
  { href: '/bets', icon: '🧪', label: 'Experiments', group: 'Market' },
  { href: '/billing', icon: '🧾', label: 'Billing', group: 'Money' },
  { href: '/contracts', icon: '📑', label: 'Contracts', group: 'Money' },
  { href: '/business', icon: '💰', label: 'Business Value', group: 'Money' },
  { href: '/sops', icon: '📋', label: 'SOPs (sales playbook)', group: 'More' },
  { href: '/integrations', icon: '🔌', label: 'Integrations', group: 'More' },
  { href: '/account', icon: '⚙️', label: 'Account', group: 'More' },
  { href: '/app-keys', icon: '🔑', label: 'App keys (operators)', group: 'More' },
];

// The dashboard draws its own frame, and the public pages (landing, enquiry form, legal, opt-out, admin) have none.
export const SHELL_ROUTES = ['/dashboard', '/app-keys', '/business', '/inbox', '/content', '/conversations', '/crm', '/customers', '/billing', '/stock', '/bets', '/partners', '/payroll', '/assets', '/contracts', '/quotes', '/owners', '/products', '/bookings', '/landing', '/sops', '/integrations', '/account'];

export function isShellRoute(pathname) {
  const p = String(pathname || '').replace(/\/+$/, '') || '/';
  return SHELL_ROUTES.includes(p);
}
