// Installable app: the app's pages are always fetched fresh from the network; nothing is cached, so no stale quotes or invoices.
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

// Push alerts (pipeline): show the notification; tapping it opens the CRM. Nothing here contacts a customer.
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = {}; }
  e.waitUntil(self.registration.showNotification(data.title || 'AutoLeads', { body: data.body || '', data: { url: data.url || '/crm' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/crm';
  e.waitUntil(self.clients.openWindow(url));
});
