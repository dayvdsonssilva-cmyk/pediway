// src/orders.js
import { state } from './config.js';
import { showNotif, saveCurrentUser } from './utils.js';
import { getSupa } from './supabase.js';

let realtimeChannel = null;

// ── Sanitização HTML — evita XSS com dados vindos do banco ───────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── Parse seguro de JSON — nunca lança exceção ───────────────────────────────
function parseSeguro(val, fallback = []) {
  if (Array.isArray(val)) return val;
  if (typeof val !== 'string') return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

// ── Renderiza lista de pedidos ───────────────────────────────────────────────
export function renderOrdersList() {
  const container = document.getElementById('new-orders-container') || document.getElementById('orders-list');
  if (!container) return;

  const orders = state.currentUser?.orders || [];
  const newOrders = orders.filter(o => o.status === 'new');

  const countEl = document.getElementById('new-orders-count');
  if (countEl) countEl.textContent = newOrders.length > 0 ? ` (${newOrders.length})` : '';

  if (newOrders.length === 0) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#888;">Nenhum novo pedido no momento</div>';
    return;
  }

  // Usa data-id real do banco em vez de índice do array (evita race condition)
  container.innerHTML = newOrders.map(order => {
    const itens = Array.isArray(order.items)
      ? order.items.map(i => `${esc(String(i.qty || i.qtd || 1))}x ${esc(String(i.name || i.nome || ''))}`).join(', ')
      : '';

    return `<div class="order-card" style="background:#fff;border:2px solid #FF6B00;border-radius:12px;padding:16px;margin-bottom:12px;">
        <div style="font-weight:700;color:#FF6B00;">${esc(order.dbId || order.id || '—')} - ${esc(order.client)}</div>
        <div style="font-size:0.9rem;color:#666;">${itens}</div>
        <div style="margin-top:10px;display:flex;gap:8px;">
          <button
            onclick="acceptOrder('${esc(order.dbId)}')"
            style="background:#FF6B00;color:white;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;flex:1;">
            ✅ Aceitar
          </button>
          <button
            onclick="rejectOrder('${esc(order.dbId)}')"
            style="background:#eee;color:#333;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;flex:1;">
            Recusar
          </button>
        </div>
      </div>`;
  }).join('');
}

// ── Aceitar pedido — atualiza o BANCO, não só o estado local ────────────────
window.acceptOrder = async function(dbId) {
  if (!dbId) return;

  const supa = getSupa();
  if (!supa) return showNotif('Erro', 'Sem conexão com o banco.');

  // Verifica sessão antes de qualquer operação
  const { data: { session } } = await supa.auth.getSession();
  if (!session?.user) return showNotif('Sessão expirada', 'Faça login novamente.');

  try {
    const { error } = await supa
      .from('pedidos')
      .update({ status: 'preparo' })
      .eq('id', dbId)
      .eq('estabelecimento_id', state.currentUser?.estabId); // garante que só aceita os próprios pedidos

    if (error) throw error;

    // Atualiza estado local após confirmação do banco
    if (state.currentUser?.orders) {
      const order = state.currentUser.orders.find(o => o.dbId === dbId);
      if (order) order.status = 'preparing';
      saveCurrentUser();
    }

    renderOrdersList();
    showNotif('✅ Pedido aceito', 'Status atualizado no banco.');
  } catch (e) {
    showNotif('Erro ao aceitar pedido', 'Tente novamente.');
  }
};

// ── Recusar pedido — atualiza o BANCO, não só o estado local ────────────────
window.rejectOrder = async function(dbId) {
  if (!dbId) return;
  if (!confirm('Tem certeza que deseja recusar este pedido?')) return;

  const supa = getSupa();
  if (!supa) return showNotif('Erro', 'Sem conexão com o banco.');

  const { data: { session } } = await supa.auth.getSession();
  if (!session?.user) return showNotif('Sessão expirada', 'Faça login novamente.');

  try {
    const { error } = await supa
      .from('pedidos')
      .update({ status: 'recusado' })
      .eq('id', dbId)
      .eq('estabelecimento_id', state.currentUser?.estabId);

    if (error) throw error;

    if (state.currentUser?.orders) {
      const order = state.currentUser.orders.find(o => o.dbId === dbId);
      if (order) order.status = 'rejected';
      saveCurrentUser();
    }

    renderOrdersList();
    showNotif('❌ Pedido recusado', 'Status atualizado no banco.');
  } catch (e) {
    showNotif('Erro ao recusar pedido', 'Tente novamente.');
  }
};

// ── Realtime ──────────────────────────────────────────────────────────────────
export function iniciarRealtimePedidos() {
  const supa = getSupa();
  if (!supa) return;

  // Verifica autenticação via Supabase, não só via localStorage
  supa.auth.getSession().then(({ data: { session } }) => {
    if (!session?.user) return; // não inicia se não autenticado

    const estabId = state.currentUser?.estabId || state.currentUser?.id;
    if (!estabId) return;

    // Remove canal antigo antes de criar novo
    if (realtimeChannel) {
      supa.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    realtimeChannel = supa
      .channel('pedidos-' + estabId) // canal único por estabelecimento
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'pedidos',
        filter: `estabelecimento_id=eq.${estabId}`,
      }, (payload) => {
        const novo = payload.new;
        if (!novo || !novo.id) return;

        // Parse seguro dos itens — nunca lança exceção
        const itens = parseSeguro(novo.itens || novo.items, []);

        const novoPedido = {
          dbId:   novo.id,                       // ID real do banco
          id:     '#' + String(novo.id).slice(-4), // exibição
          client: String(novo.cliente_nome || novo.client_name || 'Cliente').slice(0, 100),
          // Não armazena telefone/endereço no estado local (dados sensíveis de PII)
          items:  itens,
          total:  Number(novo.total) || 0,
          status: 'new',
          time:   'agora',
        };

        if (!state.currentUser.orders) state.currentUser.orders = [];
        state.currentUser.orders.unshift(novoPedido);

        // Salva estado sem PII sensível
        saveCurrentUser();
        renderOrdersList();
        tocarSomNovoPedido();
        showNotif('🛎 Novo Pedido!', `${novoPedido.client} - R$ ${novoPedido.total.toFixed(2)}`);
      })
      .subscribe((status) => {
        // Log mínimo sem dados sensíveis — apenas em dev
        if (import.meta.env.DEV) {
          console.log('[Realtime] Status:', status);
        }
      });
  });
}

export function tocarSomNovoPedido() {
  try {
    const audio = new Audio('/notificacao.mp3');
    audio.volume = 0.8;
    audio.play().catch(() => {}); // falha silenciosa se browser bloquear
  } catch { /* sem áudio disponível */ }
}

window.renderOrdersList       = renderOrdersList;
window.iniciarRealtimePedidos = iniciarRealtimePedidos;
