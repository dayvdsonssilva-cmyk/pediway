// PEDIWAY — Service Worker v2.1
const SW_VERSION   = 'pediway-v2.1.0';
const CACHE_STATIC = SW_VERSION + '-static';
const CACHE_FONTS  = SW_VERSION + '-fonts';

const STATIC_ASSETS = [
  '/lojas.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/notificacao.mp3',
];

const NO_CACHE_PATTERNS = [
  /supabase\.co/,
  /googleapis\.com\/api/,
  /ibge\.gov\.br/,
  /evolution/,
  /api\.openai/,
];

const BYPASS_ROUTES = ['/baixar', '/admin', '/checkout'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_STATIC)
      .then(c => Promise.allSettled(
        STATIC_ASSETS.map(url => c.add(url).catch(() => {}))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_STATIC && k !== CACHE_FONTS)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:' || url.protocol === 'data:') return;
  if (BYPASS_ROUTES.some(r => url.pathname.startsWith(r))) return;
  if (NO_CACHE_PATTERNS.some(p => p.test(url.href))) return;

  // Fontes Google → Cache First
  if (url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(
      caches.open(CACHE_FONTS).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(res => {
            if (res && res.ok) cache.put(request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // HTML → Network First
  if (request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(request)
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_STATIC).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/offline.html')))
    );
    return;
  }

  // Outros assets → Cache First
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        // Atualiza em background sem bloquear
        fetch(request).then(res => {
          if (res && res.ok) caches.open(CACHE_STATIC).then(c => c.put(request, res));
        }).catch(() => {});
        return cached;
      }
      return fetch(request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_STATIC).then(c => c.put(request, clone));
        }
        return res;
      }).catch(() => caches.match('/offline.html'));
    })
  );
});

// ── PUSH ─────────────────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { return; }

  const isPedidoNovo = data.tag === 'novo-pedido' || data.tipo === 'novo';
  const url = (typeof data.url === 'string' && data.url.startsWith('/')) ? data.url : '/lojas.html';

  e.waitUntil(
    self.registration.showNotification(
      String(data.title || '🔔 PEDIWAY').slice(0, 100), {
        body:               String(data.body || 'Você tem uma atualização!').slice(0, 200),
        icon:               '/icons/icon-192.png',
        badge:              '/icons/icon-192.png',
        tag:                String(data.tag || 'pediway').slice(0, 50),
        renotify:           true,
        vibrate:            [200, 100, 200, 100, 400],
        requireInteraction: isPedidoNovo,
        data:               { url },
        actions: [
          { action: 'ver',    title: '👁️ Ver pedido' },
          { action: 'fechar', title: '✕ Fechar' },
        ],
      }
    )
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'fechar' || e.action === 'ok') return;
  const target = e.notification.data?.url || '/lojas.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => !c.url.includes('chrome-extension'));
      if (existing) { existing.focus(); existing.navigate(target); }
      else clients.openWindow(target);
    })
  );
});
