const CACHE_VERSION = 'v2';
const STATIC_CACHE_NAME = `taskflow-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `taskflow-dynamic-${CACHE_VERSION}`;

// Assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  // Icons
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
];

// Install event - pre-cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Static assets pre-cached');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Pre-caching failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Old caches cleaned up');
        return self.clients.claim();
      })
  );
});

// Fetch event - handle different caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and cross-origin requests
  if (request.method !== 'GET') {
    return;
  }

  // Bypass Google API domains (Firestore, Firebase, etc.) - these should never be cached
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('gstatic.com')) {
    return; // Let the browser handle it normally, don't intercept
  }

  // Bypass Vite/dev paths to prevent intercepting development server requests
  if (url.pathname.includes('/@vite') ||
      url.pathname.includes('/@react-refresh') ||
      url.pathname.includes('/src/') ||
      url.pathname.includes('.tsx') ||
      url.pathname.includes('.ts')) {
    return; // Let the browser handle it normally, don't intercept
  }

  // Vite-compiled assets have content-hashed filenames (e.g. /assets/index-CY8pse7v.js).
  // Always fetch these from the network so a recompile is never blocked by a stale
  // cached chunk. The content hash in the filename IS the cache key — if the hash
  // changed, it's a new file; if it didn't, the network response will be identical.
  if (url.pathname.startsWith('/assets/')) {
    return; // Let the browser handle it — don't intercept Vite output chunks
  }

  // API routes - Network First with offline fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses
          if (response.ok) {
            const responseToCache = response.clone();
            caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(async () => {
          // Try to get from cache
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // Return offline error response
          return new Response(
            JSON.stringify({ error: 'offline', offline: true }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }

  // All other GET requests - Cache First with network fallback
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request)
          .then((response) => {
            // Cache successful responses
            if (response.ok) {
              const responseToCache = response.clone();
              caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
            return response;
          })
          .catch(() => {
            // Return offline page for navigation requests
            if (request.mode === 'navigate') {
              return caches.match('/offline.html');
            }
          });
      })
  );
});

// Background Sync for offline task mutations
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync event:', event.tag);
  
  if (event.tag === 'sync-tasks') {
    event.waitUntil(syncPendingTasks());
  }
});

async function syncPendingTasks() {
  try {
    // Open IndexedDB
    const db = await openIndexedDB();
    const pendingTasks = await getAllPendingTasks(db);
    
    console.log('[SW] Syncing pending tasks:', pendingTasks.length);
    
    for (const task of pendingTasks) {
      try {
        const response = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(task)
        });
        
        if (response.ok) {
          await deletePendingTask(db, task.id);
          console.log('[SW] Successfully synced task:', task.id);
        }
      } catch (error) {
        console.error('[SW] Failed to sync task:', task.id, error);
      }
    }
    
    db.close();
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// IndexedDB helpers
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('taskflow-offline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingTasks')) {
        db.createObjectStore('pendingTasks', { keyPath: 'id' });
      }
    };
  });
}

function getAllPendingTasks(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pendingTasks', 'readonly');
    const store = transaction.objectStore('pendingTasks');
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function deletePendingTask(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pendingTasks', 'readwrite');
    const store = transaction.objectStore('pendingTasks');
    const request = store.delete(id);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Push Notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received');
  
  let payload = { title: 'PMS TaskFlow', body: 'New notification', url: '/' };
  
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch (error) {
    console.error('[SW] Failed to parse push payload:', error);
  }
  
  const options = {
    body: payload.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    data: { url: payload.url },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if no existing window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
