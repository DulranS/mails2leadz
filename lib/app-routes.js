// lib/app-routes.js - which pages sit inside the persistent app frame, and what the sidebar lists. Pure, shared by the frame and its tests.
// Sections keep a long menu easy to scan on a phone. Every route and label is the same as before.
export const NAV_ITEMS = [
  { href: '/dashboard', icon: '📊', label: 'Dashboard', group: 'Today' },
  { href: '/inbox', icon: '📥', label: 'Lead Inbox', group: 'Today' },
  { href: '/conversations', icon: '💬', label: 'Conversations', group: 'Today' },
  { href: '/crm', icon: '💼', label: 'CRM & Deals', group: 'Sell' },
  { href: '/content', icon: '📣', label: 'Content', group: 'Sell' },
  { href: '/customers', icon: '🤝', label: 'Customers', group: 'Sell' },
  { href: '/partners', icon: '🤝', label: 'Partners', group: 'Sell' },
  { href: '/business', icon: '💰', label: 'Business Value', group: 'Money' },
  { href: '/billing', icon: '🧾', label: 'Billing', group: 'Money' },
  { href: '/assets', icon: '🏦', label: 'Assets and loans', group: 'Money' },
  { href: '/stock', icon: '📦', label: 'Stock', group: 'Money' },
  { href: '/payroll', icon: '👥', label: 'Payroll', group: 'Run the business' },
  { href: '/quotes', icon: '🧾', label: 'Quotes', group: 'Sell' },
  { href: '/contracts', icon: '📑', label: 'Contracts', group: 'Run the business' },
  { href: '/sops', icon: '📋', label: 'SOPs', group: 'Run the business' },
  { href: '/bets', icon: '🧪', label: 'Experiments', group: 'Run the business' },
  { href: '/integrations', icon: '🔌', label: 'Integrations', group: 'Account' },
  { href: '/account', icon: '⚙️', label: 'Account', group: 'Account' },
];

// The dashboard draws its own frame, and the public pages (landing, enquiry form, legal, opt-out, admin) have none.
export const SHELL_ROUTES = ['/business', '/inbox', '/content', '/conversations', '/crm', '/customers', '/billing', '/stock', '/bets', '/partners', '/payroll', '/assets', '/contracts', '/quotes', '/sops', '/integrations', '/account'];

export function isShellRoute(pathname) {
  const p = String(pathname || '').replace(/\/+$/, '') || '/';
  return SHELL_ROUTES.includes(p);
}
