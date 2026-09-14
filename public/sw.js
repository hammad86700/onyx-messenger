// Onyx Service Worker: Background PWA, Rich Notifications & Web Push Engine
const CACHE_NAME = 'onyx-cache-v1.1.0';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) return caches.delete(key);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Pass non-GET and websocket/API requests directly to network
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/webpack-hmr') ||
    url.hostname.includes('supabase.co')
  ) {
    return;
  }

  // Network-first strategy with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          const fallback = await caches.match('/');
          if (fallback) return fallback;
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});

// Real-Time Background Push Notifications (WhatsApp & Instagram style)
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'Onyx Messenger';
  const isCall = data.type === 'call' || data.isCall;

  const options = {
    body: data.body || (isCall ? 'Incoming call...' : 'New message received'),
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || (isCall ? 'onyx-incoming-call' : `onyx-conv-${data.conversationId || 'feed'}`),
    data: data,
    requireInteraction: Boolean(isCall),
    renotify: true,
    vibrate: isCall
      ? [500, 200, 500, 200, 500, 200, 500, 200]
      : [200, 100, 200],
    actions: isCall
      ? [
          { action: 'answer', title: '📞 Answer' },
          { action: 'decline', title: '❌ Decline' },
        ]
      : [
          { action: 'open', title: '💬 Open Chat' },
        ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle Notification Clicks (Action Center / Notification Tray)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1. If an existing window is open, focus it and dispatch navigation/call action
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus().then(() => {
            if (action === 'answer' || action === 'decline') {
              client.postMessage({
                type: 'CALL_NOTIFICATION_ACTION',
                action,
                callId: data.callId,
              });
            } else if (data.conversationId) {
              client.postMessage({
                type: 'NAVIGATE_CONVERSATION',
                conversationId: data.conversationId,
              });
            }
          });
        }
      }

      // 2. If no window is currently open, open a new window
      if (self.clients.openWindow) {
        const destination = data.conversationId ? `/?conversation=${data.conversationId}` : '/';
        return self.clients.openWindow(destination);
      }
    })
  );
});

// Listen to messages from window to keep alive or update badges
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_BADGE') {
    if (self.navigator && 'setAppBadge' in self.navigator) {
      const count = event.data.count || 0;
      if (count > 0) {
        self.navigator.setAppBadge(count).catch(() => {});
      } else {
        self.navigator.clearAppBadge().catch(() => {});
      }
    }
  }
});
