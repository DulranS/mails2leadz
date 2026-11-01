// Installable app: the app's pages are always fetched fresh from the network; nothing is cached, so no stale quotes or invoices.
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
