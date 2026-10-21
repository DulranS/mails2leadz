// lib/app-routes.js - which pages sit inside the persistent app frame, and what the sidebar lists. Pure, shared by the frame and its tests.
export const NAV_ITEMS = [
  { href: '/dashboard', icon: '📊', label: 'Dashboard' },
  { href: '/business', icon: '💰', label: 'Business Value' },
  { href: '/inbox', icon: '📥', label: 'Lead Inbox' },
  { href: '/content', icon: '📣', label: 'Content' },
  { href: '/conversations', icon: '💬', label: 'Conversations' },
  { href: '/crm', icon: '💼', label: 'CRM & Deals' },
  { href: '/customers', icon: '🤝', label: 'Customers' },
  { href: '/billing', icon: '🧾', label: 'Billing' },
  { href: '/sops', icon: '📋', label: 'SOPs' },
  { href: '/account', icon: '⚙️', label: 'Account' },
];

// The dashboard draws its own frame, and the public pages (landing, enquiry form, legal, opt-out, admin) have none.
export const SHELL_ROUTES = ['/business', '/inbox', '/content', '/conversations', '/crm', '/customers', '/billing', '/sops', '/account'];

export function isShellRoute(pathname) {
  const p = String(pathname || '').replace(/\/+$/, '') || '/';
  return SHELL_ROUTES.includes(p);
}
