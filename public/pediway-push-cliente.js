// pediway-push-cliente.js
// Inclua nas páginas do CLIENTE (lojas.html, cardápio, pedido)
// <script src="/pediway-push-cliente.js"></script>
//
// ⚠️  IMPORTANTE: Substitua VAPID_PUBLIC_KEY pela sua chave pública real
//     (gerada com: npx web-push generate-vapid-keys)

(function () {
'use strict';

// ── CONFIGURE AQUI ────────────────────────────────────────────────────────────
const VAPID_PUBLIC_KEY = 'BDDEWNxtb20sU1B-lJw2bZvTfMxBWahe7_rLzn4D5ljZqKIh-PbH5kS29XI-VzdG-QfUMdovNJn7uXOLYve828w';
const SUPABASE_URL     = 'https://nmttkjmfazcipefeakkx.supabase.co';
const SUPABASE_ANON    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdHRram1mYXpjaXBlZmVha2t4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTM3NjQsImV4cCI6MjA5MDI4OTc2NH0.MMTX_6iQJk7Uv3HPSk0m32_BihvqsWhHJ_qiRkw0WYo';

// Converte chave pública VAPID (base64url → Uint8Array)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Salva subscription no Supabase vinculada ao pedido
async function salvarSubscription(pedidoId, subscription) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':         SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Prefer':        'return=minimal'
      },
      body: JSON.stringify({ pedido_id: pedidoId, subscription })
    });
    console.log('[Push] Subscription salva para pedido:', pedidoId);
  } catch (e) {
    console.warn('[Push] Erro ao salvar subscription:', e.message);
  }
}

// ── FUNÇÃO PRINCIPAL — chame após o pedido ser feito ─────────────────────────
async function ativarNotificacoesPedido(pedidoId) {
  // Verifica suporte
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Push] Dispositivo não suporta push notifications');
    return false;
  }
  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.includes('COLE_SUA')) {
    console.warn('[Push] Configure a VAPID_PUBLIC_KEY no pediway-push-cliente.js');
    return false;
  }

  try {
    // Pede permissão
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      console.log('[Push] Permissão negada pelo usuário');
      return false;
    }

    // Aguarda SW estar pronto
    const reg = await navigator.serviceWorker.ready;

    // Verifica se já tem subscription
    let sub = await reg.pushManager.getSubscription();

    // Se não tem, cria uma nova
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    // Salva no banco vinculada ao pedido
    await salvarSubscription(pedidoId, sub.toJSON());
    return true;

  } catch (e) {
    console.warn('[Push] Erro ao ativar notificações:', e.message);
    return false;
  }
}

// ── BANNER DE NOTIFICAÇÃO — aparece após o pedido ────────────────────────────
function mostrarBannerNotif(pedidoId) {
  // Não mostra se já tem permissão ou foi recusado
  if (Notification.permission === 'denied') return;
  if (Notification.permission === 'granted') {
    ativarNotificacoesPedido(pedidoId);
    return;
  }

  // iOS Safari: push só funciona quando instalado como PWA
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

  // Cria banner
  const banner = document.createElement('div');
  banner.id = 'pw-push-banner';
  banner.innerHTML = `
    <div style="
      position:fixed;bottom:0;left:0;right:0;z-index:9999;
      background:#fff;border-top:2px solid #C0001A;
      padding:16px 20px;box-shadow:0 -4px 20px rgba(0,0,0,.15);
      display:flex;align-items:center;gap:14px;
      font-family:'Poppins',system-ui,sans-serif;
      animation:slideUp .3s ease;
    ">
      <div style="font-size:32px;flex-shrink:0">🔔</div>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:800;color:#111;margin-bottom:2px">
          Ativar notificações do pedido?
        </div>
        <div style="font-size:12px;color:#888;line-height:1.4">
          ${isIOS && !isStandalone
            ? 'Adicione ao início (Safari → Compartilhar → Tela de Início) para receber avisos'
            : 'Receba aviso quando seu pedido for aceito, preparado e entregue'}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0">
        ${(!isIOS || isStandalone) ? `
        <button id="pw-btn-ativar" style="
          background:#C0001A;color:#fff;border:none;border-radius:10px;
          padding:10px 16px;font-size:13px;font-weight:800;cursor:pointer;
          font-family:inherit;white-space:nowrap;
        ">✓ Ativar</button>` : ''}
        <button id="pw-btn-fechar" style="
          background:none;color:#aaa;border:1px solid #e5e7eb;border-radius:10px;
          padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;
          font-family:inherit;white-space:nowrap;
        ">Agora não</button>
      </div>
    </div>
    <style>
      @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
    </style>
  `;

  document.body.appendChild(banner);

  document.getElementById('pw-btn-ativar')?.addEventListener('click', async () => {
    banner.remove();
    const ok = await ativarNotificacoesPedido(pedidoId);
    if (ok) mostrarConfirmacaoNotif();
  });

  document.getElementById('pw-btn-fechar')?.addEventListener('click', () => {
    banner.remove();
  });
}

function mostrarConfirmacaoNotif() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div style="
      position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
      background:#16a34a;color:#fff;padding:12px 20px;border-radius:12px;
      font-family:'Poppins',system-ui,sans-serif;font-size:13px;font-weight:700;
      z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2);white-space:nowrap;
    ">✅ Notificações ativadas! Você será avisado sobre seu pedido.</div>
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── API PÚBLICA ───────────────────────────────────────────────────────────────
window.PediwayPushCliente = {
  // Chame APÓS o pedido ser feito com sucesso
  // Mostra banner pedindo permissão
  aposConfirmarPedido: function (pedidoId) {
    if (!pedidoId) return;
    setTimeout(() => mostrarBannerNotif(pedidoId), 1500);
  },

  // Ativa direto sem banner (se já tem permissão)
  ativar: ativarNotificacoesPedido
};

})();
