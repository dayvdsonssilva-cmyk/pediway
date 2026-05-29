// ═══════════════════════════════════════════════════════
//  PEDIWAY — Service Worker v1.0
//  Estratégia: Cache First para assets, Network First para dados
// ═══════════════════════════════════════════════════════

const SW_VERSION   = 'pediway-v1.0.1';
const CACHE_STATIC = SW_VERSION + '-static';
const CACHE_FONTS  = SW_VERSION + '-fonts';

// Arquivos que ficam em cache para funcionar offline
const STATIC_ASSETS = [
  '/lojas.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/public/notificacao.mp3',
];

// URLs que nunca devem ser cacheadas (Supabase API, dados em tempo real)
const NO_CACHE_PATTERNS = [
  /supabase\.co/,
  /googleapis\.com\/api/,
  /ibge\.gov\.br/,
];

// Rotas que o SW nunca deve interceptar — deixa o servidor responder
const BYPASS_ROUTES = [
  '/baixar',
  '/admin',
  '/checkout',
  '/lojas',
];

// ── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando', SW_VERSION);
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => {
        // Adiciona arquivos essenciais — ignora erro de arquivos que ainda não existem
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(e => console.warn('[SW] Não cacheou:', url, e.message))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Ativando', SW_VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_STATIC && key !== CACHE_FONTS)
          .map(key => {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requests que não são GET
  if (request.method !== 'GET') return;

  // Ignora extensões do Chrome e URLs de dados
  if (url.protocol === 'chrome-extension:' || url.protocol === 'data:') return;

  // Rotas que o SW nunca deve interceptar — deixa o servidor decidir
  if (BYPASS_ROUTES.includes(url.pathname)) return;

  // Nunca cacheia dados do Supabase ou APIs dinâmicas
  if (NO_CACHE_PATTERNS.some(p => p.test(url.href))) return;

  // Fontes do Google → Cache First (raramente mudam)
  if (url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    event.respondWith(
      caches.open(CACHE_FONTS).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // lojas.html → Network First com fallback para cache
  // Garante que o usuário sempre veja a versão mais recente quando online
  if (url.pathname === '/lojas.html' || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            caches.open(CACHE_STATIC).then(c => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match('/lojas.html'))
    );
    return;
  }

  // Outros assets estáticos (ícones, manifest, mp3) → Cache First
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          caches.open(CACHE_STATIC).then(c => c.put(request, response.clone()));
        }
        return response;
      }).catch(() => {
        // Offline e não tem cache — retorna página offline básica para HTML
        if (request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/lojas.html');
        }
      });
    })
  );
});

// ── PUSH NOTIFICATIONS (futuro) ───────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'PEDIWAY', {
      body:    data.body    || 'Você tem uma atualização!',
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-96.png',
      tag:     data.tag     || 'pediway-notif',
      vibrate: [200, 100, 200],
      data:    { url: data.url || '/lojas.html' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const target = event.notification.data?.url || '/lojas.html';
      const existing = cs.find(c => c.url.includes('lojas.html'));
      if (existing) { existing.focus(); existing.navigate(target); }
      else clients.openWindow(target);
    })
  );
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { return; }

  const urlNotif = (typeof data.url === 'string' && data.url.startsWith('/'))
    ? data.url : '/lojas';

  const options = {
    body:    String(data.body  || 'Você tem uma novidade!').slice(0, 200),
    icon:    data.icon  || '/icon-192.png',
    badge:   data.badge || '/favicon-32x32.png',
    tag:     String(data.tag || 'pediway-notif').slice(0, 50),
    renotify: true,
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: false,
    data:    { url: urlNotif, pedidoId: data.data?.pedidoId, status: data.data?.status },
    actions: [
      { action: 'ver', title: 'Ver pedido' },
      { action: 'ok',  title: 'OK'         },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(
      String(data.title || 'PEDIWAY').slice(0, 100),
      options
    )
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const action = event.action;
  const rawUrl = event.notification.data?.url || '/lojas';
  const target = (typeof rawUrl === 'string' && rawUrl.startsWith('/')) ? rawUrl : '/lojas';

  if (action === 'ok') return; // fecha sem navegar

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => !c.url.includes('chrome-extension'));
      if (existing) { existing.focus(); existing.navigate(target); }
      else clients.openWindow(target);
    })
  );
});
