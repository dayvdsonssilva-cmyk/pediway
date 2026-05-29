// pediway-notif.js — Notificações PEDIWAY
// Inclua este arquivo no index.html (dashboard) e no kds.html
// <script src="/pediway-notif.js"></script>

(function() {
'use strict';

// ── CONFIG — edite aqui ──────────────────────────────────────────────────────
const NOTIF_CFG = {
  // Evolution API — preencha para ativar WhatsApp para clientes
  evolutionUrl: '',   // Ex: 'https://evolution.seudominio.com.br'
  evolutionKey: '',   // Sua API Key da Evolution
  evolutionInst: '',  // Nome da instância conectada

  // Mensagens para o cliente (use {nome}, {id}, {loja})
  msgs: {
    preparo:    '🍳 Olá, {nome}! Seu pedido #{id} na *{loja}* foi aceito e está sendo preparado. Ficará pronto em breve! 😊',
    pronto_ret: '✅ *{nome}*, seu pedido #{id} na *{loja}* está PRONTO para retirada! Pode vir buscar. 🎉',
    pronto_del: '🛵 *{nome}*, seu pedido #{id} na *{loja}* acabou de sair para entrega! Aguarde em breve. 🙌',
    recusado:   '😔 *{nome}*, infelizmente seu pedido #{id} na *{loja}* foi cancelado. Entre em contato conosco.',
  }
};

// ── PWA — Service Worker ─────────────────────────────────────────────────────
async function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('[PWA] Service Worker registrado:', reg.scope);

    // Listener para mensagens do SW (sync)
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'SYNC_PEDIDOS') {
        window.dispatchEvent(new CustomEvent('pediway:sync'));
      }
    });
    return reg;
  } catch(e) {
    console.warn('[PWA] SW falhou:', e.message);
  }
}

// ── NOTIFICAÇÕES PUSH — pede permissão e subscribe ───────────────────────────
async function pedirPermissaoNotif() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

// Dispara notificação local (funciona mesmo sem push server)
function notifLocal(title, body, tag = 'pedido', url = '/dashboard') {
  if (Notification.permission !== 'granted') return;
  const n = new Notification(title, {
    body,
    tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200, 100, 400],
    requireInteraction: true,
    data: { url }
  });
  n.onclick = () => { window.focus(); n.close(); };
}

// ── SOM — compatível com iOS (requer gesto do usuário) ───────────────────────



function tocarBip(tipo) {
  // Usa apenas o mp3 — sem AudioContext para evitar eco
  try {
    const a = new Audio('/notificacao.mp3');
    a.volume = tipo === 'pronto' ? 0.6 : 0.8;
    a.play().catch(function(){});
  } catch(e) {}
}

// ── WHATSAPP — notificação para o cliente ────────────────────────────────────
function fmtMsg(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] || '');
}

async function notificarCliente(pedido, status, estabNome) {
  const { evolutionUrl, evolutionKey, evolutionInst, msgs } = NOTIF_CFG;

  // Pega config salva no localStorage (dashboard pode sobrescrever)
  const savedCfg = JSON.parse(localStorage.getItem('pw_notif_cfg') || '{}');
  const url  = savedCfg.evolutionUrl  || evolutionUrl;
  const key  = savedCfg.evolutionKey  || evolutionKey;
  const inst = savedCfg.evolutionInst || evolutionInst;

  if (!url || !key || !inst) return; // não configurado
  if (!pedido?.cliente_whats) return; // sem telefone

  // Define tipo da mensagem
  let msgKey = '';
  if (status === 'preparo')  msgKey = 'preparo';
  if (status === 'recusado') msgKey = 'recusado';
  if (status === 'pronto') {
    const isDelivery = (pedido.endereco || '').toLowerCase().includes('rua') ||
                       (pedido.endereco || '').toLowerCase().includes('av.');
    msgKey = isDelivery ? 'pronto_del' : 'pronto_ret';
  }
  if (!msgKey) return;

  const msgTemplate = savedCfg.msgs?.[msgKey] || msgs[msgKey];
  const num   = (pedido.id || '').slice(-4).toUpperCase();
  const msg   = fmtMsg(msgTemplate, {
    nome: pedido.cliente_nome?.split(' ')[0] || 'Cliente',
    id:   num,
    loja: estabNome || 'PEDIWAY'
  });

  // Normaliza número BR
  let fone = String(pedido.cliente_whats).replace(/\D/g, '');
  if (!fone.startsWith('55')) fone = '55' + fone;

  try {
    await fetch(`${url}/message/sendText/${inst}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': key },
      body: JSON.stringify({
        number: fone,
        text:   msg,
        delay:  1000
      })
    });
    console.log('[WhatsApp] Mensagem enviada para:', fone, '— status:', status);
  } catch(e) {
    console.warn('[WhatsApp] Erro ao enviar:', e.message);
  }
}

// ── INSTALL PROMPT (botão "Instalar app") ───────────────────────────────────
let _installPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _installPrompt = e;
  // Dispara evento para o dashboard mostrar botão de instalar
  window.dispatchEvent(new CustomEvent('pediway:installable'));
});

async function instalarApp() {
  if (!_installPrompt) return false;
  _installPrompt.prompt();
  const { outcome } = await _installPrompt.userChoice;
  _installPrompt = null;
  return outcome === 'accepted';
}

// ── API PÚBLICA ──────────────────────────────────────────────────────────────
window.PediwayNotif = {
  // Inicializa (chame no DOMContentLoaded)
  init: async function() {
    await registrarSW();
    const ok = await pedirPermissaoNotif();
    if (!ok) console.warn('[Notif] Permissão negada. Notificações desabilitadas.');
    return ok;
  },

  // Notificação para equipe (novo pedido)
  novoPedido: function(pedido) {
    const num = (pedido.id || '').slice(-4).toUpperCase();
    tocarBip('novo');
    notifLocal(
      '🔔 Novo Pedido #' + num,
      (pedido.cliente_nome || 'Cliente') + ' · ' + (pedido.pagamento || '') + ' · R$ ' + Number(pedido.total || 0).toFixed(2).replace('.', ','),
      'novo-' + pedido.id,
      '/dashboard'
    );
  },

  // Pedido pronto (dashboard notifica equipe)
  pedidoPronto: function(pedido) {
    const num = (pedido.id || '').slice(-4).toUpperCase();
    tocarBip('pronto');
    notifLocal(
      '✅ Pedido #' + num + ' PRONTO!',
      (pedido.cliente_nome || 'Cliente') + ' está esperando.',
      'pronto-' + pedido.id,
      '/dashboard'
    );
  },

  // Som de bip
  bip: tocarBip,

  // Notificação WhatsApp para cliente
  notificarCliente,

  // Instalar como app
  instalarApp,

  // Salva config da Evolution API
  salvarConfigNotif: function(cfg) {
    const atual = JSON.parse(localStorage.getItem('pw_notif_cfg') || '{}');
    localStorage.setItem('pw_notif_cfg', JSON.stringify({ ...atual, ...cfg }));
  },

  carregarConfigNotif: function() {
    return JSON.parse(localStorage.getItem('pw_notif_cfg') || '{}');
  }
};

// ── AUTO-INIT ────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.PediwayNotif.init());
} else {
  window.PediwayNotif.init();
}

})();
