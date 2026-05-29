// PEDIWAY — Service Worker v2.2 (leve e rápido)
const SW_VERSION   = 'pediway-v2.2.0';
const CACHE_FONTS  = SW_VERSION + '-fonts';

// Não pré-cacheia nada no install — evita lentidão inicial
// Cache acontece naturalmente ao usar o site

const NO_CACHE = [
  /supabase\.co/,
  /googleapis\.com\/api/,
  /ibge\.gov\.br/,
  /evolution/,
  /openai/,
  /mercadopago/,
];

self.addEventListener('install', e => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_FONTS).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:' || url.protocol === 'data:') return;
  if (NO_CACHE.some(p => p.test(url.href))) return;

  // Fontes Google → Cache First (só fontes, são estáveis)
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

  // Todo o resto → Network only (sem cache — garante sempre versão atual)
  // O SW existe apenas para habilitar Push Notifications
});

// ── PUSH ─────────────────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { return; }

  const isPedidoNovo = data.tag === 'novo-pedido';
  const url = (typeof data.url === 'string' && data.url.startsWith('/'))
    ? data.url : '/lojas.html';

  e.waitUntil(
    self.registration.showNotification(
      String(data.title || '🔔 PEDIWAY').slice(0, 100), {
        body:               String(data.body || '').slice(0, 200),
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
  if (e.action === 'fechar') return;
  const target = e.notification.data?.url || '/lojas.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => !c.url.includes('chrome-extension'));
      if (existing) { existing.focus(); existing.navigate(target); }
      else clients.openWindow(target);
    })
  );
});
