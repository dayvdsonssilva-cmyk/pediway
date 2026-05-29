// ═══════════════════════════════════════════════════════
//  PEDIWAY — Service Worker v2.0
//  Cache First para assets · Network First para dados
//  Push Notifications · Background Sync
// ═══════════════════════════════════════════════════════

const SW_VERSION   = 'pediway-v2.0.0';
const CACHE_STATIC = SW_VERSION + '-static';
const CACHE_FONTS  = SW_VERSION + '-fonts';

const STATIC_ASSETS = [
  '/lojas.html',
  '/manifest.json',
  '/sw.js',
  '/pediway-notif.js',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/public/notificacao.mp3',
];

// URLs que nunca devem ser cacheadas
const NO_CACHE_PATTERNS = [
  /supabase\.co/,
  /googleapis\.com\/api/,
  /ibge\.gov\.br/,
  /evolution/,
  /api\.openai/,
];

// Rotas que o SW nunca deve interceptar
const BYPASS_ROUTES = [
  '/baixar',
  '/admin',
  '/checkout',
];

// ── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando', SW_VERSION);
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache =>
        Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(e => console.warn('[SW] Não cacheou:', url, e.message))
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Ativando', SW_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k !== CACHE_STATIC && k !== CACHE_FONTS)
            .map(k => { console.log('[SW] Removendo cache antigo:', k); return caches.delete(k); })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:' || url.protocol === 'data:') return;
  if (BYPASS_ROUTES.some(r => url.pathname.startsWith(r))) return;
  if (NO_CACHE_PATTERNS.some(p => p.test(url.href))) return;

  // Fontes Google → Cache First
  if (url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    event.respondWith(
      caches.open(CACHE_FONTS).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(res => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // lojas.html + / → Network First com fallback para cache
  if (url.pathname === '/lojas.html' || url.pathname === '/' || url.pathname === '/dashboard') {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) caches.open(CACHE_STATIC).then(c => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/offline.html')))
    );
    return;
  }

  // Outros assets → Cache First com atualização em background
  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request).then(res => {
        if (res.ok) caches.open(CACHE_STATIC).then(c => c.put(request, res.clone()));
        return res;
      });
      return cached || networkFetch.catch(() => {
        if (request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/offline.html');
        }
      });
    })
  );
});

// ── BACKGROUND SYNC ───────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pedidos') {
    event.waitUntil(
      self.clients.matchAll().then(clients =>
        clients.forEach(c => c.postMessage({ type: 'SYNC_PEDIDOS' }))
      )
    );
  }
});

// ── PUSH NOTIFICATION — handler único ────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { return; }

  const urlNotif = (typeof data.url === 'string' && data.url.startsWith('/'))
    ? data.url : '/dashboard';

  // requireInteraction:true para pedidos novos (equipe não perde o aviso)
  const isPedidoNovo = data.tag === 'novo-pedido' || data.tipo === 'novo';

  const options = {
    body:               String(data.body  || 'Você tem uma novidade!').slice(0, 200),
    icon:               data.icon  || '/icons/icon-192.png',
    badge:              data.badge || '/icons/icon-192.png',
    tag:                String(data.tag || 'pediway-notif').slice(0, 50),
    renotify:           true,
    vibrate:            [200, 100, 200, 100, 400],
    requireInteraction: isPedidoNovo,   // pedido novo fica na tela até interagir
    data:               { url: urlNotif, pedidoId: data.data?.pedidoId, status: data.data?.status },
    actions: [
      { action: 'ver',    title: '👁️ Ver pedido' },
      { action: 'fechar', title: '✕ Fechar'      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(
      String(data.title || '🔔 PEDIWAY').slice(0, 100),
      options
    )
  );
});

// ── NOTIFICATION CLICK — handler único ───────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'fechar' || event.action === 'ok') return;

  const rawUrl = event.notification.data?.url || '/dashboard';
  const target = (typeof rawUrl === 'string' && rawUrl.startsWith('/')) ? rawUrl : '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      // Foca aba existente se já estiver aberta
      const existing = cs.find(c =>
        c.url.includes('/dashboard') || c.url.includes('/lojas')
      );
      if (existing) { existing.focus(); existing.navigate(target); }
      else clients.openWindow(target);
    })
  );
});
