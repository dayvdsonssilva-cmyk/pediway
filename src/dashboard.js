// src/dashboard.js
import { getSupa } from './supabase.js';
import { showToast } from './utils.js';
// ── PUSH NOTIFICATION PARA CLIENTE ───────────────────────────────────────────
async function enviarPushCliente(pedidoId, status, isDelivery) {
  if (!pedidoId || !status) return;
  try {
    await fetch('/api/push-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoId: String(pedidoId), status, isDelivery: !!isDelivery })
    });
  } catch(e) {
    console.warn('[Push] Erro ao notificar cliente:', e.message);
  }
}





// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────
const BASE_URL = 'https://pediway.com.br';
const CORES = [
  // Cores sólidas
  '#C0392B','#E74C3C','#E67E22','#F39C12','#F1C40F',
  '#27AE60','#16A085','#1ABC9C','#2980B9','#3498DB',
  '#8E44AD','#9B59B6','#2C3E50','#34495E','#7F8C8D',
  '#D35400','#C0392B','#1A252F','#6C3483','#1B4F72',
  // Gradientes (salvos como string especial)
  'grad:linear-gradient(135deg,#C0392B,#E74C3C)',
  'grad:linear-gradient(135deg,#E67E22,#F39C12)',
  'grad:linear-gradient(135deg,#27AE60,#1ABC9C)',
  'grad:linear-gradient(135deg,#2980B9,#8E44AD)',
  'grad:linear-gradient(135deg,#2C3E50,#4CA1AF)',
  'grad:linear-gradient(135deg,#C0392B,#8E44AD)',
  'grad:linear-gradient(135deg,#F39C12,#27AE60)',
  'grad:linear-gradient(135deg,#2980B9,#16A085)',
  'grad:linear-gradient(135deg,#1A252F,#C0392B)',
  'grad:linear-gradient(135deg,#D35400,#F39C12)',
];
const EMOJIS   = ['🍔','🍕','🌮','🥪','🍜','🥗','🍗','🥩','🫕','🥘','🍱','🧆','🍣','🍦','🧁','🎂','🥤','🧃','☕','🧋'];

// ─────────────────────────────────────────────────────────────────────────────
// ESTADO
// ─────────────────────────────────────────────────────────────────────────────
let emojiSel    = '🍔';
let fotosFiles  = [];
let fotosPosX   = [];
let fotosPosY   = [];
let logoFile    = null;
let corAtiva    = '#C0392B';
let realtimeSub = null;
let pollingId   = null;
let _audioAtual = null; // instância de Audio ativa
let pedidosConhecidos = new Set();
var _novosPedidosPendentes = new Set();
var _somLoop = null;
function pararSomPedidos(){if(_somLoop){clearInterval(_somLoop);_somLoop=null;}}
function tocarSomNovoPedido(idP){
  _novosPedidosPendentes.add(idP);
  if(_somLoop)return;
  function bip(){
    if(!_novosPedidosPendentes.size){pararSomPedidos();return;}
    try{var a=new Audio('/notificacao.mp3');a.volume=0.8;a.play().catch(function(){});}catch(e){}
  }
  bip();_somLoop=setInterval(bip,5000);
}
function marcarPedidoOuvido(idP){_novosPedidosPendentes.delete(idP);}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
// Formata valor em R$ — declarada no topo para garantir escopo em todo o módulo
const fmtR = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
const getEstab = () => {
  if (window._estab) return window._estab;
  try { return JSON.parse(localStorage.getItem('pw_estab') || 'null'); } catch(e) { return null; }
};

function normalizeHex(cor) {
  if (!cor) return '#C0392B';
  if (cor.startsWith('grad:')) return cor.replace('grad:', ''); // gradiente
  if (cor.startsWith('#')) return cor;
  if (cor.startsWith('linear-gradient')) return cor;
  const m = cor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) return '#' + [m[1],m[2],m[3]].map(n => (+n).toString(16).padStart(2,'0')).join('');
  return '#C0392B';
}
function isGradient(cor) { return cor && (cor.startsWith('grad:') || cor.startsWith('linear-gradient')); }
function gradToHex(cor) {
  // Extrai a primeira cor do gradiente para uso em contextos que precisam de hex
  const m = (cor || '').match(/#[0-9a-fA-F]{6}/);
  return m ? m[0] : '#C0392B';
}

async function uploadFile(bucket, path, file) {
  const { error } = await getSupa().storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw new Error('Upload falhou: ' + error.message);
  return getSupa().storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────
// ── Restrição por plano ──────────────────────────────────────────────────────
function aplicarRestricaoPlano(estab) {
  const plano   = estab?.plano || 'basico';
  const criado  = estab?.created_at ? new Date(estab.created_at) : null;
  const diasTrial = criado ? Math.floor((Date.now() - criado) / 86400000) : 999;
  const trialAtivo = plano === 'basico' && !(diasTrial > 15);
  const diasRestantes = Math.max(0, 15 - diasTrial);

  // Tabs disponíveis por plano:
  // Trial (basico, até 15 dias): TUDO
  // Pro: visao, pedidos, cardapio, fresquinho, configuracoes
  // Premium: visao, pedidos, comandas, cardapio, fresquinho, financeiro, configuracoes
  // Trial vencido (basico > 15 dias): apenas visao + configuracoes (forçar upgrade)

  const CONFIG_PLANOS = {
    basico_ativo:  ['visao-geral','pedidos-tab','comandas','cardapio','fresquinho','financeiro','configuracoes'],
    basico_vencido:['visao-geral','configuracoes'],
    pro:           ['visao-geral','pedidos-tab','cardapio','fresquinho','configuracoes'],
    premium:       ['visao-geral','pedidos-tab','comandas','cardapio','fresquinho','financeiro','configuracoes'],
  };

  const chave = plano === 'basico'
    ? (trialAtivo ? 'basico_ativo' : 'basico_vencido')
    : (plano === 'pro' ? 'pro' : 'premium');

  const permitidas = CONFIG_PLANOS[chave] || CONFIG_PLANOS.pro;

  // Aplica visibilidade em todas as abas
  ['visao-geral','pedidos-tab','comandas','cardapio','fresquinho','financeiro','configuracoes'].forEach(tab => {
    const btn = document.querySelector(`[data-tab="${tab}"]`);
    const pg  = document.getElementById(`tab-${tab}`);
    const vis = permitidas.includes(tab);
    if (btn) btn.style.display = vis ? '' : 'none';
    if (pg)  pg.style.display  = vis ? '' : 'none';
  });

  // Banner trial
  const bannerTrial = document.getElementById('banner-trial');
  if (bannerTrial) {
    if (plano === 'basico' && trialAtivo) {
      bannerTrial.style.display = 'flex';
      const diasEl = document.getElementById('trial-dias');
      if (diasEl) diasEl.textContent = diasRestantes === 0 ? 'Último dia!' : `${diasRestantes} dia${diasRestantes !== 1 ? 's' : ''} restante${diasRestantes !== 1 ? 's' : ''}`;
    } else {
      bannerTrial.style.display = 'none';
    }
  }

  // Banner upgrade (trial vencido ou plano básico expirado)
  const banner = document.getElementById('banner-upgrade');
  if (banner) banner.style.display = (plano === 'basico' && !trialAtivo) ? 'flex' : 'none';
}

// Link ME AJUDA PEDIWAY — atualizado via carregarConfigPlataforma() (Supabase)
// Função legada removida — não usa mais localStorage/pw_ceo_cfg


// ── CHECKOUT / PLANOS ─────────────────────────────────────────────────────────
window.irCheckout = function(plano) {
  const estab = getEstab();
  if (!estab) return showToast('Faça login primeiro.', 'error');
  // Usa preços do Supabase (definidos no mandaadmin) — nunca do cache local
  const pro  = _platformConfig.precoPro  || '49';
  const prem = _platformConfig.precoPrem || '99';
  window.open(`/checkout?plano=${plano}&estab=${estab.id}&precoPro=${pro}&precoPrem=${prem}`, '_blank');
};

// Atualiza preços no dashboard — usa _platformConfig (Supabase via mandaadmin)
function atualizarPrecosDash() {
  const pro  = _platformConfig.precoPro  || '49';
  const prem = _platformConfig.precoPrem || '99';
  const elPro  = document.getElementById('dash-preco-pro');
  const elPrem = document.getElementById('dash-preco-prem') || document.getElementById('dash-preco-premium');
  if (elPro)  elPro.textContent  = pro;
  if (elPrem) elPrem.textContent = prem;
}

function atualizarInfoPlano() {
  const estab = getEstab();
  if (!estab) return;
  const el    = document.getElementById('cfg-plano-atual');
  const elvenc= document.getElementById('cfg-venc-atual');
  const nomes = { basico:'Trial (grátis)', pro:'Pro', premium:'Premium' };
  if (el)    el.textContent = nomes[estab.plano] || 'Trial';
  if (elvenc && estab.assinatura_vencimento) {
    const venc = new Date(estab.assinatura_vencimento);
    const hoje = new Date();
    const dias = Math.round((venc - hoje) / 86400000);
    elvenc.textContent = dias > 0
      ? `Vence em ${dias} dia${dias !== 1 ? 's' : ''} (${venc.toLocaleDateString('pt-BR')})`
      : `Assinatura vencida em ${venc.toLocaleDateString('pt-BR')}`;
    if (!(5 < dias)) elvenc.style.color = '#C0392B';
  }
}

export async function initDashboard() {
  let estab = getEstab();
  if (!estab) return;
  // carregarConfigPlataforma() já atualiza o link
  atualizarInfoPlano();
  aplicarRestricaoPlano(estab);
  atualizarPrecosDash();
  atualizarBotaoCancelar(estab);

  // SEMPRE busca dados frescos do banco — garante sync entre mobile e desktop
  if (!window._isDemo) {
    try {
      const { data: fresh } = await getSupa()
        .from('estabelecimentos').select('*').eq('id', estab.id).maybeSingle();
      if (fresh) {
        estab = fresh;
        window._estab = fresh;
        localStorage.setItem('pw_estab', JSON.stringify(fresh));
        // Sincroniza número de mesas do banco para o localStorage local
        if (fresh.num_mesas) {
          localStorage.setItem('pw_num_mesas_' + fresh.id, String(fresh.num_mesas));
        }
      }
    } catch(e) { console.log('Sync estab:', e); }
  }

  // Textos do header
  const sn = $('dash-store-name'); if (sn) sn.textContent = estab.nome;
  const lu = $('link-url');        if (lu) lu.textContent = `${BASE_URL}/${estab.slug}`;
  const lug = $('link-url-garcom');if (lug) lug.textContent = `${BASE_URL}/comandas/${estab.slug}`;
  const luk = $('link-url-kds'); if (luk) luk.textContent = `${BASE_URL}/kds/${estab.slug}`;

  // Preenche configurações
  preencherConfig(estab);
  if (estab.logo_url) mostrarLogoPreview(estab.logo_url);

  // Cor e capa
  corAtiva = normalizeHex(estab.cor_primaria || '#C0392B'); // usada só no cardápio
  renderCores(corAtiva);
  aplicarCorDash(corAtiva);
  mostrarCapaPreview(corAtiva);

  // Status loja
  atualizarBadgeLoja(estab.aberto !== false);
  const cbAberto = $('cfg-aberto');
  if (cbAberto) cbAberto.checked = estab.aberto !== false;
  // Taxa entrega
  const tw = document.getElementById('taxa-entrega-wrap');
  if (tw) tw.style.display = estab.faz_entrega !== false ? 'block' : 'none';

  // Dados
  if (!window._isDemo) {
    await renderCardapio();
    await restaurarCaixa();
    await verificarExpiracaoQuente();
    await renderFresquinho();
    carregarConfigPlataforma(); // número de suporte do mandaadmin
    await renderPedidos();
    await carregarFinanceiro();
    iniciarRealtime();
    await carregarPedidosMesas();
    renderMesas();
    window.renderHistoricoMesas();
    renderEmojiGrid();
  } else {
    renderCardapioDemo();
    renderPedidosDemo();
    renderEmojiGrid();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
function preencherConfig(estab) {
  const set = (id, val) => { const el = $(id); if (el && val != null) el.value = val; };
  set('cfg-nome',      estab.nome);
  set('cfg-slug',      estab.slug);
  set('cfg-whats',     estab.whatsapp || '');
  set('cfg-desc', estab.descricao || '');
  const descCount = document.getElementById('cfg-desc-count');
  if(descCount) descCount.textContent = (estab.descricao||'').length + '/80';
  set('cfg-endereco',  estab.endereco || '');
  set('cfg-tempo',     estab.tempo_entrega || '30-45 min');
  set('cfg-telefone',  estab.telefone_contato || '');
  set('cfg-cnpj',      estab.cnpj || '');
  set('cfg-instagram', estab.instagram || '');
  set('cfg-tiktok',    estab.tiktok || '');
  set('cfg-site',      estab.site || '');
  set('cfg-msg-nota',  estab.msg_nota || '');
  // Horários de funcionamento
  if (typeof window.renderHorariosCfg === 'function') window.renderHorariosCfg(estab.horarios || null);
  // Tipo do estabelecimento (nicho)
  if (typeof window.renderTipoCfgGrid === 'function') window.renderTipoCfgGrid(estab.tipo_estab || estab.tipo_estabelecimento || '');
  const _cfgTipo = document.getElementById('cfg-tipo-estab');
  if (_cfgTipo) _cfgTipo.value = estab.tipo_estab || estab.tipo_estabelecimento || '';
  const cfgLink = $('cfg-link-preview');
  if (cfgLink) { cfgLink.textContent = `${BASE_URL}/${estab.slug}`; Object.assign(cfgLink.style,{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block',maxWidth:'100%'}); }
  const cfgLinkGarcom = $('cfg-link-garcom');
  if (cfgLinkGarcom) { cfgLinkGarcom.textContent = `${BASE_URL}/comandas/${estab.slug}`; Object.assign(cfgLinkGarcom.style,{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block',maxWidth:'100%',flex:'1',minWidth:'0'}); }
  const ce = $('cfg-entrega');  if (ce) ce.checked = estab.faz_entrega  !== false;
  const cr = $('cfg-retirada'); if (cr) cr.checked = estab.faz_retirada !== false;
  const ct = $('cfg-taxa');     if (ct) ct.value   = estab.taxa_entrega || '';
  const cp = $('cfg-pix');      if (cp) cp.checked = estab.aceita_pix      !== false;
  const cc = $('cfg-cartao');   if (cc) cc.checked = estab.aceita_cartao   !== false;
  const cd = $('cfg-dinheiro'); if (cd) cd.checked = estab.aceita_dinheiro !== false;
  // Taxa de serviço
  // ── Onboarding: aparece UMA VEZ para todo mundo ──────────────────────
  try {
    var _obKey = 'pw_ob_' + estab.id;
    if (!localStorage.getItem(_obKey)) {
      localStorage.setItem(_obKey, '1');
      setTimeout(function() {
        if (typeof mostrarOnboarding === 'function') mostrarOnboarding(estab);
      }, 1200);
    }
  } catch(e) {}

  // ── Botão PEDI-AI ─────────────────────────────────────────────────────
  try {
    var _paiBtn = document.getElementById('pedi-ai-btn');
    if (_paiBtn) _paiBtn.classList.add('show');
  } catch(e) {}

  // Inicia verificação automática de horário de funcionamento
  try { iniciarAutoHorario(); } catch(e) {}

  const ctsToggle = $('cfg-taxa-servico');
  const ctsWrap   = document.getElementById('cfg-taxa-servico-wrap');
  const ctsPerc   = $('cfg-perc-servico');

  // KDS toggle init
  try {
    var _kc = $('cfg-usa-setores'), _tr = document.getElementById('kds-track'), _th = document.getElementById('kds-thumb');
    if (_kc) {
      var _on = !!estab.usa_setores;
      _kc.checked = _on;
      if (_tr) _tr.style.background = _on ? '#E8001C' : '#ddd';
      if (_th) _th.style.transform  = _on ? 'translateX(20px)' : 'translateX(0)';
      var _sec = $('cfg-kds-section'); if (_sec) _sec.style.display = _on ? 'block' : 'none';
      if (_on) setTimeout(function(){ try{window.renderKdsLinks&&window.renderKdsLinks(estab);}catch(e){} }, 400);
    }
  } catch(e) {}
  if (ctsToggle) ctsToggle.checked = estab.taxa_servico === true;
  if (ctsWrap)   ctsWrap.style.display = estab.taxa_servico ? 'block' : 'none';
  if (ctsPerc)   ctsPerc.value = estab.perc_servico || 10;
  // Carrega estados e restaura estado + cidade salvos
  if (typeof window.carregarEstadosDash === 'function') {
    window.carregarEstadosDash({ estado: estab.estado || null, cidade: estab.cidade || null });
  }
}

function aplicarCorDash(cor) {
  // NÃO aplica no dashboard — cor é só para o cardápio do cliente
  // Dashboard mantém sempre o vermelho padrão (#C0392B)
  const hex = isGradient(cor) ? gradToHex(cor) : cor;
  // Só atualiza o preview da capa nas configurações
  const capaPreview = $('capa-preview');
  if (capaPreview) capaPreview.style.background = hex;
}

function renderCores(ativa) {
  const grid = $('cores-grid'); if (!grid) return;
  grid.innerHTML = CORES.map(c => `
    <div class="cor-opcao ${c === ativa ? 'ativa' : ''}"
         style="background:${c}"
         data-hex="${c}"
         onclick="selecionarCor('${c}',this)"
         title="${c}"></div>`).join('');
}

window.selecionarCor = function(hex, el) {
  corAtiva = hex;
  document.querySelectorAll('.cor-opcao').forEach(e => e.classList.remove('ativa'));
  if (el) el.classList.add('ativa');
  aplicarCorDash(hex);
  // Atualiza preview da capa se não tiver imagem
  const prev = $('capa-preview');
  if (prev) prev.style.background = isGradient(hex) ? hex : hex;
};

function atualizarBadgeLoja(aberto) {
  const b = $('loja-status-badge'); if (!b) return;
  b.className = 'loja-status-badge ' + (aberto ? 'loja-aberta' : 'loja-fechada');
  b.textContent = aberto ? 'Aberta' : 'Fechada';
}

window.atualizarStatusLoja = function(aberto) { atualizarBadgeLoja(aberto); };

// ─────────────────────────────────────────────────────────────────────────────
// LOGO
// ─────────────────────────────────────────────────────────────────────────────
function mostrarLogoPreview(url) {
  var img = $('logo-preview-img') || document.getElementById('logo-preview-img');
  var txt = $('logo-placeholder-text') || document.getElementById('logo-placeholder-text');
  var wrap = document.getElementById('logo-upload-wrap');
  if (img) { img.src = url; img.style.display = 'block'; img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover'; }
  if (txt) txt.style.display = 'none';
  if (wrap) wrap.style.border = '2px solid var(--red)'; // feedback visual
}

export function previewLogo(event) {
  const file = event.target.files[0]; if (!file) return;
  logoFile = file;
  mostrarLogoPreview(URL.createObjectURL(file));
}
window.previewLogo = previewLogo;

// Crop da logo — drag
let _cropDragging = false, _cropDragX = 0, _cropDragY = 0, _cropOfsX = 0, _cropOfsY = 0, _cropZoom = 100;

// ── Sistema de crop com canvas + safe area ──────────────────────────────────
let _CRP = { img:null, scale:1, offX:0, offY:0, minScale:0.5, canvasId:'', stageId:'', safePrefix:'' };

function crpDraw() {
  const cvs = document.getElementById(_CRP.canvasId);
  if (!cvs || !_CRP.img) return;
  const stage = document.getElementById(_CRP.stageId);
  const W = (stage ? stage.offsetWidth : 0) || cvs.offsetWidth || 340;
  if (10 > W) { setTimeout(crpDraw, 30); return; }
  const H = W;
  cvs.width = W; cvs.height = H; cvs.style.height = H + 'px';
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
  const iw = _CRP.img.naturalWidth, ih = _CRP.img.naturalHeight;
  const dw = iw * _CRP.scale, dh = ih * _CRP.scale;
  const dx = W/2 - dw/2 + _CRP.offX, dy = H/2 - dh/2 + _CRP.offY;
  ctx.drawImage(_CRP.img, dx, dy, dw, dh);
  const safe = Math.min(W,H) * 0.82;
  const sx = (W - safe) / 2, sy = (H - safe) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.52)';
  ctx.fillRect(0, 0, W, sy);
  ctx.fillRect(0, sy + safe, W, H - sy - safe);
  ctx.fillRect(0, sy, sx, safe);
  ctx.fillRect(sx + safe, sy, W - sx - safe, safe);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
  if (_CRP.safePrefix === 'cso') {
    // Guia: quadrado arredondado (border-radius equivalente)
    var r = safe * 0.13; // raio das bordas (~16px proporcional)
    var x0 = (W-safe)/2, y0 = (H-safe)/2, s = safe;
    ctx.beginPath();
    ctx.moveTo(x0+r, y0);
    ctx.lineTo(x0+s-r, y0); ctx.quadraticCurveTo(x0+s, y0, x0+s, y0+r);
    ctx.lineTo(x0+s, y0+s-r); ctx.quadraticCurveTo(x0+s, y0+s, x0+s-r, y0+s);
    ctx.lineTo(x0+r, y0+s); ctx.quadraticCurveTo(x0, y0+s, x0, y0+s-r);
    ctx.lineTo(x0, y0+r); ctx.quadraticCurveTo(x0, y0, x0+r, y0);
    ctx.closePath(); ctx.stroke();
  } else {
    ctx.strokeRect(sx, sy, safe, safe);
  }
  const cc = '#C0392B', cl = 18;
  ctx.strokeStyle = cc; ctx.lineWidth = 3; ctx.lineCap = 'round';
  [[sx,sy],[sx+safe,sy],[sx,sy+safe],[sx+safe,sy+safe]].forEach(([cx,cy],i) => {
    ctx.beginPath();
    ctx.moveTo(cx + (i%2===0?cl:0),cy); ctx.lineTo(cx + (i%2===0?0:-cl),cy);
    ctx.moveTo(cx,cy + (i<2?cl:0)); ctx.lineTo(cx,cy + (i<2?0:-cl));
    ctx.stroke();
  });
}

function crpApplyMinScale() {
  const stage = document.getElementById(_CRP.stageId);
  if (!stage || !_CRP.img) return;
  const W = stage.offsetWidth || 340;
  const safe = W * 0.82;
  const ms = Math.max(safe / _CRP.img.naturalWidth, safe / _CRP.img.naturalHeight);
  _CRP.minScale = ms;
  if (_CRP.minScale !== ms && ms > _CRP.scale) _CRP.scale = ms;
}

function crpClampOffset() {
  if (!_CRP.img) return;
  const stage = document.getElementById(_CRP.stageId);
  const W = stage ? stage.offsetWidth || 340 : 340;
  const safe = W * 0.82;
  const dw = _CRP.img.naturalWidth * _CRP.scale, dh = _CRP.img.naturalHeight * _CRP.scale;
  const maxX = Math.max(0, (dw - safe) / 2), maxY = Math.max(0, (dh - safe) / 2);
  _CRP.offX = Math.max(-maxX, Math.min(maxX, _CRP.offX));
  _CRP.offY = Math.max(-maxY, Math.min(maxY, _CRP.offY));
}

function crpInitDrag(stageId) {
  const el = document.getElementById(stageId); if (!el) return;
  // Remove listeners antigos do elemento
  if (el._crpDown)  { el.removeEventListener('mousedown', el._crpDown); el.removeEventListener('touchstart', el._crpDown); }
  if (el._crpWheel) el.removeEventListener('wheel', el._crpWheel);
  // Remove listeners antigos do document (evita acumulação)
  if (window._crpMoveHandler)  { document.removeEventListener('mousemove', window._crpMoveHandler); document.removeEventListener('touchmove', window._crpMoveHandler); }
  if (window._crpUpHandler)    { document.removeEventListener('mouseup', window._crpUpHandler); document.removeEventListener('touchend', window._crpUpHandler); }

  let dragging = false, lx = 0, ly = 0, pinchDist0 = 0, pinchScale0 = 1;
  const onDown = e => {
    e.preventDefault();
    if (e.touches && e.touches.length === 2) {
      pinchDist0 = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      pinchScale0 = _CRP.scale; dragging = false; return;
    }
    dragging = true;
    const t = e.touches ? e.touches[0] : e; lx = t.clientX; ly = t.clientY;
  };
  const onMove = e => {
    if (!dragging && !(e.touches && e.touches.length === 2)) return; // não bloqueia se não está arrastando
    e.preventDefault();
    if (e.touches && e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      _CRP.scale = Math.max(_CRP.minScale, Math.min(8, pinchScale0 * d / pinchDist0));
      crpClampOffset(); crpDraw(); return;
    }
    const t = e.touches ? e.touches[0] : e;
    _CRP.offX += t.clientX - lx; _CRP.offY += t.clientY - ly;
    lx = t.clientX; ly = t.clientY;
    crpClampOffset(); crpDraw();
  };
  const onUp = () => { dragging = false; };
  const onWheel = e => {
    e.preventDefault();
    _CRP.scale = Math.max(_CRP.minScale, Math.min(8, _CRP.scale * (1 - e.deltaY * 0.001)));
    crpClampOffset(); crpDraw();
  };
  el._crpDown = onDown; el._crpWheel = onWheel;
  el.addEventListener('mousedown', onDown, { passive:false });
  el.addEventListener('touchstart', onDown, { passive:false });
  el.addEventListener('wheel', onWheel, { passive:false });
  // Salva globalmente para poder remover depois
  window._crpMoveHandler = onMove;
  window._crpUpHandler   = onUp;
  document.addEventListener('mousemove', onMove); // SEM passive:false — não bloqueia scroll do doc
  document.addEventListener('touchmove', onMove); // SEM passive:false
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchend', onUp);
}

// Remove todos os listeners do crop ao fechar o modal
function crpCleanup() {
  if (window._crpMoveHandler) {
    document.removeEventListener('mousemove', window._crpMoveHandler);
    document.removeEventListener('touchmove', window._crpMoveHandler);
    window._crpMoveHandler = null;
  }
  if (window._crpUpHandler) {
    document.removeEventListener('mouseup', window._crpUpHandler);
    document.removeEventListener('touchend', window._crpUpHandler);
    window._crpUpHandler = null;
  }
  _CRP.img = null;
}

function crpGetBlob(canvasId, stageId, safePrefix, isCircle, callback) {
  const cvs = document.getElementById(canvasId); if (!cvs || !_CRP.img) { callback(null); return; }
  const W = cvs.width, safe = Math.floor(W * 0.82), sx = Math.floor((W - safe) / 2);
  const out = document.createElement('canvas');
  out.width = safe; out.height = safe;
  const ctx = out.getContext('2d');
  // Clip: quadrado arredondado proporcional ao tamanho
  var _r = safe * 0.13;
  ctx.beginPath();
  ctx.moveTo(_r, 0); ctx.lineTo(safe-_r, 0); ctx.quadraticCurveTo(safe, 0, safe, _r);
  ctx.lineTo(safe, safe-_r); ctx.quadraticCurveTo(safe, safe, safe-_r, safe);
  ctx.lineTo(_r, safe); ctx.quadraticCurveTo(0, safe, 0, safe-_r);
  ctx.lineTo(0, _r); ctx.quadraticCurveTo(0, 0, _r, 0);
  ctx.closePath(); ctx.clip();
  ctx.drawImage(cvs, sx, sx, safe, safe, 0, 0, safe, safe);
  out.toBlob(callback, 'image/jpeg', 0.92);
}
// ── Fim sistema crop ─────────────────────────────────────────────────────────

window.abrirCropLogo = function(event) {
  const file = event.target.files[0]; if (!file) return;
  logoFile = file;
  event.target.value = '';
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    _CRP.img = img; _CRP.offX = 0; _CRP.offY = 0;
    _CRP.canvasId = 'crop-canvas'; _CRP.stageId = 'crop-stage'; _CRP.safePrefix = 'cso';
    crpApplyMinScale(); _CRP.scale = _CRP.minScale;
    crpInitDrag('crop-stage');
    $('crop-overlay')?.classList.add('open');
    // Delay para garantir que o overlay está visível antes de desenhar
    setTimeout(() => { crpApplyMinScale(); crpDraw(); }, 50);
  };
  img.src = url;
};

window.aplicarCrop = function() {
  // Legacy: chamado pelo slider (mantemos por compatibilidade)
  crpDraw();
};
window.fecharCrop = function() {
  $('crop-overlay')?.classList.remove('open');
  logoFile = null;
  crpCleanup();
};
window.confirmarCrop = function() {
  crpGetBlob('crop-canvas', 'crop-stage', 'cso', false, blob => {
    if (!blob) return;
    logoFile = new File([blob], 'logo.jpg', { type: 'image/jpeg' });
    mostrarLogoPreview(URL.createObjectURL(blob));
    $('crop-overlay')?.classList.remove('open');
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// CAPA — apenas cor/gradiente (sem upload de imagem)
// ─────────────────────────────────────────────────────────────────────────────
function mostrarCapaPreview(cor) {
  const prev = $('capa-preview');
  if (prev) prev.style.background = isGradient(cor) ? cor : cor;
}

// ─────────────────────────────────────────────────────────────────────────────
// SALVAR CONFIG
// ─────────────────────────────────────────────────────────────────────────────
export async function salvarConfig() {
  const estab = getEstab(); if (!estab) return;

  const nome     = $('cfg-nome')?.value.trim();
  const slug     = $('cfg-slug')?.value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'-');
  const whats    = ($('cfg-whats')?.value || '').replace(/\D/g,''); // salva só dígitos → evita bug na recuperação de senha
  const desc     = $('cfg-desc')?.value.trim();
  const estado   = $('cfg-estado')?.value || null;
  const cidade   = $('cfg-cidade')?.value.trim() || null;
  const endereco = $('cfg-endereco')?.value.trim();
  const tempo    = $('cfg-tempo')?.value;
  const aberto   = $('cfg-aberto')?.checked;
  const entrega  = $('cfg-entrega')?.checked;
  const retirada = $('cfg-retirada')?.checked;
  // Novos campos
  const telefone_contato = $('cfg-telefone')?.value.trim() || null;
  const cnpj             = ($('cfg-cnpj')?.value || '').replace(/\D/g,'') || null;
  const instagram        = ($('cfg-instagram')?.value || '').trim().replace('@','') || null;
  const tiktok           = ($('cfg-tiktok')?.value || '').trim().replace('@','') || null;
  const site             = $('cfg-site')?.value.trim() || null;
  const msg_nota         = $('cfg-msg-nota')?.value.trim() || null;

  if (!nome || !slug) return showToast('Preencha nome e link.', 'error');

  try{var _kc2=$('cfg-usa-setores');if(_kc2) await getSupa().from('estabelecimentos').update({usa_setores:_kc2.checked}).eq('id',estab.id);}catch(e){}
  const btn = document.querySelector('[onclick="salvarConfig()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  try {
    // Verifica slug único
    if (slug !== estab.slug) {
      const { data: ex } = await getSupa().from('estabelecimentos').select('id').eq('slug', slug).maybeSingle();
      if (ex) throw new Error('Esse link já está em uso.');
    }

    // Upload logo
    let logo_url = estab.logo_url || null;
    if (logoFile) {
      logo_url = await uploadFile('fotos', `${estab.id}/logo_${Date.now()}.${logoFile.name.split('.').pop()}`, logoFile);
      logoFile = null;
    }

    // Cor — suporta gradientes
    const cor_primaria = normalizeHex(corAtiva);

    const taxa_entrega   = parseFloat($('cfg-taxa')?.value)     || 0;
    const aceita_pix     = $('cfg-pix')?.checked      !== false;
    const aceita_cartao  = $('cfg-cartao')?.checked   !== false;
    const aceita_dinheiro= $('cfg-dinheiro')?.checked !== false;
    const taxa_servico   = $('cfg-taxa-servico')?.checked === true;
    const perc_servico   = parseInt($('cfg-perc-servico')?.value) || 10;

    const updates = {
      nome, slug, whatsapp: whats, descricao: desc, estado, cidade, endereco,
      tempo_entrega: tempo, aberto, faz_entrega: entrega, faz_retirada: retirada,
      cor_primaria, logo_url,
      capa_url: null, capa_tipo: 'cor',
      taxa_entrega, aceita_pix, aceita_cartao, aceita_dinheiro,
      taxa_servico, perc_servico,
      telefone_contato, cnpj, instagram, tiktok, site, msg_nota,
      horarios: typeof window.getHorariosFromForm === 'function' ? window.getHorariosFromForm() : undefined,
      tipo_estab: document.getElementById('cfg-tipo-estab')?.value || null,
    };

    const { error } = await getSupa().from('estabelecimentos').update(updates).eq('id', estab.id);
    if (error) throw new Error(error.message);

    const novoEstab = { ...estab, ...updates };
    window._estab = novoEstab;
    localStorage.setItem('pw_estab', JSON.stringify(novoEstab));

    // Atualiza UI
    const sn = $('dash-store-name'); if (sn) sn.textContent = nome;
    const lu  = $('link-url');        if (lu)  lu.textContent  = `${BASE_URL}/${slug}`;
    const lug = $('link-url-garcom'); if (lug) lug.textContent = `${BASE_URL}/comandas/${slug}`;
    const luk2 = $('link-url-kds'); if (luk2) luk2.textContent = `${BASE_URL}/kds/${slug}`;
    const cl  = $('cfg-link-preview');
  if (cl) { cl.textContent = `${BASE_URL}/${slug}`; Object.assign(cl.style,{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block',maxWidth:'100%'}); }
    const clg = $('cfg-link-garcom'); if (clg) clg.textContent = `${BASE_URL}/comandas/${slug}`;
    atualizarBadgeLoja(aberto);
    aplicarCorDash(cor_primaria);

    showToast('Configurações salvas! ✅');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar configurações'; }
  }
}
window.salvarConfig = salvarConfig;
window.salvarConfiguracoes = salvarConfig; // alias para compatibilidade com HTML

// ─────────────────────────────────────────────────────────────────────────────
// CARDÁPIO
// ─────────────────────────────────────────────────────────────────────────────
async function renderCardapio() {
  const estab = getEstab();
  const grid  = $('cardapio-grid');
  const stat  = $('stat-itens');
  if (!grid || !estab) return;

  const { data } = await getSupa().from('produtos').select('*')
    .eq('estabelecimento_id', estab.id).order('created_at', { ascending: false });

  if (stat) stat.textContent = data?.length || 0;

  // Filtra por sub-aba
  const filtrado = (_dashSubTab === 'quente')
    ? (data||[]).filter(p => p.em_promocao && parseInt(p.desconto_percent||0) > 0)
    : (data||[]);

  // Atualiza foguinho
  atualizarFireDash();

  if (!filtrado?.length) {
    grid.innerHTML = _dashSubTab === 'quente'
      ? `<div class="empty-state-light" style="grid-column:1/-1"><span>🔥</span><p>Nenhum produto QUENTE ainda.<br><small>Use o botão 🔥 QUENTE para criar uma promoção</small></p></div>`
      : `<div class="empty-state-light" style="grid-column:1/-1"><span>🍽️</span><p>Nenhum item ainda. Adicione seu primeiro produto!</p></div>`;
    return;
  }

  grid.innerHTML = filtrado.map(p => `
    <div class="item-card">
      <div class="item-card-img">
        ${p.foto_url           ? '<img class="item-img" src="'+(p.foto_url)+'" alt="'+(p.nome)+'">'           : '<div class="item-emoji-bg">'+(p.emoji || '🍔')+'</div>'}
        <span class="item-disponivel">${p.disponivel ? 'Disponível' : 'Indisponível'}</span>
        ${p.promocao ? '<span class="item-promo-badge">🔥 Promoção</span>' : ''}

      </div>
      <div class="item-body">
        <div class="item-categoria">${p.categoria || 'SEM CATEGORIA'}</div>
        <div class="item-nome">${p.nome}</div>
        <div class="item-desc-text">${p.descricao || ''}</div>
        <div class="item-footer">
          <div>
            ${p.em_promocao && p.desconto_percent > 0               ? '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">                   <span class="item-promo-badge" style="background:var(--red);color:#fff;font-size:.65rem;font-weight:800;padding:2px 8px;border-radius:6px;">🔥 '+(p.desconto_percent)+'% OFF</span>                   <span class="item-preco-original">R$ '+(Number(p.preco_original||p.preco).toFixed(2).replace('.',','))+'</span>                 </div>                 <div class="item-preco" style="color:var(--red);">R$ '+(Number(p.preco).toFixed(2).replace('.',','))+'</div>'               : p.promocao && p.preco_original                 ? '<div class="item-preco-original">R$ '+(Number(p.preco_original).toFixed(2).replace('.',','))+'</div>                    <div class="item-preco">R$ '+(Number(p.preco).toFixed(2).replace('.',','))+'</div>'                 : '<div class="item-preco">R$ '+(Number(p.preco).toFixed(2).replace('.',','))+'</div>'}
          </div>
          <div class="item-acoes">
            <button class="btn-icon" onclick="editarItem('${p.id}')">✏️</button>
            <button class="btn-icon danger" onclick="deletarItem('${p.id}')">🗑️</button>
          </div>
        </div>
      </div>
    </div>`).join('');
}

function renderPedidosDemo() {
  // Visão geral zerada — demo mostruário
  const sp = $('stat-pedidos');     if (sp) sp.textContent = '0';
  const sf = $('stat-faturamento'); if (sf) sf.textContent = 'R$ 0,00';

  // Sem pedidos na lista
  const lista = $('pedidos-novos-lista');
  if (lista) {
    lista.innerHTML = `<div style="text-align:center;padding:40px 20px;color:#aaa">
      <div style="font-size:2.5rem;margin-bottom:10px">🎉</div>
      <div style="font-size:.88rem;font-weight:700;color:#555;margin-bottom:6px">Nenhum pedido ainda</div>
      <div style="font-size:.76rem">Crie sua conta e receba pedidos reais!</div>
    </div>`;
  }

  // Badge sem notificação
  const badgeW = $('badge-pedidos-wrap'); if (badgeW) badgeW.style.display = 'none';
}


function renderCardapioDemo() {
  const grid = $('cardapio-grid'); const stat = $('stat-itens');
  const demo = [
    { nome:'X-Burguer Especial', categoria:'LANCHES', preco:28.90, emoji:'🍔' },
    { nome:'X-Tudo',             categoria:'LANCHES', preco:34.90, emoji:'🍔' },
    { nome:'Batata Frita Grande', categoria:'ACOMPANHAMENTOS', preco:14.90, emoji:'🍟' },
    { nome:'Onion Rings',        categoria:'ACOMPANHAMENTOS', preco:12.90, emoji:'🧅' },
    { nome:'Refrigerante 350ml', categoria:'BEBIDAS', preco:7.90, emoji:'🥤' },
    { nome:'Suco Natural 400ml', categoria:'BEBIDAS', preco:11.90, emoji:'🥤' },
    { nome:'Sorvete Caseiro',    categoria:'SOBREMESAS', preco:9.90, emoji:'🍦' },
    { nome:'Combo Família',      categoria:'COMBOS', preco:89.90, emoji:'🎁' },
  ];
  if (stat) stat.textContent = String(demo.length);
  if (!grid) return;
  grid.innerHTML = demo.map(p => `
    <div class="item-card">
      <div class="item-card-img"><div class="item-emoji-bg">${p.emoji}</div></div>
      <div class="item-body">
        <div class="item-categoria">${p.categoria}</div>
        <div class="item-nome">${p.nome}</div>
        <div class="item-footer">
          <div class="item-preco">R$ ${p.preco.toFixed(2).replace('.',',')}</div>
        </div>
      </div>
    </div>`).join('');
}

function renderEmojiGrid() {
  const grid = $('emoji-grid'); if (!grid) return;
  grid.innerHTML = EMOJIS.map(e =>
    `<button class="emoji-btn ${e === emojiSel ? 'selected' : ''}" onclick="selecionarEmoji('${e}',this)">${e}</button>`
  ).join('');
}

// ─── Modal de item ───────────────────────────────────────────────────────────
export function abrirModalItem() {
  try{const _eNI=getEstab();if(_eNI)setTimeout(function(){_carregarGruposNoModal(_eNI.id,[]);},100);}catch(e){}
  $('modal-item').classList.add('open');
  ['item-nome','item-desc','item-cat','item-preco','item-preco-orig'].forEach(id => { const el=$(id); if(el) el.value=''; });
  const dd=$('item-desconto-percent'); if(dd) dd.value='0';
  const dg=$('desconto-group'); if(dg) dg.style.display='none';
  const pr = $('item-promocao'); if (pr) pr.checked = false;
  const pg = $('preco-orig-group'); if (pg) pg.style.display = 'none';
  fotosFiles = []; fotosPosX = []; fotosPosY = [];
  renderFotosGrid();
  emojiSel = '🍔'; renderEmojiGrid();
  // Reset botão salvar
  const btn = document.querySelector('#modal-item .btn-primary');
  if (btn) { btn.textContent = 'Salvar item'; btn.onclick = salvarItem; }
}
export function fecharModal() { $('modal-item').classList.remove('open'); }
export function fecharModalFora(e) { if (e.target.id === 'modal-item') fecharModal(); }
export function selecionarEmoji(emoji, btn) {
  emojiSel = emoji;
  document.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

// ─── Fotos com drag de posição ───────────────────────────────────────────────
export function previewFotos(event) {
  const file = event.target.files[0]; if (!file) return;
  event.target.value = '';
  // Abre modal de crop para ajuste antes de adicionar
  abrirCropFoto(file);
}
export function previewFoto(e) { previewFotos(e); }



// ── CROP DE FOTO DO PRODUTO ────────────────────────────────────────────────
let _cropFotoFile  = null;
let _cropFotoUrl   = null;
let _cropFotoPosX  = 50;
let _cropFotoPosY  = 50;
let _cropFotoDragAtivo = false;
let _cropFotoDragX = 0, _cropFotoDragY = 0;

window.abrirCropFoto = function(file) {
  _cropFotoFile = file;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    _CRP.img = img; _CRP.offX = 0; _CRP.offY = 0;
    _CRP.canvasId = 'crop-foto-canvas'; _CRP.stageId = 'crop-foto-stage'; _CRP.safePrefix = 'cfso';
    crpApplyMinScale(); _CRP.scale = _CRP.minScale;
    crpInitDrag('crop-foto-stage');
    const modal = $('modal-crop-foto');
    if (modal) { modal.classList.add('open'); document.body.style.overflow = 'hidden'; }
    setTimeout(() => { crpApplyMinScale(); crpDraw(); }, 50);
  };
  img.src = url;
  _cropFotoUrl = url;
};

window.confirmarCropFoto = function() {
  if (!_CRP.img) { console.warn('[crop] sem imagem'); return; }

  // Crop via canvas da imagem original (mais confiável que drawImage canvas->canvas)
  const stage  = $('crop-foto-stage');
  const W      = stage ? stage.offsetWidth : 340;
  const safe   = Math.floor(W * 0.82);
  const sx     = Math.floor((W - safe) / 2);

  const out    = document.createElement('canvas');
  out.width    = safe; out.height = safe;
  const ctx    = out.getContext('2d');

  // Calcula onde a imagem está posicionada no stage
  const iw = _CRP.img.naturalWidth, ih = _CRP.img.naturalHeight;
  const dw = iw * _CRP.scale, dh = ih * _CRP.scale;
  const dx = W/2 - dw/2 + _CRP.offX;
  const dy = W/2 - dh/2 + _CRP.offY;

  // Desenha a porção da imagem que está dentro da safe area
  ctx.drawImage(_CRP.img, dx - sx, dy - sx, dw, dh);

  out.toBlob(blob => {
    if (!blob || blob.size < 100) {
      // Fallback: salva sem crop
      const fallbackFile = _cropFotoFile;
      if (fallbackFile) {
        fallbackFile._urlExistente = null;
        fotosFiles.push(fallbackFile); fotosPosX.push(50); fotosPosY.push(50);
      }
    } else {
      const file = new File([blob], _cropFotoFile?.name || 'foto.jpg', { type:'image/jpeg' });
      file._urlExistente = null;
      const editIdx = window._cropFotoEditIdx;
      if (editIdx != null && !(editIdx < 0) && !(editIdx > fotosFiles.length-1)) {
        fotosFiles[editIdx] = file; fotosPosX[editIdx] = 50; fotosPosY[editIdx] = 50;
        window._cropFotoEditIdx = null;
      } else {
        fotosFiles.push(file); fotosPosX.push(50); fotosPosY.push(50);
      }
    }

    renderFotosGrid();
    const modal = $('modal-crop-foto');
    if (modal) { modal.classList.remove('open'); document.body.style.overflow = ''; }
    _CRP.img = null;

    if (_fotoQueue && _fotoQueue.length > 0) {
      const next = _fotoQueue.shift(); _cropFotoFile = next;
      setTimeout(() => window.abrirCropFoto(next), 200);
    }
  }, 'image/jpeg', 0.92);
};

// Função chamada pelo foto-input (modal de item)
window.adicionarFotos = function(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  event.target.value = '';
  // Processa um arquivo de cada vez via fila
  let idx = 0;
  const next = () => {
    if (!(idx < files.length)) return;
    _cropFotoFile = files[idx++];
    window.abrirCropFoto(_cropFotoFile);
    // Após confirmar, se houver mais arquivos, o próximo será aberto
    // via _fotoQueue que guardamos aqui
    _fotoQueue = files.slice(idx);
  };
  _fotoQueue = files.slice(1);
  window.abrirCropFoto(files[0]);
  _cropFotoFile = files[0];
};

let _fotoQueue = [];

window.fecharCropFoto = function() {
  const m = $('modal-crop-foto'); if (m) m.classList.remove('open');
  document.body.style.overflow = '';
  _cropFotoFile = null;
  crpCleanup();
};

// Drag no modal de crop


function renderFotosGrid() {
  const grid = $('fotos-grid'); if (!grid) return;

  if (!fotosFiles.length) {
    grid.innerHTML = `<div class="foto-add-btn" onclick="document.getElementById('foto-input').click()">
      <span style="font-size:1.5rem">📷</span>
      <span style="font-size:0.72rem;color:#aaa">Adicionar foto</span>
    </div>`;
    return;
  }

  let html = fotosFiles.map((f, i) => {
    const url = f._urlExistente || URL.createObjectURL(f);
    const px  = fotosPosX[i] ?? 50;
    const py  = fotosPosY[i] ?? 50;
    const isExist = !!f._urlExistente;
    return `<div class="foto-thumb-wrap" id="foto-wrap-${i}">
      <div style="position:relative;width:100%;aspect-ratio:1/1;max-height:280px;border-radius:14px;overflow:hidden;background:#f0ebe4;border:2px solid var(--border);margin-bottom:8px;cursor:grab;touch-action:none" id="foto-drag-${i}">
        <img src="${url}" id="foto-img-${i}" draggable="false"
          style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${px}% ${py}%;pointer-events:none;user-select:none">
        ${i===0 ? '<div style="position:absolute;top:8px;left:8px;background:var(--red);color:#fff;font-size:.62rem;font-weight:800;padding:3px 10px;border-radius:50px;z-index:3;letter-spacing:.04em">PRINCIPAL</div>' : ''}
        <div style="position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:10px;pointer-events:none;z-index:2">
          <div style="background:rgba(0,0,0,.55);color:#fff;font-size:.62rem;font-weight:600;padding:4px 12px;border-radius:50px;backdrop-filter:blur(6px)">
            ✋ Arraste para reposicionar
          </div>
        </div>
        <div style="position:absolute;bottom:10px;right:10px;width:44px;height:44px;border-radius:8px;overflow:hidden;background:rgba(0,0,0,.6);border:2px solid rgba(255,255,255,.35);z-index:3">
          <img src="${url}" style="width:100%;height:100%;object-fit:cover;opacity:.7">
          <div id="foto-pin-${i}" style="position:absolute;width:8px;height:8px;background:#fff;border-radius:50%;border:1.5px solid var(--red);transform:translate(-50%,-50%);left:${px}%;top:${py}%;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:.65rem;color:#aaa">${isExist ? '📎 Existente' : '✨ Nova'}</span>
        <button onclick="removerFotoItem(${i})" style="background:none;border:1px solid #e0dbd5;color:#aaa;padding:4px 12px;border-radius:8px;font-size:.7rem;font-weight:600;cursor:pointer" onmouseover="this.style.borderColor='var(--red)';this.style.color='var(--red)'" onmouseout="this.style.borderColor='#e0dbd5';this.style.color='#aaa'">🗑 Remover</button>
      </div>
    </div>`;
  }).join('');

  html += `<div class="foto-add-btn" onclick="document.getElementById('foto-input').click()">
    <span style="font-size:1.5rem">📷</span>
    <span style="font-size:0.72rem;color:#aaa">Adicionar foto</span>
  </div>`;

  grid.innerHTML = html;
  fotosFiles.forEach((_, i) => iniciarDragFoto(null, i, true));
}

window.adicionarFotos = function(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  event.target.value = '';
  // Processa um arquivo de cada vez via fila
  let idx = 0;
  const next = () => {
    if (!(idx < files.length)) return;
    _cropFotoFile = files[idx++];
    window.abrirCropFoto(_cropFotoFile);
    // Após confirmar, se houver mais arquivos, o próximo será aberto
    // via _fotoQueue que guardamos aqui
    _fotoQueue = files.slice(idx);
  };
  _fotoQueue = files.slice(1);
  window.abrirCropFoto(files[0]);
  _cropFotoFile = files[0];
};

window.fecharCropFoto = function() {
  const m = $('modal-crop-foto'); if (m) m.classList.remove('open');
  document.body.style.overflow = '';
  _cropFotoFile = null;
  crpCleanup();
};

// Drag no modal de crop




let _fotoDrag = { ativo:false, idx:-1, startX:0, startY:0 };

function iniciarDragFoto(event, i, apenasSetup) {
  const area = $(`foto-drag-${i}`); if (!area) return;
  // Sempre configura via addEventListener (funciona melhor no mobile)
  area.removeEventListener('mousedown',  area._onMD);
  area.removeEventListener('touchstart', area._onTS);
  area._onMD = e => _startDragFoto(e, i);
  area._onTS = e => { e.preventDefault(); _startDragFoto(e, i); };
  area.addEventListener('mousedown',  area._onMD);
  area.addEventListener('touchstart', area._onTS, { passive:false });
  if (!apenasSetup && event) _startDragFoto(event, i);
}

function _startDragFoto(e, i) {
  _fotoDrag.ativo = true; _fotoDrag.idx = i;
  const t = e.touches ? e.touches[0] : e;
  _fotoDrag.startX = t.clientX; _fotoDrag.startY = t.clientY;
  e.preventDefault();
}

// Listeners do drag de foto — passivos para não bloquear scroll
document.addEventListener('mousemove', _moveDragFoto, { passive: true });
document.addEventListener('touchmove', _moveDragFoto, { passive: true });
document.addEventListener('mouseup',   () => { _fotoDrag.ativo = false; });
document.addEventListener('touchend',  () => { _fotoDrag.ativo = false; });
document.addEventListener('touchend',  () => _fotoDrag.ativo = false);

function _moveDragFoto(e) {
  if (!_fotoDrag.ativo) return;
  const i = _fotoDrag.idx;
  const t = e.touches ? e.touches[0] : e;
  const area = $(`foto-drag-${i}`); if (!area) return;
  const dx = (t.clientX - _fotoDrag.startX) / area.offsetWidth  * 100;
  const dy = (t.clientY - _fotoDrag.startY) / area.offsetHeight * 100;
  _fotoDrag.startX = t.clientX; _fotoDrag.startY = t.clientY;
  fotosPosX[i] = Math.max(0, Math.min(100, fotosPosX[i] - dx * 0.5));
  fotosPosY[i] = Math.max(0, Math.min(100, fotosPosY[i] - dy * 0.5));
  const img = $(`foto-img-${i}`);
  if (img) img.style.objectPosition = `${fotosPosX[i]}% ${fotosPosY[i]}%`;
  const pin = $(`foto-pin-${i}`);
  if (pin) { pin.style.left = fotosPosX[i] + '%'; pin.style.top = fotosPosY[i] + '%'; }
}
window.removerFotoExistente = function(btn) {
  btn.closest('.foto-thumb-item').remove();
};

window.removerFotoItem = function(i) {
  fotosFiles.splice(i,1); fotosPosX.splice(i,1); fotosPosY.splice(i,1);
  renderFotosGrid();
};

window.reabrirCropFoto = function(i) {
  const f = fotosFiles[i]; if (!f) return;
  const url = f._urlExistente || URL.createObjectURL(f);
  _cropFotoFile = f;
  const img = new Image();
  img.onload = () => {
    _CRP.img = img; _CRP.offX = 0; _CRP.offY = 0;
    _CRP.canvasId = 'crop-foto-canvas'; _CRP.stageId = 'crop-foto-stage'; _CRP.safePrefix = 'cfso';
    crpApplyMinScale(); _CRP.scale = _CRP.minScale;
    crpInitDrag('crop-foto-stage');
    const modal = $('modal-crop-foto');
    if (modal) { modal.classList.add('open'); document.body.style.overflow = 'hidden'; }
    setTimeout(() => { crpApplyMinScale(); crpDraw(); }, 50);
    // Ao confirmar esta edição, substituir no índice i
    window._cropFotoEditIdx = i;
  };
  img.src = url;
};

export async function salvarItem() {
  const estab = getEstab(); if (!estab) return showToast('Faça login novamente.','error');
  const nome  = $('item-nome')?.value.trim();
  const preco = parseFloat($('item-preco')?.value);
  if (!nome)        return showToast('Digite o nome do item.','error');
  if (isNaN(preco)) return showToast('Digite o preço.','error');

  const btn = document.querySelector('#modal-item .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  try {
    // Upload de todas as fotos
    const fotos_urls = [];
    for (let fi = 0; fi < fotosFiles.length; fi++) {
      const file = fotosFiles[fi];
      const url  = await uploadFile('fotos', `${estab.id}/${Date.now()}_${fi}.${file.name.split('.').pop()}`, file);
      fotos_urls.push(url);
    }
    const foto_url = fotos_urls[0] || null;
    const promocao   = $('item-promocao')?.checked || false;
    const preco_orig = parseFloat($('item-preco-orig')?.value) || null;
    const { error } = await getSupa().from('produtos').insert({
      estabelecimento_id: estab.id, nome,
      descricao:    $('item-desc')?.value.trim(),
      categoria:    $('item-cat')?.value.trim().toUpperCase(),
      preco, preco_original: promocao ? preco_orig : null,
      foto_url, fotos_urls, emoji: emojiSel, disponivel: true, promocao,
      setor: $('item-setor')?.value || 'geral',
      grupos_adicionais_ids: _coletarGruposSelecionados(),
    });
    if (error) throw new Error(error.message);
    await renderCardapio(); fecharModal(); showToast('Item adicionado! ✅');
  } catch (e) { showToast(e.message,'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Salvar item'; } }
}

export async function editarItem(id) {
  const estab = getEstab(); if (!estab) return;
  const { data: p } = await getSupa().from('produtos').select('*').eq('id', id).maybeSingle();
  if (!p) return;

  abrirModalItem();
  setTimeout(() => {
    const set = (sel, val) => { const el=$(sel); if(el && val!=null) el.value=val; };
    set('item-nome', p.nome); set('item-desc', p.descricao||'');
    set('item-cat', p.categoria||'');
    set('item-setor', p.setor||'geral');
    // Se tem desconto %, o campo mostra o preço ORIGINAL (o que o dono digitou)
    set('item-preco', p.em_promocao && p.preco_original ? p.preco_original : p.preco);
    set('item-preco-orig', p.preco_original||'');
    const pr = $('item-promocao'); if (pr) {
      pr.checked = !!p.promocao;
      const g=$('preco-orig-group'); if(g) g.style.display=p.promocao?'flex':'none';
      const dd=$('item-desconto-percent'); if(dd) dd.value=p.desconto_percent||'0';
      const dg=$('desconto-group'); if(dg) dg.style.display=p.promocao?'flex':'none';
    }
    emojiSel = p.emoji || '🍔'; renderEmojiGrid();
    try{_carregarGruposNoModal(estab.id, p.grupos_adicionais_ids||(p.grupo_adicional_id?[p.grupo_adicional_id]:[]));} catch(e){}
    // Fotos existentes — carrega no mesmo sistema de drag 1:1
    const fotosExist = (p.fotos_urls && p.fotos_urls.length) ? p.fotos_urls : (p.foto_url ? [p.foto_url] : []);
    // Converte URLs existentes para Blob para entrar no mesmo array fotosFiles
    const carregarFotosExist = async () => {
      for (const url of fotosExist) {
        try {
          const resp = await fetch(url);
          const blob = await resp.blob();
          const ext  = url.split('.').pop().split('?')[0] || 'jpg';
          const file = new File([blob], 'existente.' + ext, { type: blob.type });
          file._urlExistente = url; // marca URL original para salvar sem re-upload
          fotosFiles.push(file);
          fotosPosX.push(50);
          fotosPosY.push(50);
        } catch(e) {
          console.warn('Foto não carregou:', url, e);
        }
      }
      renderFotosGrid();
    };
    carregarFotosExist();
    // Botão salvar
    const btn = document.querySelector('#modal-item .btn-primary');
    if (btn) {
      btn.textContent = 'Salvar alterações';
      btn.onclick = async () => {
        btn.disabled = true; btn.textContent = 'Salvando...';
        try {
          // Upload só das fotos novas; fotos existentes (com _urlExistente) reutilizam a URL
          const fotos_urls = [];
          for (let fi = 0; fi < fotosFiles.length; fi++) {
            const file = fotosFiles[fi];
            if (file._urlExistente) {
              fotos_urls.push(file._urlExistente); // reusa URL original — sem re-upload
            } else {
              const url = await uploadFile('fotos', `${estab.id}/${Date.now()}_${fi}.${file.name.split('.').pop()}`, file);
              fotos_urls.push(url);
            }
          }
          const foto_url = fotos_urls[0] || null;
          const promocao   = $('item-promocao')?.checked || false;
          const preco_orig = parseFloat($('item-preco-orig')?.value) || null;
          const desconto_pct_u = parseInt($('item-desconto-percent')?.value||'0');
          const precoBase = parseFloat($('item-preco')?.value);
          let precoFinalU = precoBase;
          let precoOrigU = promocao ? preco_orig : null;
          if (promocao && desconto_pct_u > 0) {
            precoOrigU = precoBase;
            precoFinalU = parseFloat((precoBase * (1 - desconto_pct_u / 100)).toFixed(2));
          }
          const { error } = await getSupa().from('produtos').update({
            nome:         $('item-nome')?.value.trim(),
            descricao:    $('item-desc')?.value.trim(),
            categoria:    $('item-cat')?.value.trim().toUpperCase(),
            preco:        precoFinalU,
            preco_original: precoOrigU,
            foto_url, fotos_urls, emoji: emojiSel, promocao,
            setor: $('item-setor')?.value || 'geral',
            grupos_adicionais_ids: _coletarGruposSelecionados(),
            em_promocao: promocao && desconto_pct_u > 0,
            desconto_percent: promocao ? desconto_pct_u : 0,
          }).eq('id', id);
          if (error) throw new Error(error.message);
          await renderCardapio(); fecharModal(); showToast('Item atualizado!');
        } catch (e) { showToast(e.message,'error'); }
        finally { btn.disabled = false; btn.textContent = 'Salvar alterações'; }
      };
    }
  }, 100);
}

export async function deletarItem(id) {
  if (!confirm('Remover este item?')) return;
  await getSupa().from('produtos').delete().eq('id', id);
  await renderCardapio(); showToast('Item removido.');
}

// ─────────────────────────────────────────────────────────────────────────────
// FRESQUINHO
// ─────────────────────────────────────────────────────────────────────────────
async function renderFresquinho() {
  const estab = getEstab(); const grid = $('fresquinho-grid');
  if (!grid || !estab) return;
  const { data } = await getSupa().from('fresquinhos').select('*')
    .eq('estabelecimento_id', estab.id).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false });
  if (!data?.length) { grid.innerHTML = `<div class="empty-state-light"><span>✨</span><p>Nenhum conteúdo ainda.</p></div>`; return; }
  grid.innerHTML = '<div class="fresh-stories-row">' + data.map(f => {
    const rest = new Date(f.expires_at) - new Date();
    const h = Math.floor(rest/3600000), m = Math.floor((rest%3600000)/60000);
    return `<div class="fresh-story-item">
      <div class="fresh-story-thumb" onclick="abrirStoryDash('${f.url}','${f.tipo||'foto'}')">
        ${f.tipo === 'video'           ? '<video src="'+(f.url)+'" muted playsinline loop style="width:100%;height:100%;object-fit:cover"></video>'           : '<img src="'+(f.url)+'" style="width:100%;height:100%;object-fit:cover">'}
        <div class="fresh-overlay"></div>
        <div class="fresh-timer-badge">⏱ ${h > 0 ? h+'h '+m+'min' : m+'min'}</div>
      </div>
      <button class="fresh-remove-btn" onclick="removerFresquinho('${f.id}')">🗑️</button>
    </div>`;
  }).join('') + '</div>';
}

export async function postarFresquinho(event) {
  const estab = getEstab(); const file = event.target.files[0];
  if (!file || !estab) return;
  if (file.size > 50 * 1024 * 1024) return showToast('Máx. 50MB','error');

  const tipo = file.type.startsWith('video') ? 'video' : 'foto';

  // Valida duração do vídeo (máx 30s)
  if (tipo === 'video') {
    const durOk = await new Promise(resolve => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => resolve(!(30 < v.duration));
      v.onerror = () => resolve(true); // se não conseguir checar, deixa passar
      v.src = URL.createObjectURL(file);
    });
    if (!durOk) return showToast('Vídeo deve ter no máximo 30 segundos.', 'error');
  }

  showToast('Enviando...');
  const url = await uploadFile('fotos', `${estab.id}/fresh_${Date.now()}.${file.name.split('.').pop()}`, file);
  await getSupa().from('fresquinhos').insert({
    estabelecimento_id: estab.id, url, tipo,
    expires_at: new Date(Date.now() + 4*60*60*1000).toISOString(),
  });
  await renderFresquinho(); showToast('Postado! Disponível por 4h ✨');
  event.target.value = '';
}

export async function removerFresquinho(id) {
  await getSupa().from('fresquinhos').delete().eq('id', id);
  await renderFresquinho(); showToast('Removido.');
}

window.abrirStoryDash = function(url, tipo) {
  const o = document.createElement('div');
  o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer';
  o.onclick = () => o.remove();
  o.innerHTML = tipo === 'video'
    ? `<video src="${url}" controls autoplay style="max-width:90vw;max-height:90vh;border-radius:12px"></video>`
    : `<img src="${url}" style="max-width:90vw;max-height:90vh;border-radius:12px;object-fit:contain">`;
  const btn = document.createElement('button');
  btn.style.cssText = 'position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.15);border:none;color:#fff;width:38px;height:38px;border-radius:50%;font-size:1rem;cursor:pointer';
  btn.textContent = '✕'; btn.onclick = e => { e.stopPropagation(); o.remove(); };
  o.appendChild(btn); document.body.appendChild(o);
};

// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS
// ─────────────────────────────────────────────────────────────────────────────
async function renderPedidos(pedidosExternos) {
  const estab = getEstab(); if (!estab) return;
  // Usa dados externos (filtro de período) ou busca do banco
  var data;
  if (pedidosExternos) {
    data = pedidosExternos;
  } else {
    const r = await getSupa().from('pedidos').select('*')
      .eq('estabelecimento_id', estab.id).order('created_at', { ascending: false }).limit(50);
    data = r.data;
  }

  // Delivery/retirada na aba Pedidos, mesas na aba Comandas
  const pedidos    = (data || []).filter(p => !((p.endereco||'').startsWith('No local')));
  const pedidosMes = (data || []); // TODOS os pedidos para faturamento total

  const hoje       = new Date().toDateString();
  const pedHoje    = pedidos.filter(p => new Date(p.created_at).toDateString() === hoje);
  // Faturamento inclui MESAS + delivery
  const todosHoje  = pedidosMes.filter(p => new Date(p.created_at).toDateString() === hoje && p.status !== 'recusado');
  const fatHoje    = todosHoje.reduce((s, p) => s + Number(p.total || 0), 0);
  const totalPeds  = todosHoje.length;

  const sp = $('stat-pedidos'); if (sp) sp.textContent = totalPeds;
  const sf = $('stat-faturamento'); if (sf) sf.textContent = `R$ ${fatHoje.toFixed(2).replace('.',',')}`;

  // Área de novos pedidos
  const novos = pedidos.filter(p => p.status === 'novo');
  novos.forEach(p => pedidosConhecidos.add(p.id));
  const lista = $('pedidos-novos-lista');
  if (lista) {
    lista.innerHTML = novos.length
      ? novos.map(p => cardNovoHTML(p)).join('')
      : '<div style="color:#bbb;font-size:0.82rem;margin:auto">Nenhum pedido novo no momento</div>';
    atualizarBadgePedidos();
  }

  // Histórico
  const lu = $('ultimos-pedidos'); const td = $('todos-pedidos');
  const cardHtml = p => {
    const CLS = { novo:'status-novo', preparo:'status-preparo', pronto:'status-pronto', recusado:'status-recusado' };
    const LBL = { novo:'Novo', preparo:'Em preparo', pronto:'Pronto', recusado:'Recusado' };
    const ICONS = { novo:'🔔', preparo:'👨‍🍳', pronto:'✅', recusado:'❌' };
    const cls = CLS[p.status] || 'status-novo';
    const lbl = LBL[p.status] || 'Novo';
    const ico = ICONS[p.status] || '🔔';
    const min = Math.floor((Date.now() - new Date(p.created_at)) / 60000);
    const tempoStr = min < 1 ? 'agora' : min < 60 ? `${min}min` : `${Math.floor(min/60)}h${min%60>0?min%60+'min':''}`;
    const itensStr = Array.isArray(p.itens) ? p.itens.map(i=>`${i.qtd}x ${i.nome}`).join(' · ') : '';
    const totalFmt = 'R$ ' + Number(p.total||0).toFixed(2).replace('.',',');
    const endStr   = p.endereco === 'Retirada no local' ? '🏃 Retirada' : p.endereco ? `🛵 ${p.endereco.split(',')[0]}` : '🏃 Retirada';
    const pgto     = p.pagamento ? p.pagamento.toUpperCase() : '';
    return `<div class="pedido-card ped-status-${p.status||'novo'}" data-id="${p.id}" data-criado="${p.created_at||''}" data-pagamento="${(p.pagamento||'pix').toLowerCase()}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;min-width:0">
          <div style="width:38px;height:38px;border-radius:10px;background:#f5f0eb;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">${ico}</div>
          <div style="min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span style="font-size:.92rem;font-weight:800">#${p.id.slice(-4).toUpperCase()}</span>
              <span style="font-size:.82rem;font-weight:600;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px">${p.cliente_nome||'Cliente'}</span>
              ${p.cliente_whats && !p.cliente_whats.match(/^\d+$/) ? '<span style="background:#e8f5e9;color:#2e7d32;font-size:.68rem;font-weight:700;padding:2px 7px;border-radius:50px">👤 '+p.cliente_whats+'</span>' : ''}
            </div>
            <div style="font-size:.7rem;color:#aaa;margin-top:2px">${tempoStr} atrás · ${endStr}</div>
          </div>
        </div>
        <span class="pedido-status ${cls}" style="white-space:nowrap;flex-shrink:0">${lbl}</span>
      </div>
      ${itensStr ? '<div style="font-size:.82rem;color:#666;background:#faf8f5;border-radius:8px;padding:8px 10px;margin-bottom:10px;line-height:1.5">'+(itensStr)+'</div>' : ''}
      ${(function(){
        const ss = p.setores_status || {};
        const keys = Object.keys(ss);
        if (!keys.length) return '';
        const total = keys.length;
        const prontos = keys.filter(function(k){return ss[k]==='pronto';}).length;
        const allPronto = prontos === total;
        const pct = Math.round(prontos/total*100);
        const setorChips = keys.map(function(k){
          const isPronto = ss[k]==='pronto';
          const isPrep = ss[k]==='preparando';
          const EM = {cozinha:'🍔',bar:'🥤',grill:'🔥',pizza:'🍕',sobremesa:'🍰',padaria:'🥖',caixa:'💰',geral:'📋'};
          const em = EM[k.toLowerCase()]||'🏷️';
          const cor = isPronto?'#dcfce7;color:#16a34a':isPrep?'#dbeafe;color:#2563eb':'#fee2e2;color:#dc2626';
          return '<span style="background:'+cor+';border-radius:50px;padding:1px 8px;font-size:.62rem;font-weight:800">'+em+' '+k+'</span>';
        }).join(' ');
        return '<div style="margin-bottom:10px">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">'
          + '<div style="display:flex;gap:4px;flex-wrap:wrap">'+setorChips+'</div>'
          + (allPronto?'<span style="font-size:.68rem;font-weight:800;color:#16a34a">✅ Tudo pronto!</span>':'<span style="font-size:.65rem;color:#aaa">'+prontos+'/'+total+' prontos</span>')
          + '</div>'
          + '<div style="height:5px;background:#f0f0f0;border-radius:50px;overflow:hidden">'
          + '<div style="height:100%;width:'+pct+'%;background:'+(allPronto?'#22c55e':'#f59e0b')+';border-radius:50px;transition:width .4s ease"></div>'
          + '</div>'
          + '</div>';
      })()}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:1rem;font-weight:800;color:var(--red)">${totalFmt}</span>
          ${pgto ? '<span style="background:#f0e9e0;padding:2px 8px;border-radius:50px;font-size:.65rem;font-weight:700;color:#888">'+(pgto)+'</span>' : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${(p.status==='novo'&&!(p.endereco||'').startsWith('No local'))?'<button class="btn-ped-aceitar" onclick="aceitarPedido(\''+p.id+'\')">&#10003; Aceitar</button><button class="btn-ped-recusar" onclick="recusarPedido(\''+p.id+'\')">&#10005; Recusar</button>':''}
          ${p.status==='preparo'?'<button class="btn-ped-aceitar" onclick="marcarPronto(\''+p.id+'\')">'+(((p.endereco||'').startsWith('No local'))?'&#10003; Entregue na mesa':'&#10003; Pronto')+'</button>':''}
          <button class="btn-ped-imprimir" onclick="verPedido('${p.id}')">Ver</button>
        </div>
      </div>
    </div>`;
  };
  if (lu) lu.innerHTML = pedHoje.length ? pedHoje.slice(0,3).map(cardHtml).join('') : '<div class="empty-state-light"><span>🛵</span><p>Nenhum pedido ainda.</p></div>';
  if (td) td.innerHTML = pedidos.length ? pedidos.map(cardHtml).join('') : '<div class="empty-state-light"><span>📋</span><p>Nenhum pedido ainda.</p></div>';
}

function cardNovoHTML(p) {
  const itens = Array.isArray(p.itens) ? p.itens.map(i=>`${i.qtd}x ${i.nome}`).join(', ') : '';
  return `<div class="pedido-novo-card" id="pnc-${p.id}">
    <div class="pnc-id">#${p.id.slice(-4).toUpperCase()}</div>
    <div class="pnc-cliente">${p.cliente_nome||'Cliente'}</div>
    <div class="pnc-total">R$ ${Number(p.total||0).toFixed(2).replace('.',',')}</div>
    <div style="font-size:0.72rem;color:#888;margin-bottom:8px">${itens}</div>
    <div class="pnc-actions">
      <button class="btn-aceitar" onclick="aceitarPedido('${p.id}')">Aceitar</button>
      <button class="btn-recusar" onclick="recusarPedido('${p.id}')">Recusar</button>
    </div>
    <button class="btn-ver-ped" onclick="verPedido('${p.id}')">Ver detalhes</button>
  </div>`;
}

function atualizarBadgePedidos() {
  const lista = $('pedidos-novos-lista');
  const qtd   = lista ? lista.querySelectorAll('.pedido-novo-card').length : 0;
  const badge = $('badge-pedidos');
  const count = $('novos-count');
  if (badge)  { badge.textContent = qtd; badge.classList.toggle('show', qtd > 0); }
  if (count) count.textContent = qtd;
}

function removerCardNovo(id) {
  const card = $(`pnc-${id}`); if (!card) return;
  card.style.transition = 'opacity 0.3s,transform 0.3s';
  card.style.opacity = '0'; card.style.transform = 'scale(0.8)';
  setTimeout(() => {
    card.remove(); atualizarBadgePedidos();
    const lista = $('pedidos-novos-lista');
    if (lista && !lista.querySelector('.pedido-novo-card'))
      lista.innerHTML = '<div style="color:#bbb;font-size:0.82rem;margin:auto">Nenhum pedido novo no momento</div>';
  }, 300);
}

window.aceitarPedido = async function(id) {
  marcarPedidoOuvido(id); // Para o som quando pedido é aceito
  pararNotif();
  // Busca o pedido para saber o tipo antes de aceitar
  const { data: ped } = await getSupa().from('pedidos').select('endereco').eq('id', id).maybeSingle();
  const isMesa = ped && (ped.endereco||'').startsWith('No local');

  const { error } = await getSupa().from('pedidos').update({ status:'preparo' }).eq('id', id);
  if (error) return showToast('Erro ao aceitar.','error');
  removerCardNovo(id);
  // Push para cliente (não-bloqueante)
  const _isDelAce = (ped?.endereco||'').length > 20;
  enviarPushCliente(id, 'preparo', _isDelAce);

  if (isMesa) {
    // Pedido de mesa → imprime ticket de cozinha direto
    showToast('✅ Aceito! Enviando para cozinha...');
    marcarEnviadoCozinha(id);
    window.imprimirCozinha(id);
    await carregarPedidosMesas(); renderMesas();
    window.renderHistoricoMesas();
  } else {
    // Pedido de delivery/retirada → imprime nota do cliente
    showToast('✅ Pedido aceito! Imprimindo nota do cliente...');
    window.imprimirPedido(id);
  }
  await renderPedidos();

};

window.recusarPedido = async function(id) {
  if (!confirm('Recusar este pedido?')) return;
  pararNotif();
  await getSupa().from('pedidos').update({ status:'recusado' }).eq('id', id);
  removerCardNovo(id); showToast('Pedido recusado.');
  // WhatsApp para o cliente
  const { data: _pedRec } = await getSupa().from('pedidos').select('*').eq('id', id).maybeSingle();
  const _estabRec = typeof getEstab === 'function' ? getEstab() : null;
  // Push notification para o cliente
  enviarPushCliente(_pedRec?.id || id, 'recusado', false);
  await carregarPedidosMesas(); renderMesas();
  await renderPedidos();
};

window.marcarSaiuEntrega = async function(id) {
  try {
    var { error } = await getSupa().from('pedidos').update({ status: 'saiu_entrega' }).eq('id', id);
    if (error) throw error;
    showToast('🚚 Pedido saiu para entrega!');
    // WhatsApp para o cliente
    const { data: _pedDel } = await getSupa().from('pedidos').select('*').eq('id', id).maybeSingle();
    const _estabDel = typeof getEstab === 'function' ? getEstab() : null;
    // Push notification para o cliente — delivery
    enviarPushCliente(_pedDel?.id || id, 'pronto', true);
    await renderPedidos();
  } catch(e) { showToast('Erro: ' + e.message); }
};

window.marcarPronto = async function(id) {
  await getSupa().from('pedidos').update({ status:'pronto' }).eq('id', id);
  fecharModalPedido(); showToast('Pedido pronto!');
  // Push equipe + WhatsApp cliente
  const { data: _pedPronto } = await getSupa().from('pedidos').select('*').eq('id', id).maybeSingle();
  const _estabPronto = typeof getEstab === 'function' ? getEstab() : null;
  // Push notification para o cliente — retirada
  const _isDelPronto = (_pedPronto?.endereco||'').length > 20;
  enviarPushCliente(_pedPronto?.id || id, 'pronto', _isDelPronto);
  await renderPedidos();
};

window.verPedido = async function(id) {
  const { data: p } = await getSupa().from('pedidos').select('*').eq('id', id).maybeSingle();
  if (!p) return;
  const itens = Array.isArray(p.itens) ? p.itens : [];
  const body  = $('modal-pedido-body');
  if (!body) return;
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;justify-content:space-between">
        <strong>#${p.id.slice(-4).toUpperCase()}</strong>
        <span class="pedido-status status-${p.status||'novo'}">${{novo:'NOVO',preparo:'PREPARO',pronto:'PRONTO',recusado:'RECUSADO'}[p.status]||'NOVO'}</span>
      </div>
      <div><b>Cliente:</b> ${p.cliente_nome||'-'}</div>
      <div><b>WhatsApp:</b> ${p.cliente_whats||'-'}</div>
      <div><b>Entrega:</b> ${p.endereco||'Retirada no local'}</div>
      ${p.observacao?'<div><b>Obs:</b> '+(p.observacao)+'</div>':''}
      <hr style="border:none;border-top:1px solid var(--border)">
      ${itens.map(i=>'<div style="display:flex;justify-content:space-between"><span>'+(i.qtd)+'x '+(i.nome)+'</span><span>R$ '+((i.preco*i.qtd).toFixed(2).replace('.',','))+'</span></div>').join('')}
      <hr style="border:none;border-top:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;font-weight:800"><span>Total</span><span>R$ ${Number(p.total||0).toFixed(2).replace('.',',')}</span></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        ${(p.status==='novo'&&!(p.endereco||'').startsWith('No local'))?'<button class="btn-ped-aceitar" onclick="aceitarPedido('+p.id+');fecharModalPedido()">Aceitar</button><button class="btn-ped-recusar" onclick="recusarPedido('+p.id+');fecharModalPedido()">Recusar</button>':''}
        <button class="btn-ped-imprimir" onclick="imprimirPedido('${p.id}')">🖨️ Imprimir</button>
      </div>
    </div>`;
  $('modal-pedido').classList.add('open');
};
window.fecharModalPedido = () => $('modal-pedido')?.classList.remove('open');

window.imprimirPedido = async function(id) {
  const { data: p } = await getSupa().from('pedidos').select('*').eq('id', id).maybeSingle();
  if (!p) return;
  const estab = getEstab();
  const itens = Array.isArray(p.itens) ? p.itens : [];
  const fmtR  = v => 'R$ ' + Number(v||0).toFixed(2).replace('.',',');
  const subtotal  = itens.reduce((s,i) => s + (i.preco||0)*(i.qtd||1), 0);
  const taxa      = Number(p.taxa_entrega||0);
  const total     = Number(p.total||0);
  const agora     = new Date(p.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const isEntrega = p.endereco && p.endereco !== 'Retirada no local' && !p.endereco.startsWith('No local');
  const cnpjRaw   = (estab?.cpf_cnpj || estab?.cnpj || '').replace(/\D/g,'');
  const cnpjFmt   = cnpjRaw.length === 14
    ? cnpjRaw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : cnpjRaw.length === 11
      ? cnpjRaw.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
      : cnpjRaw;
  const insta     = estab?.instagram ? '@' + estab.instagram : '';
  const ttok      = estab?.tiktok   ? '@' + estab.tiktok   : '';
  const msgFim    = estab?.msg_nota || 'Obrigado pela preferencia!';
  const pgto      = (p.pagamento || 'Nao informado').toUpperCase();
  const numPed    = '#' + p.id.slice(-6).toUpperCase();

  const html = `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<title>Nota ${numPed}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700;900&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Poppins', Arial, sans-serif;
    font-size: 13px;
    font-weight: 400;
    color: #000;
    background: #fff;
    width: 300px;
    max-width: 300px;
    margin: 0 auto;
    padding: 12px 10px;
  }
  /* Garantia que tudo fica dentro da largura do papel */
  * { max-width: 100%; word-break: break-word; }

  /* Títulos — Poppins Bold */
  .bold  { font-weight: 700; }
  .black { font-weight: 900; }

  /* Alinhamentos */
  .center { text-align: center; }
  .right  { text-align: right; }

  /* Logo */
  .logo { font-size: 20px; font-weight: 900; letter-spacing: .06em; line-height: 1.2; }
  .logo-red { color: #C0392B; }

  /* Nome da empresa */
  .empresa { font-size: 14px; font-weight: 700; margin-top: 2px; }

  /* Informações menores */
  .info-sm { font-size: 11px; font-weight: 400; color: #333; line-height: 1.7; margin-top: 3px; }

  /* Separadores */
  .sep-dash  { border: none; border-top: 1px dashed #888; margin: 8px 0; }
  .sep-solid { border: none; border-top: 2px solid #000; margin: 8px 0; }
  .sep-thick { border: none; border-top: 3px solid #000; margin: 8px 0; }

  /* Número do pedido destaque */
  .num-ped { font-size: 22px; font-weight: 900; letter-spacing: .1em; line-height: 1.1; }
  .badge {
    display: inline-block;
    background: #000;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 10px;
    border-radius: 3px;
    letter-spacing: .06em;
    margin-top: 3px;
  }

  /* Seção título */
  .sec {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: #555;
    border-bottom: 1px solid #ccc;
    padding-bottom: 3px;
    margin: 8px 0 5px;
  }

  /* Linhas de dados */
  .linha {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    font-size: 12px;
    font-weight: 400;
    padding: 1px 0;
    gap: 6px;
  }
  .linha .label { font-weight: 700; flex-shrink: 0; }
  .linha .val   { text-align: right; }

  /* Itens do pedido */
  .item {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 400;
    padding: 3px 0;
    gap: 6px;
    border-bottom: 1px dotted #ddd;
  }
  .item:last-child { border-bottom: none; }
  .item-nome { flex: 1; font-weight: 700; }
  .item-qtd  { font-weight: 900; color: #C0392B; flex-shrink: 0; }
  .item-val  { flex-shrink: 0; }

  .adicional {
    font-size: 11px;
    font-weight: 400;
    color: #555;
    padding: 1px 0 1px 12px;
  }

  /* Observação */
  .obs {
    border: 1.5px solid #000;
    border-radius: 3px;
    padding: 5px 8px;
    font-size: 12px;
    font-weight: 400;
    margin: 6px 0;
  }
  .obs-titulo { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }

  /* Subtotais */
  .subtotal-linha {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 400;
    padding: 2px 0;
  }

  /* Total final */
  .total-bloco {
    border-top: 2px solid #000;
    border-bottom: 2px solid #000;
    padding: 5px 0;
    margin: 4px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .total-label { font-size: 15px; font-weight: 900; }
  .total-val   { font-size: 17px; font-weight: 900; color: #C0392B; }

  /* Pagamento */
  .pgto-linha {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 700;
    padding: 4px 0;
    border-bottom: 1px dashed #bbb;
  }

  /* Redes sociais */
  .social { font-size: 11px; font-weight: 400; text-align: center; line-height: 1.8; color: #333; }
  .social b { font-weight: 700; }

  /* Mensagem final */
  .msg-final { font-size: 12px; font-weight: 700; text-align: center; margin: 6px 0 2px; }

  /* Rodapé */
  .rodape { font-size: 10px; font-weight: 400; text-align: center; color: #888; letter-spacing: .04em; }

  @media print {
    body { padding: 4px 6px; }
    @page { margin: 0; size: 80mm auto; }
  }
</style></head><body>

<!-- ====== CABEÇALHO ====== -->
<div class="center">
  <div class="logo">PEDI<span class="logo-red">WAY</span></div>
  <div class="empresa">${estab?.nome || 'Estabelecimento'}</div>
  <div class="info-sm">
    ${estab?.endereco ? ''+(estab.endereco)+'<br>' : ''}
    ${estab?.cidade ? ''+(estab.cidade)+'<br>' : ''}
    ${estab?.telefone_contato ? 'Tel: '+(estab.telefone_contato)+'<br>' : ''}
    ${estab?.whatsapp ? 'WhatsApp: '+(estab.whatsapp)+'<br>' : ''}
    ${cnpjFmt ? 'CNPJ/CPF: '+(cnpjFmt)+'' : ''}
  </div>
</div>

<hr class="sep-thick">

<!-- ====== NÚMERO DO PEDIDO ====== -->
<div class="center">
  <div class="num-ped">${numPed}</div>
  <div class="badge">${isEntrega ? 'ENTREGA' : 'RETIRADA'}</div>
  <div class="info-sm" style="margin-top:4px">${agora}</div>
</div>

<hr class="sep-dash">

<!-- ====== DADOS DO CLIENTE ====== -->
<div class="sec">Dados do Cliente</div>

<div class="linha">
  <span class="label">Nome</span>
  <span class="val">${p.cliente_nome || '-'}</span>
</div>
${p.cliente_whats ? '<div class="linha"><span class="label">WhatsApp</span><span class="val">'+(p.cliente_whats)+'</span></div>' : ''}
${isEntrega ? ' <div class="linha" style="margin-top:3px">   <span class="label">Entrega&nbsp;</span>   <span class="val" style="text-align:right">'+(p.endereco)+'</span> </div>' : ''}

<!-- OBSERVAÇÃO -->
${p.observacao ? ' <div class="obs">   <div class="obs-titulo">Observacao</div>   '+(p.observacao)+' </div>' : ''}

<hr class="sep-dash">

<!-- ====== ITENS ====== -->
<div class="sec">Itens do Pedido</div>

${itens.map(i => {   const sub = ((i.preco||0)*(i.qtd||1)).toFixed(2).replace('.',',');   const adds = Array.isArray(i.adicionais) && i.adicionais.length     ? i.adicionais.map(a => '<div class="adicional">+ '+(a.nome)+' (R$ '+(Number(a.preco||0).toFixed(2).replace('.',','))+')</div>').join('')     : '';   return '<div class="item">     <span class="item-qtd">'+(i.qtd||1)+'x</span>     <span class="item-nome">'+(i.nome)+'</span>     <span class="item-val">R$ '+(sub)+'</span>   </div>'+(adds)+''; }).join('')}

<hr class="sep-dash">

<!-- ====== TOTAIS ====== -->
${subtotal !== total - taxa ? '<div class="subtotal-linha"><span>Subtotal</span><span>'+(fmtR(subtotal))+'</span></div>' : ''}
${taxa > 0 ? '<div class="subtotal-linha"><span>Entrega</span><span>'+(fmtR(taxa))+'</span></div>' : ''}

<div class="total-bloco">
  <span class="total-label">TOTAL</span>
  <span class="total-val">${fmtR(total)}</span>
</div>

<div class="pgto-linha">
  <span>Pagamento</span>
  <span>${pgto}</span>
</div>

${(insta || ttok || estab?.site) ? ' <hr class="sep-dash"> <div class="social">   '+(insta ? 'Instagram: <b>'+(insta)+'</b><br>' : '')+'   '+(ttok  ? 'TikTok: <b>'+(ttok)+'</b><br>'    : '')+'   '+(estab?.site ? '<span>'+(estab.site)+'</span>' : '')+' </div>' : ''}

<hr class="sep-dash">
<div class="msg-final">${msgFim}</div>
<div class="rodape">PEDIWAY · Plataforma de delivery independente</div>

</body></html>`;

  const w = window.open('', '_blank', 'width=340,height=750');
  if (!w) { alert('Permita pop-ups para imprimir.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 600);
};

window.buscarPedidos = function(termo) {
  const t = (termo||'').toLowerCase();
  document.querySelectorAll('#todos-pedidos .pedido-card').forEach(c => {
    c.style.display = (!t || c.textContent.toLowerCase().includes(t)) ? '' : 'none';
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// REALTIME + POLLING (pedidos)
// ─────────────────────────────────────────────────────────────────────────────
let _notifLoop = null;

function tocarNotif() {
  if (_audioAtual) {
    _audioAtual.pause();
    _audioAtual.currentTime = 0;
  }
  try {
    const a = new Audio('/sounds/new-order.mp3');
    a.volume = 0.85;
    _audioAtual = a;
    a.play().catch(() => {
      // Fallback: tenta o arquivo antigo
      const b = new Audio('/notificacao.mp3');
      b.volume = 0.85; _audioAtual = b;
      b.play().catch(()=>{});
    });
  } catch(e) {}
}
function pararNotif() {
  clearTimeout(_notifLoop);
  _notifLoop = null;
  if (_audioAtual) { _audioAtual.pause(); _audioAtual.currentTime = 0; _audioAtual = null; }
}
function notifLoop(id) {
  tocarNotif();
  // Quando o som terminar, aguarda 5s e toca de novo se o pedido ainda está aguardando
  if (_audioAtual) {
    _audioAtual.onended = () => {
      _notifLoop = setTimeout(() => {
        if (document.getElementById(`pnc-${id}`)) notifLoop(id);
      }, 5000);
    };
  } else {
    _notifLoop = setTimeout(() => {
      if (document.getElementById(`pnc-${id}`)) notifLoop(id);
    }, 5000);
  }
}

function iniciarRealtime() {
  const estab = getEstab(); if (!estab || estab.id === 'demo') return;

  // Remove canal anterior limpo
  if (realtimeSub) {
    try { getSupa().removeChannel(realtimeSub); } catch(e) {}
    realtimeSub = null;
  }

  const channelName = 'pedidos-' + estab.id;

  realtimeSub = getSupa()
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pedidos' },
      async payload => {
        const p = payload.new;
        if (!p || !p.id) return;
        if (p.estabelecimento_id !== estab.id) return;

        // ── Pedido de mesa (No local) ──────────────────────────────
        if (p.endereco && p.endereco.startsWith('No local')) {
          const parts = p.endereco.split('—');
          if (!(parts.length < 2)) {
            const key = parts[1].trim().split('·')[0].trim();
            if (!_pedidosMesas[key]) _pedidosMesas[key] = [];
            if (!_pedidosMesas[key].find(x => x.id === p.id)) {
              _pedidosMesas[key].push(p);
              renderMesas();
              showToast('🍽️ Novo pedido na ' + key + '!');
            }
          }
        }

        // ── Pedido de mesa: atualiza visão geral, financeiro e mesas
        if ((p.endereco||'').startsWith('No local')) {
          await carregarPedidosMesas(); renderMesas();
          window.renderHistoricoMesas(); // atualiza histórico em tempo real
          await renderPedidos();
          if (document.querySelector('#tab-financeiro.active') ||
              document.querySelector('[data-tab="financeiro"].active')) {
            await carregarFinanceiro();
          }
          return;
        }
        // ── Pedido normal (delivery/retirada) — aparece na aba Pedidos ─
        if (pedidosConhecidos.has(p.id)) return;
        pedidosConhecidos.add(p.id);
        const lista = $('pedidos-novos-lista');
        if (lista) {
          const ph = lista.querySelector('[data-placeholder]');
          if (ph) ph.remove();
          lista.insertAdjacentHTML('afterbegin', cardNovoHTML(p));
          atualizarBadgePedidos();
          notifLoop(p.id);
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pedidos' },
      async payload => {
        // Notifica dashboard quando KDS marca como pronto
        const _ant = payload.old || {};
        const _novo = payload.new || {};
        if (_novo.setores_status && JSON.stringify(_novo.setores_status) !== JSON.stringify(_ant.setores_status)) {
          const _allPronto = Object.keys(_novo.setores_status||{}).length > 0 &&
            Object.values(_novo.setores_status||{}).every(function(v){return v==='pronto';});
          if (_allPronto && !(_ant.setores_status && Object.values(_ant.setores_status||{}).every(function(v){return v==='pronto';}))) {
            const _numP = '#' + String(_novo.id||'').slice(-4).toUpperCase();
            showToast('🍽️ Pedido ' + _numP + ' PRONTO na cozinha!', 4000);
            // Push para cliente quando KDS marca tudo pronto
            const _isDelKDS = (_novo?.endereco||'').length > 20;
            enviarPushCliente(_novo?.id, 'pronto', _isDelKDS);
          }
        }
        const p = payload.new;
        if (!p || p.estabelecimento_id !== estab.id) return;
        await renderPedidos(); // atualiza visão geral (stat-pedidos, stat-faturamento)
        // Financeiro em tempo real — recarrega se a aba estiver ativa
        if (document.querySelector('#tab-financeiro.active') ||
            document.querySelector('[data-tab="financeiro"].active')) {
          await carregarFinanceiro();
        }
        // Se é pedido de mesa, re-sincroniza mesas
        if ((p.endereco||'').startsWith('No local')) {
          await carregarPedidosMesas();
          renderMesas();
          window.renderHistoricoMesas();
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Canal conectado — sem log em produção
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[Realtime] Erro, tentando reconectar em 5s...');
        setTimeout(iniciarRealtime, 5000);
      }
    });

  // Polling de segurança a cada 5s
  clearInterval(pollingId);
  pollingId = setInterval(async () => {
    const est = getEstab(); if (!est || est.id === 'demo') return;
    const { data } = await getSupa().from('pedidos').select('id,cliente_nome,itens,total,status,created_at,endereco')
      .eq('estabelecimento_id', est.id).eq('status','novo').order('created_at',{ascending:false}).limit(20);
    if (!data) return;
    data.forEach(p => {
      if ((p.endereco||'').startsWith('No local')) return; // mesa → aba Comandas
      if (!pedidosConhecidos.has(p.id)) {
        pedidosConhecidos.add(p.id);
        const lista = $('pedidos-novos-lista');
        if (lista) {
          const ph = lista.querySelector('div[style]');
          if (ph && ph.textContent.includes('Nenhum')) ph.remove();
          lista.insertAdjacentHTML('afterbegin', cardNovoHTML(p));
          atualizarBadgePedidos();
          notifLoop(p.id);
        }
      }
    });
  }, 5000);
}


// ─────────────────────────────────────────────────────────────────────────────
// FINANCEIRO DO ESTABELECIMENTO
// ─────────────────────────────────────────────────────────────────────────────
let _finPeriodo = 'hoje';
let _finPedidos = [];

async function carregarFinanceiro() {
  const estab = getEstab(); if (!estab || estab.id === 'demo') return;
  const { data } = await getSupa()
    .from('pedidos').select('*')
    .eq('estabelecimento_id', estab.id)
    .order('created_at', { ascending: false })
    .limit(500);
  // Financeiro inclui TODOS os pedidos: delivery + mesas/comandas
  _finPedidos = (data || []);
  renderFinanceiro();
}

function filtroPedidosFin() {
  const now = new Date();
  return _finPedidos.filter(p => {
    if (p.status === 'recusado') return false;
    const d = new Date(p.created_at);
    if (_finPeriodo === 'hoje')   return d.toDateString() === now.toDateString();
    if (_finPeriodo === 'semana') { const s=new Date(now); s.setDate(s.getDate()-7); return !(d<s); }
    if (_finPeriodo === 'mes')    return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
    if (_finPeriodo === 'custom') {
      const deVal  = document.getElementById('fin-data-de')?.value;
      const ateVal = document.getElementById('fin-data-ate')?.value;
      if (deVal && d < new Date(deVal + 'T00:00:00')) return false;
      if (ateVal && d > new Date(ateVal + 'T23:59:59')) return false;
      return true;
    }
    return true;
  });
}

function renderFinanceiro() {
  const peds = filtroPedidosFin();
  const fat  = peds.reduce((s,p)=>s+Number(p.total||0),0);
  const taxa = peds.reduce((s,p)=>s+Number(p.taxa_entrega||0),0);
  const tick = peds.length ? fat/peds.length : 0;
  const fmtR = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});

  const se = id => document.getElementById(id);
  if (se('fin-fat-est'))  se('fin-fat-est').textContent  = fmtR(fat);
  if (se('fin-qtd-est'))  se('fin-qtd-est').textContent  = peds.length;
  if (se('fin-tick-est')) se('fin-tick-est').textContent = fmtR(tick);
  if (se('fin-taxa-est')) se('fin-taxa-est').textContent = fmtR(taxa);

  // ── Pagamentos — 4 círculos fixos com donut SVG ──
  const METODOS = [
    {key:'pix',     label:'PIX',           emoji:'📱', cor:'#22c55e', match:pg=>pg.includes('pix')&&!pg.includes('cred')},
    {key:'credito', label:'Cartão Crédito',emoji:'💳', cor:'#3b82f6', match:pg=>pg.includes('cred')},
    {key:'debito',  label:'Cartão Débito', emoji:'💳', cor:'#8b5cf6', match:pg=>pg.includes('deb')},
    {key:'dinheiro',label:'Dinheiro',      emoji:'💵', cor:'#f59e0b', match:pg=>pg.includes('din')},
  ];
  const totPag = peds.reduce((s,p)=>s+Number(p.total||0),0)||1;
  const circ   = 2*Math.PI*28;
  const pagsEl = se('fin-pags-est');
  if (pagsEl) pagsEl.innerHTML = '<div class="pag-circles-grid">' + METODOS.map(m=>{
    const pm  = peds.filter(p=>m.match((p.pagamento||'').toLowerCase()));
    const fat2= pm.reduce((s,p)=>s+Number(p.total||0),0);
    const pct = Math.round(fat2/totPag*100);
    const dash= (pct/100)*circ; const gap=circ-dash;
    return '<div class="pag-circle-card" onclick="filtrarPorPagamento(\''+m.key+'\')" style="background:#fff;border:1.5px solid #f0ebe4;border-radius:16px;padding:14px 8px;text-align:center;cursor:pointer;transition:all .2s" onmouseover="this.style.borderColor=\''+m.cor+'\'" onmouseout="this.style.borderColor=\'#f0ebe4\'">' +
      '<svg viewBox="0 0 72 72" style="display:block;margin:0 auto 8px;width:100%;max-width:72px;height:auto">' +
        '<circle cx="36" cy="36" r="28" fill="none" stroke="#f0ebe4" stroke-width="8"/>' +
        '<circle cx="36" cy="36" r="28" fill="none" stroke="'+m.cor+'" stroke-width="8" stroke-dasharray="'+dash.toFixed(1)+' '+gap.toFixed(1)+'" stroke-linecap="round" transform="rotate(-90 36 36)"/>' +
        '<text x="36" y="40" text-anchor="middle" style="font-family:\'Poppins\',sans-serif;font-size:13px;font-weight:800;fill:'+(pct>0?m.cor:'#ccc')+'">'+pct+'%</text>' +
      '</svg>' +
      '<div style="font-size:.62rem;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">'+m.emoji+' '+m.label+'</div>' +
      '<div style="font-size:.88rem;font-weight:800;color:#1a1a1a">'+fmtR(fat2)+'</div>' +
      '<div style="font-size:.62rem;color:#aaa;margin-top:2px">'+pm.length+' pedido(s)</div>' +
    '</div>';
  }).join('') + '</div>';

  // ── Origem: Mesas vs Delivery ──
  const pedsMesa     = peds.filter(p=>(p.endereco||'').startsWith('No local'));
  const pedsDelivery = peds.filter(p=>!(p.endereco||'').startsWith('No local'));
  const fatMesa      = pedsMesa.reduce((s,p)=>s+Number(p.total||0),0);
  const fatDelivery  = pedsDelivery.reduce((s,p)=>s+Number(p.total||0),0);
  const totOrigem    = (fatMesa+fatDelivery)||1;
  const origemEl     = se('fin-origem-est');
  if (origemEl) origemEl.innerHTML = '<div class="pag-circles-grid" style="grid-template-columns:1fr 1fr">' +
    [{label:'Mesas',emoji:'🍽️',cor:'#8E44AD',fat:fatMesa,q:pedsMesa.length},
     {label:'Delivery',emoji:'🛵',cor:'#2980B9',fat:fatDelivery,q:pedsDelivery.length}].map(o=>{
      const pct2=Math.round(o.fat/totOrigem*100);
      const d2=(pct2/100)*circ; const g2=circ-d2;
      return '<div class="pag-circle-card" style="background:#fff;border:1.5px solid #f0ebe4;border-radius:16px;padding:14px 8px;text-align:center">' +
        '<svg viewBox="0 0 72 72" style="display:block;margin:0 auto 8px;width:100%;max-width:72px;height:auto">' +
          '<circle cx="36" cy="36" r="28" fill="none" stroke="#f0ebe4" stroke-width="8"/>' +
          '<circle cx="36" cy="36" r="28" fill="none" stroke="'+o.cor+'" stroke-width="8" stroke-dasharray="'+d2.toFixed(1)+' '+g2.toFixed(1)+'" stroke-linecap="round" transform="rotate(-90 36 36)"/>' +
          '<text x="36" y="40" text-anchor="middle" style="font-family:\'Poppins\',sans-serif;font-size:13px;font-weight:800;fill:'+(pct2>0?o.cor:'#ccc')+'">'+pct2+'%</text>' +
        '</svg>' +
        '<div style="font-size:.62rem;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">'+o.emoji+' '+o.label+'</div>' +
        '<div style="font-size:.88rem;font-weight:800;color:#1a1a1a">'+fmtR(o.fat)+'</div>' +
        '<div style="font-size:.62rem;color:#aaa;margin-top:2px">'+o.q+' pedido(s)</div>' +
      '</div>';
    }).join('') + '</div>';

  // ── Histórico ──
  const histEl = se('fin-hist-est');
  if (histEl) histEl.innerHTML = !peds.length
    ? '<tr><td colspan="6" style="text-align:center;padding:24px;color:#aaa;font-size:0.82rem">Nenhum pedido no período</td></tr>'
    : peds.slice(0,100).map(p => {
        const dt = new Date(p.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
        const fmtV = v => 'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
        const isMesa   = (p.endereco||'').startsWith('No local');
        const origem   = isMesa ? '🍽️ Mesa' : '🛵 Delivery';
        const endCurto = isMesa ? (p.endereco||'').replace('No local — ','') : ((p.endereco||'Retirada').length>18?(p.endereco||'').slice(0,18)+'…':(p.endereco||'Retirada'));
        let pgto = (p.pagamento||'—').toUpperCase();
        if (pgto==='NO LOCAL') pgto='—';
        return '<tr><td style="font-weight:800;color:var(--red)">#'+p.id.slice(-4).toUpperCase()+'</td><td style="font-weight:600">'+( p.cliente_nome||'—')+'</td><td style="font-size:.72rem;color:#aaa" title="'+(p.endereco||'')+'">'+origem+' · '+endCurto+'</td><td><span style="background:#f0e9e0;padding:2px 8px;border-radius:50px;font-size:.68rem;font-weight:700">'+pgto+'</span></td><td style="text-align:right;font-weight:800;color:var(--red)">'+fmtV(p.total)+'</td><td style="color:#aaa;font-size:.7rem;white-space:nowrap">'+dt+'</td></tr>';
      }).join('');
}

// Filtra pedidos por método de pagamento ao clicar no círculo
window.filtrarPorPagamento = function(metodo) {
  const MATCH = {
    pix:      pg=>pg.includes('pix')&&!pg.includes('cred'),
    credito:  pg=>pg.includes('cred'),
    debito:   pg=>pg.includes('deb'),
    dinheiro: pg=>pg.includes('din'),
  };
  const fn = MATCH[metodo]; if(!fn) return;
  const LABELS={pix:'PIX',credito:'Cartão Crédito',debito:'Cartão Débito',dinheiro:'Dinheiro'};
  const fmtR = v=>'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const peds = (_finPedidos||[]).filter(p=>fn((p.pagamento||'').toLowerCase())&&p.status!=='recusado');
  const tot  = peds.reduce((s,p)=>s+Number(p.total||0),0);
  // Navega para pedidos
  const btn = document.querySelector('[data-tab="pedidos-tab"]');
  if(btn) showTab('pedidos-tab',btn);
  // Mostra aviso e filtra cards
  setTimeout(()=>{
    const cont = document.getElementById('todos-pedidos'); if(!cont) return;
    let aviso = document.getElementById('ped-filtro-aviso');
    if(!aviso){aviso=document.createElement('div');aviso.id='ped-filtro-aviso';aviso.style.cssText='font-size:.78rem;font-weight:700;padding:10px 0;text-align:center;color:var(--red)';cont.prepend(aviso);}
    aviso.textContent='🔍 '+LABELS[metodo]+' — '+peds.length+' pedido(s) · '+fmtR(tot);
    document.querySelectorAll('#todos-pedidos .pedido-card').forEach(c=>{
      const pg=(c.dataset.pagamento||'').toLowerCase();
      c.style.display=fn(pg)?'':'none';
    });
  },200);
};

function setFinPeriodo(p, btn) {
  _finPeriodo = p;
  ['fin-hoje','fin-semana','fin-mes','fin-tudo','fin-custom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('ativo');
  });
  if (btn) btn.classList.add('ativo');
  const cw = document.getElementById('fin-custom-wrap');
  if (cw) cw.style.display = p === 'custom' ? 'block' : 'none';
  if (p !== 'custom') renderFinanceiro();
}

window.buscarPeriodoFinanceiro = async function() {
  const estab  = getEstab(); if (!estab) return;
  const deVal  = document.getElementById('fin-data-de')?.value;
  const ateVal = document.getElementById('fin-data-ate')?.value;
  if (!deVal && !ateVal) return;
  _finPeriodo = 'custom';

  // Re-busca do banco com o range real (não fica limitado ao cache de 500)
  var q = getSupa().from('pedidos').select('*')
    .eq('estabelecimento_id', estab.id)
    .neq('status','recusado')
    .order('created_at', { ascending: false });
  if (deVal)  q = q.gte('created_at', deVal + 'T00:00:00');
  if (ateVal) q = q.lte('created_at', ateVal + 'T23:59:59');

  const { data, error } = await q.limit(2000);
  if (error) { showToast('Erro na busca: ' + error.message, 2000); return; }
  _finPedidos = data || [];
  renderFinanceiro();
  showToast('✅ ' + (_finPedidos.length) + ' pedidos encontrados');
};

function exportarCSV() {
  const estab  = getEstab();
  const linhas = [['#','Cliente','WhatsApp','Status','Pagamento','Total','Taxa Entrega','Data']];
  _finPedidos.forEach(p => {
    linhas.push([
      p.id.slice(-4).toUpperCase(),
      p.cliente_nome||'',
      p.cliente_whats||'',
      p.status,
      p.pagamento||'',
      Number(p.total||0).toFixed(2),
      Number(p.taxa_entrega||0).toFixed(2),
      new Date(p.created_at).toLocaleString('pt-BR'),
    ]);
  });
  const csv = linhas.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\n');
  const a   = document.createElement('a');
  a.href    = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download= `pedidos-${estab?.slug||'loja'}-${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.csv`;
  a.click();
}

function exportarPDF() {
  const estab = getEstab();
  const peds  = filtroPedidosFin();
  const fmtR  = v => 'R$ ' + Number(v||0).toFixed(2).replace('.',',');
  const fat   = peds.reduce((s,p)=>s+Number(p.total||0),0);
  const taxa  = peds.reduce((s,p)=>s+Number(p.taxa_entrega||0),0);
  const tick  = peds.length ? fat/peds.length : 0;
  const periodoLabel = {hoje:'Hoje',semana:'Esta semana',mes:'Este mês',tudo:'Todo o período'}[_finPeriodo]||'';
  const agora = new Date().toLocaleString('pt-BR');

  // Breakdown de pagamentos
  const pm = {};
  peds.forEach(p => {
    const k = (p.pagamento||'Não informado').toUpperCase();
    if (!pm[k]) pm[k] = { q:0, f:0 };
    pm[k].q++; pm[k].f += Number(p.total||0);
  });
  const totPag = Object.values(pm).reduce((s,v)=>s+v.f,0)||1;
  const pagRows = Object.entries(pm).sort((a,b)=>b[1].f-a[1].f)
    .map(([k,d]) => '<tr><td>'+k+'</td><td>'+d.q+'</td><td style="text-align:right">'+fmtR(d.f)+'</td><td style="text-align:right">'+Math.round(d.f/totPag*100)+'%</td></tr>')
    .join('');

  // Linhas do histórico
  const pedRows = peds.slice(0,200).map(p => {
    const dt = new Date(p.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    return '<tr><td style="font-weight:700">#'+p.id.slice(-4).toUpperCase()+'</td><td>'+(p.cliente_nome||'—')+'</td><td style="font-size:10px;color:#666">'+(p.endereco||'Retirada')+'</td><td>'+(p.pagamento||'—')+'</td><td style="text-align:right;font-weight:700;color:#C0392B">'+fmtR(p.total)+'</td><td style="color:#888">'+dt+'</td></tr>';
  }).join('') + '<tr style="font-weight:800;background:#fdf8f5"><td colspan="4">TOTAL ('+peds.length+' pedidos)</td><td style="text-align:right;color:#16a34a">'+fmtR(fat)+'</td><td></td></tr>';

  const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório — '+(estab?.nome||'Loja')+'</title>'
    + '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:12px;color:#1a1a1a;padding:32px}'
    + '.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;border-bottom:2px solid #C0392B;padding-bottom:16px}'
    + '.logo{font-size:20px;font-weight:900}.logo span{color:#C0392B}'
    + '.meta{text-align:right;font-size:11px;color:#666}'
    + '.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}'
    + '.card{background:#f8f5f2;border-radius:8px;padding:14px}'
    + '.card-label{font-size:9px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}'
    + '.card-val{font-size:18px;font-weight:800}.card-val.g{color:#16a34a}.card-val.r{color:#C0392B}'
    + '.section{margin-bottom:20px}.section-title{font-size:11px;font-weight:800;text-transform:uppercase;color:#888;margin-bottom:10px}'
    + 'table{width:100%;border-collapse:collapse}'
    + 'th{background:#f0ebe4;padding:7px 10px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;color:#666}'
    + 'td{padding:8px 10px;border-bottom:1px solid #ede8e0;font-size:11px}'
    + 'tr:last-child td{border-bottom:none}'
    + '.footer{margin-top:32px;text-align:center;font-size:10px;color:#aaa}'
    + '@media print{body{padding:0}}'
    + '</style></head><body>'
    + '<div class="header"><div><div class="logo">PEDI<span>WAY</span></div><div style="font-size:13px;font-weight:700;margin-top:4px">'+(estab?.nome||'Estabelecimento')+'</div></div>'
    + '<div class="meta"><strong style="display:block;font-size:13px;color:#1a1a1a">Relatório Financeiro</strong>Período: '+periodoLabel+'<br>Gerado em: '+agora+'</div></div>'
    + '<div class="cards">'
    + '<div class="card"><div class="card-label">Faturamento</div><div class="card-val g">'+fmtR(fat)+'</div></div>'
    + '<div class="card"><div class="card-label">Pedidos</div><div class="card-val">'+peds.length+'</div></div>'
    + '<div class="card"><div class="card-label">Ticket médio</div><div class="card-val r">'+fmtR(tick)+'</div></div>'
    + '<div class="card"><div class="card-label">Taxa entrega</div><div class="card-val">'+fmtR(taxa)+'</div></div>'
    + '</div>'
    + '<div class="section"><div class="section-title">Por forma de pagamento</div>'
    + '<table><thead><tr><th>Forma</th><th>Pedidos</th><th style="text-align:right">Total</th><th style="text-align:right">%</th></tr></thead><tbody>'+pagRows+'</tbody></table></div>'
    + '<div class="section"><div class="section-title">Histórico de pedidos</div>'
    + '<table><thead><tr><th>#</th><th>Cliente</th><th>Endereço</th><th>Pagamento</th><th style="text-align:right">Total</th><th>Data</th></tr></thead><tbody>'+pedRows+'</tbody></table></div>'
    + '<div class="footer">Relatório gerado pelo PEDIWAY — '+agora+'</div>'
    + '</body></html>';

  const w = window.open('','_blank');
  if (!w) { alert('Permita pop-ups para exportar o PDF.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 600);
}


// ── CANCELAR PLANO ────────────────────────────────────────────────────────────
window.abrirCancelarPlano = function() {
  document.getElementById('modal-cancelar-plano')?.classList.add('open');
};
window.fecharCancelarPlano = function() {
  document.getElementById('modal-cancelar-plano')?.classList.remove('open');
};
window.confirmarCancelamento = async function() {
  const radios = document.querySelectorAll('input[name="motivo-cancel"]');
  let motivo = '';
  radios.forEach(r => { if(r.checked) motivo = r.value; });
  if (!motivo) return showToast('Selecione um motivo.', 'error');

  const msg    = document.getElementById('cancel-msg')?.value.trim() || '';
  const estab  = getEstab();
  if (!estab) return;

  const { error } = await getSupa().from('cancelamentos_plano').insert({
    estab_id: estab.id,
    motivo,
    mensagem: msg || null,
  });

  if (error) return showToast('Erro ao registrar cancelamento.', 'error');

  // Atualiza plano para basico
  await getSupa().from('estabelecimentos')
    .update({ plano:'basico', pagamento_status:'cancelado' })
    .eq('id', estab.id);

  fecharCancelarPlano();
  showToast('Cancelamento registrado. Sentiremos sua falta! 😔');
  setTimeout(() => initDashboard(), 1000);
};

// Mostra/esconde botão cancelar baseado no plano
function atualizarBotaoCancelar(estab) {
  const wrap = document.getElementById('cancelar-plano-wrap');
  if (wrap) wrap.style.display = (estab?.plano && estab.plano !== 'basico') ? 'block' : 'none';
}





// ═══════════════════════════════════════════════════════════
// SISTEMA DE ADICIONAIS (comanda garçom + cardápio)
// ═══════════════════════════════════════════════════════════
let _adicionalProduto   = null; // produto sendo configurado
let _adicionalSel       = {};   // { grupoIdx: [opcaoIdx, ...] }
let _adicionalMesaKey   = null;

window.fecharAdicionais = function() {
  document.getElementById('modal-adicionais')?.classList.remove('open');
  document.body.style.overflow = '';
  _adicionalProduto = null;
  _adicionalSel = {};
};

// Chamada quando produto tem adicionais
window.abrirAdicionais = function(mesaKey, prodJSON) {
  const prod = JSON.parse(decodeURIComponent(prodJSON));
  _adicionalProduto = prod;
  _adicionalMesaKey = mesaKey;
  _adicionalSel     = {};

  document.getElementById('adicionais-nome').textContent  = prod.nome;
  document.getElementById('adicionais-preco-base').textContent = 'R$ ' + Number(prod.preco).toFixed(2).replace('.',',');

  const grupos = Array.isArray(prod.adicionais) ? prod.adicionais : [];
  const el = document.getElementById('adicionais-grupos');
  if (!el) return;

  el.innerHTML = grupos.map((g, gi) => {
    const maxTxt = g.max === 1 ? 'Escolha 1' : g.min > 0 ? `Mín. ${g.min}, Máx. ${g.max}` : `Até ${g.max}`;
    const obrig  = g.min > 0;
    return `<div class="adicional-grupo">
      <div class="adicional-grupo-titulo">${g.grupo} ${obrig?'<span style="color:var(--red);font-size:.65rem">*obrigatório</span>':''}</div>
      <div class="adicional-grupo-desc">${maxTxt}</div>
      ${g.opcoes.map((o, oi) => '         <div class="adicional-opt" id="aopt-'+(gi)+'-'+(oi)+'" onclick="toggleAdicional('+(gi)+','+(oi)+','+(g.max)+')">           <div class="adicional-opt-left">             <div class="adicional-opt-check">✓</div>             <span class="adicional-opt-nome">'+(o.nome)+'</span>           </div>           <span class="adicional-opt-preco">'+(Number(o.preco||0) > 0 ? '+R$ '+Number(o.preco).toFixed(2).replace('.',',') : 'Grátis')+'</span>         </div>').join('')}
      <div class="adicional-limite-aviso" id="aviso-${gi}">Limite de ${g.max} opções atingido</div>
    </div>`;
  }).join('');

  calcTotalAdicionais();
  document.getElementById('modal-adicionais')?.classList.add('open');
};

window.toggleAdicional = function(gi, oi, max) {
  if (!_adicionalSel[gi]) _adicionalSel[gi] = [];
  const sel = _adicionalSel[gi];
  const idx = sel.indexOf(oi);

  if (!(idx < 0)) {
    // Deseleciona
    sel.splice(idx, 1);
    document.getElementById('aopt-'+gi+'-'+oi)?.classList.remove('sel');
  } else {
    if (!(sel.length < max)) {
      // Atingiu limite
      document.getElementById('aviso-'+gi)?.classList.add('show');
      setTimeout(()=>document.getElementById('aviso-'+gi)?.classList.remove('show'), 2000);
      return;
    }
    sel.push(oi);
    document.getElementById('aopt-'+gi+'-'+oi)?.classList.add('sel');
  }
  calcTotalAdicionais();
};

function calcTotalAdicionais() {
  if (!_adicionalProduto) return;
  const grupos = Array.isArray(_adicionalProduto.adicionais) ? _adicionalProduto.adicionais : [];
  let extra = 0;
  Object.entries(_adicionalSel).forEach(([gi, ois]) => {
    ois.forEach(oi => {
      extra += Number(grupos[gi]?.opcoes?.[oi]?.preco || 0);
    });
  });
  const total = Number(_adicionalProduto.preco) + extra;
  const el = document.getElementById('adicionais-total');
  if (el) el.textContent = 'R$ ' + total.toFixed(2).replace('.',',');
}

window.confirmarAdicionais = function() {
  if (!_adicionalProduto || !_adicionalMesaKey) return;
  const grupos  = Array.isArray(_adicionalProduto.adicionais) ? _adicionalProduto.adicionais : [];

  // Valida obrigatórios
  for (let gi = 0; gi < grupos.length; gi++) {
    const g = grupos[gi];
    const qtdSel = (_adicionalSel[gi]||[]).length;
    if (g.min > 0 && qtdSel < g.min) {
      showToast('Escolha pelo menos ' + g.min + ' opção em "' + g.grupo + '"', 'error');
      return;
    }
  }

  // Monta descrição dos adicionais selecionados
  const descAdic = [];
  Object.entries(_adicionalSel).forEach(([gi, ois]) => {
    ois.forEach(oi => descAdic.push(grupos[gi]?.opcoes?.[oi]?.nome));
  });
  let extra = 0;
  Object.entries(_adicionalSel).forEach(([gi, ois]) => {
    ois.forEach(oi => { extra += Number(grupos[gi]?.opcoes?.[oi]?.preco || 0); });
  });

  const nomeCompleto = descAdic.length ? _adicionalProduto.nome + ' (' + descAdic.join(', ') + ')' : _adicionalProduto.nome;
  const precoFinal   = Number(_adicionalProduto.preco) + extra;

  addItemComanda(_adicionalMesaKey, _adicionalProduto.id + '_' + Date.now(), nomeCompleto, precoFinal, _adicionalProduto.emoji||'🍽️');
  window.fecharAdicionais();
  showToast('Adicionado! ✅');
};

// ── Imprimir comanda da mesa ──────────────────────────────────────────────────
window.imprimirComanda = function() {
  if (!_mesaAtual) return;
  const estab = getEstab();
  const peds  = _pedidosMesas[_mesaAtual] || [];
  const fmtR  = v => 'R$ ' + Number(v||0).toFixed(2).replace('.',',');
  const subtotal = peds.reduce((s,p) => s + Number(p.total||0), 0);
  const agora = new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const cnpjRaw = (estab?.cnpj || '').replace(/\D/g,'');
  const cnpjFmt = cnpjRaw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const insta   = estab?.instagram ? '@' + estab.instagram : '';
  const msgFim  = estab?.msg_nota || 'Obrigado pela preferencia!';

  // Taxa de serviço — respeita se o garçom removeu
  const taxaAtiva = estab?.taxa_servico === true && !_taxaServicoRemovida;
  const percServico = Number(estab?.perc_servico || 10);
  const valorTaxa = taxaAtiva ? subtotal * (percServico / 100) : 0;
  const total = subtotal + valorTaxa;

  // Agrupa por nome
  const grupos = {};
  peds.forEach(p => {
    const nm = p.cliente_nome || _mesaAtual;
    if (!grupos[nm]) grupos[nm] = [];
    grupos[nm].push(p);
  });

  const linhaTaxa = taxaAtiva ? `
  <div class="taxa-row">
    <span>Subtotal</span><span>${fmtR(subtotal)}</span>
  </div>
  <div class="taxa-row">
    <span>Taxa de serviço (${percServico}%)</span><span>${fmtR(valorTaxa)}</span>
  </div>` : '';

  const html = `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<title>Comanda ${_mesaAtual}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700;900&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Poppins', Arial, sans-serif;
    font-size: 13px;
    font-weight: 400;
    color: #000;
    background: #fff;
    width: 300px;
    max-width: 300px;
    margin: 0 auto;
    padding: 14px 10px;
  }
  * { max-width: 100%; word-break: break-word; }
  .center  { text-align: center; }
  .logo    { font-size: 18px; font-weight: 900; letter-spacing: .06em; }
  .logo-red { color: #C0392B; }
  .empresa { font-size: 13px; font-weight: 700; margin-top: 2px; }
  .info-sm { font-size: 10px; font-weight: 400; color: #444; line-height: 1.6; margin-top: 3px; }
  .sep-dash  { border: none; border-top: 1px dashed #888; margin: 8px 0; }
  .sep-thick { border: none; border-top: 3px solid #000; margin: 8px 0; }
  .mesa-bloco {
    background: #000; color: #fff;
    border-radius: 6px; padding: 10px 8px 8px;
    text-align: center; margin: 6px 0;
  }
  .mesa-lbl { font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #aaa; }
  .mesa-num { font-size: 38px; font-weight: 900; line-height: 1.1; }
  .hora     { font-size: 11px; font-weight: 400; color: #888; text-align: center; }
  .pessoa-bloco { margin-bottom: 10px; }
  .pessoa-nome {
    display: flex; align-items: center; gap: 8px;
    background: #f5f5f5; border-radius: 4px;
    padding: 5px 8px; margin-bottom: 4px;
  }
  .pessoa-avatar {
    width: 26px; height: 26px; border-radius: 50%;
    background: #C0392B; color: #fff;
    font-size: 12px; font-weight: 900;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .pessoa-label { font-size: 13px; font-weight: 700; }
  .item {
    display: flex; justify-content: space-between;
    align-items: flex-start; gap: 6px;
    font-size: 12px; font-weight: 400;
    padding: 2px 4px;
  }
  .item-nome { flex: 1; }
  .item-val  { flex-shrink: 0; font-weight: 700; }
  .pessoa-sub {
    display: flex; justify-content: flex-end;
    font-size: 12px; font-weight: 700;
    color: #C0392B; border-top: 1px dashed #ccc;
    padding-top: 3px; margin-top: 2px;
  }
  .taxa-row {
    display: flex; justify-content: space-between;
    font-size: 12px; font-weight: 500;
    padding: 3px 0; color: #444;
  }
  .total-row {
    display: flex; justify-content: space-between;
    font-size: 16px; font-weight: 900;
    border-top: 3px solid #000; border-bottom: 2px solid #000;
    padding: 6px 0; margin: 4px 0;
  }
  .total-val { color: #C0392B; }
  .social { font-size: 10px; font-weight: 400; text-align: center; line-height: 1.8; color: #444; }
  .msg-final { font-size: 12px; font-weight: 700; text-align: center; margin: 5px 0 2px; }
  .rodape { font-size: 9px; font-weight: 400; color: #bbb; text-align: center; letter-spacing: .04em; }
  @media print {
    body { padding: 4px 6px; }
    @page { margin: 0; size: 80mm auto; }
  }
</style></head><body>

<!-- CABEÇALHO -->
<div class="center">
  <div class="logo">PEDI<span class="logo-red">WAY</span></div>
  <div class="empresa">${estab?.nome || 'Estabelecimento'}</div>
  <div class="info-sm">
    ${estab?.endereco ? estab.endereco + '<br>' : ''}
    ${estab?.telefone_contato ? 'Tel: ' + estab.telefone_contato + '<br>' : ''}
    ${cnpjFmt ? 'CNPJ: ' + cnpjFmt : ''}
  </div>
</div>

<hr class="sep-thick">

<div class="mesa-bloco">
  <div class="mesa-lbl">Mesa</div>
  <div class="mesa-num">${_mesaAtual.replace('Mesa ','')}</div>
</div>
<div class="hora">${agora}</div>

<hr class="sep-dash">

<!-- PEDIDOS POR PESSOA -->
${Object.entries(grupos).map(([nm, gpeds]) => {   const sub = gpeds.reduce((s,p) => s + Number(p.total||0), 0);   const inicial = nm.charAt(0).toUpperCase();   const itensRows = gpeds.map(p => {     const itens = Array.isArray(p.itens) ? p.itens : [];     return itens.map(i =>       '<div class="item">         <span class="item-nome">'+(i.qtd||1)+'x '+(i.nome)+'</span>         <span class="item-val">R$ '+(((i.preco||0)*(i.qtd||1)).toFixed(2).replace('.',','))+'</span>       </div>'     ).join('');   }).join('');   return '<div class="pessoa-bloco">     <div class="pessoa-nome">       <div class="pessoa-avatar">'+(inicial)+'</div>       <span class="pessoa-label">'+(nm)+'</span>     </div>     '+(itensRows)+'     <div class="pessoa-sub">'+(fmtR(sub))+'</div>   </div>'; }).join('')}

${linhaTaxa}

<div class="total-row">
  <span>TOTAL</span>
  <span class="total-val">${fmtR(total)}</span>
</div>

${insta ? '<hr class="sep-dash"><div class="social">Instagram: <b>'+(insta)+'</b></div>' : ''}
${estab?.site ? '<div class="social">'+(estab.site)+'</div>' : ''}

<hr class="sep-dash">
<div class="msg-final">${msgFim}</div>
<div class="rodape">PEDIWAY · Plataforma de delivery independente</div>

</body></html>`;

  const w = window.open('','_blank','width=340,height=750');
  if (!w) { alert('Permita pop-ups para imprimir.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 600);
};


// ═══════════════════════════════════════════════════════════════════════════════
// GRUPOS DE ADICIONAIS — SISTEMA SEPARADO
// ═══════════════════════════════════════════════════════════════════════════════
let _gruposAdicionais = [];  // grupos do estabelecimento
let _produtosCache    = [];  // produtos para vincular
let _grupoEditando    = null; // grupo em edição (null = novo)
let _opcoesTmp        = [];  // opções do grupo sendo editado

// ── Abre gerenciador de grupos ──────────────────────────────────────────────────
window.abrirGerenciadorAdicionais = async function() {
  document.getElementById('modal-gerenciador-add').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  await carregarGruposAdicionais();
};

window.fecharGerenciadorAdicionais = function() {
  document.getElementById('modal-gerenciador-add').style.display = 'none';
  document.body.style.overflow = '';
};

async function carregarGruposAdicionais() {
  const estab = getEstab(); if (!estab) return;
  const el = document.getElementById('ger-add-lista'); if (!el) return;

  const { data: grupos } = await getSupa()
    .from('grupos_adicionais')
    .select('*')
    .eq('estabelecimento_id', estab.id)
    .order('created_at', { ascending: true });

  _gruposAdicionais = grupos || [];

  const { data: prods } = await getSupa()
    .from('produtos').select('id, nome, emoji, grupo_adicional_id')
    .eq('estabelecimento_id', estab.id);
  _produtosCache = prods || [];

  if (!_gruposAdicionais.length) {
    el.innerHTML = `<div style="text-align:center;padding:40px 20px;color:#aaa">
      <div style="font-size:2rem;margin-bottom:10px">🧩</div>
      <div style="font-size:.88rem;font-weight:600;margin-bottom:4px">Nenhum grupo criado</div>
      <div style="font-size:.78rem">Crie grupos como "Complementos Açaí" e vincule aos produtos</div>
    </div>`;
    return;
  }

  el.innerHTML = _gruposAdicionais.map(g => {
    const prodsV = _produtosCache.filter(p => p.grupo_adicional_id === g.id);
    const opcStr = (g.opcoes||[]).slice(0,3).map(o=>o.nome).join(', ') + ((g.opcoes||[]).length>3?'…':'');
    const prodsHtml = prodsV.length
      ? prodsV.map(p=>`<span style="background:#f0e9e0;padding:2px 8px;border-radius:50px;font-size:.68rem;font-weight:600">${p.emoji||'🍽️'} ${p.nome}</span>`).join('')
      : '<span style="font-size:.68rem;color:#ccc">Nenhum produto vinculado</span>';
    return `<div style="border:1.5px solid #e0dbd5;border-radius:14px;padding:14px;margin-bottom:10px;background:#fff">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
        <div>
          <div style="font-size:.92rem;font-weight:800">${g.nome}</div>
          <div style="font-size:.68rem;color:#aaa;margin-top:2px">Mín. ${g.min} · Máx. ${g.max} · ${(g.opcoes||[]).length} opções</div>
          <div style="font-size:.72rem;color:#888;margin-top:2px">${opcStr}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="editarGrupoAdicional('${g.id}')" style="padding:6px 10px;border:1.5px solid #e0dbd5;background:#fff;border-radius:8px;font-size:.72rem;font-weight:600;cursor:pointer">✏️ Editar</button>
          <button onclick="deletarGrupoAdicional('${g.id}')" style="padding:6px 10px;border:1.5px solid #fee2e2;background:#fff;border-radius:8px;font-size:.72rem;font-weight:600;cursor:pointer;color:#ef4444">🗑️</button>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">${prodsHtml}</div>
    </div>`;
  }).join('');
}


// ── Criar/Editar grupo ─────────────────────────────────────────────────────────
window.criarNovoGrupoAdicional = function() {
  _grupoEditando = null;
  _opcoesTmp = [{ nome: '', preco: 0 }, { nome: '', preco: 0 }];
  document.getElementById('eger-titulo').textContent = 'Novo grupo de adicionais';
  document.getElementById('eger-nome').value = '';
  document.getElementById('eger-min').value  = '0';
  document.getElementById('eger-max').value  = '3';
  renderOpcoesTmp();
  renderProdutosVincular(null);
  document.getElementById('modal-editar-grupo-add').style.display = 'flex';
};

window.editarGrupoAdicional = async function(id) {
  const g = _gruposAdicionais.find(x => x.id === id);
  if (!g) return;
  _grupoEditando = g;
  _opcoesTmp     = JSON.parse(JSON.stringify(g.opcoes || []));
  document.getElementById('eger-titulo').textContent = 'Editar — ' + g.nome;
  document.getElementById('eger-nome').value = g.nome;
  document.getElementById('eger-min').value  = g.min;
  document.getElementById('eger-max').value  = g.max;
  renderOpcoesTmp();
  renderProdutosVincular(id);
  document.getElementById('modal-editar-grupo-add').style.display = 'flex';
};

window.fecharEditarGrupoAdd = function() {
  document.getElementById('modal-editar-grupo-add').style.display = 'none';
  _grupoEditando = null; _opcoesTmp = [];
};


function renderOpcoesTmp() {
  const el = document.getElementById('eger-opcoes'); if (!el) return;
  el.innerHTML = _opcoesTmp.map((o, i) => `
    <div style="display:flex;gap:8px;align-items:center">
      <input value="${o.nome||''}" placeholder="Nome da opção (ex: Ninho)"
        oninput="syncOpcao(${i},'nome',this.value)"
        style="flex:2;border:1.5px solid var(--border);border-radius:9px;padding:9px 12px;font-family:Poppins,sans-serif;font-size:.85rem;outline:none">
      <input type="number" value="${o.preco||0}" placeholder="R$" step="0.50" min="0"
        oninput="syncOpcao(${i},'preco',parseFloat(this.value)||0)"
        style="width:72px;border:1.5px solid var(--border);border-radius:9px;padding:9px 8px;font-family:Poppins,sans-serif;font-size:.85rem;outline:none;text-align:right">
      <button onclick="rmOpcao(${i})" style="background:none;border:none;color:#ccc;cursor:pointer;font-size:1rem;padding:4px;flex-shrink:0">✕</button>
    </div>`).join('');
}


window.syncOpcao = function(i, campo, val) { if (_opcoesTmp[i]) _opcoesTmp[i][campo] = val; };
window.rmOpcao   = function(i) { _opcoesTmp.splice(i,1); renderOpcoesTmp(); };
window.addOpcaoGrupo = function() { _opcoesTmp.push({nome:'',preco:0}); renderOpcoesTmp(); };

function renderProdutosVincular(grupoId) {
  const el = document.getElementById('eger-produtos'); if (!el) return;
  if (!_produtosCache.length) { el.innerHTML = '<div style="color:#aaa;font-size:.8rem">Nenhum produto cadastrado</div>'; return; }
  el.innerHTML = _produtosCache.map(p => {
    const vinculado = p.grupo_adicional_id === grupoId;
    return '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid ' + (vinculado?'var(--red)':'#e0dbd5') + ';border-radius:10px;cursor:pointer;transition:all .15s;background:' + (vinculado?'#fff5f5':'#fff') + '">'
      + '<input type="checkbox" id="vp-' + p.id + '" ' + (vinculado?'checked':'') + ' style="accent-color:var(--red);width:18px;height:18px">'
      + '<span style="font-size:.88rem;font-weight:600">' + (p.emoji||'🍽️') + ' ' + p.nome + '</span>'
      + '</label>';
  }).join('');
}

window.salvarGrupoAdicional = async function() {
  const estab = getEstab(); if (!estab) return;
  const nome = document.getElementById('eger-nome')?.value?.trim();
  const min  = parseInt(document.getElementById('eger-min')?.value||'0');
  const max  = parseInt(document.getElementById('eger-max')?.value||'3');
  if (!nome) return showToast('Digite o nome do grupo.', 'error');

  const opcoes = _opcoesTmp.filter(o => o.nome?.trim());
  if (!opcoes.length) return showToast('Adicione pelo menos uma opção.', 'error');

  const btn = document.getElementById('btn-salvar-grupo');
  if (btn) { btn.disabled=true; btn.textContent='Salvando...'; }

  try {
    let grupoId;
    if (_grupoEditando) {
      const { error } = await getSupa().from('grupos_adicionais')
        .update({ nome, min, max, opcoes })
        .eq('id', _grupoEditando.id);
      if (error) throw error;
      grupoId = _grupoEditando.id;
    } else {
      const { data, error } = await getSupa().from('grupos_adicionais')
        .insert({ estabelecimento_id: estab.id, nome, min, max, opcoes })
        .select().single();
      if (error) throw error;
      grupoId = data.id;
    }

    // Atualiza vinculações dos produtos
    const checks = document.querySelectorAll('#eger-produtos input[type=checkbox]');
    for (const cb of checks) {
      const prodId  = cb.id.replace('vp-','');
      const marcado = cb.checked;
      const prod    = _produtosCache.find(p=>p.id===prodId);
      if (!prod) continue;
      const novoGrupo = marcado ? grupoId : (prod.grupo_adicional_id===grupoId ? null : prod.grupo_adicional_id);
      if (novoGrupo !== prod.grupo_adicional_id) {
        await getSupa().from('produtos').update({ grupo_adicional_id: novoGrupo }).eq('id', prodId);
      }
    }

    showToast('Grupo salvo! ✅');
    window.fecharEditarGrupoAdd();
    await carregarGruposAdicionais();
    _cardapioCache = null; // limpa cache para recarregar adicionais

  } catch(e) {
    showToast('Erro: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled=false; btn.textContent='Salvar grupo'; }
  }
};

window.deletarGrupoAdicional = async function(id) {
  if (!confirm('Remover este grupo? Os produtos vinculados perderão os adicionais.')) return;
  await getSupa().from('grupos_adicionais').delete().eq('id', id);
  showToast('Grupo removido.');
  await carregarGruposAdicionais();
  _cardapioCache = null;
};


// ── Handler de clique em item do cardápio da comanda ─────────────────────────
window.tcmdItem = function(el) {
  // Na comanda do garçom, sempre adiciona direto sem modal de adicionais
  const item    = el.closest ? el.closest('[data-mesa]') : el;
  if (!item) return;

  const mesaKey = item.dataset.mesa;
  const pid     = item.dataset.pid;
  const nome    = item.dataset.nome;
  const preco   = parseFloat(item.dataset.preco);
  const emoji   = item.dataset.emoji || '🍽️';
  const setor   = item.dataset.setor || null;

  if (!mesaKey || !pid) return;
  addItemComanda(mesaKey, pid, nome, preco, emoji, setor);
};

function abrirAdicionaisGrupo(mesaKey, prodId, nome, preco, emoji, grupo) {
  _adicionalMesaKey = mesaKey;
  _adicionalProduto = { id: prodId, nome, preco, emoji, adicionais: [grupo] };
  _adicionalSel     = {};

  document.getElementById('adicionais-nome').textContent       = nome;
  document.getElementById('adicionais-preco-base').textContent = 'R$ ' + Number(preco).toFixed(2).replace('.',',');

  const el = document.getElementById('adicionais-grupos'); if (!el) return;
  const maxTxt = grupo.max === 1 ? 'Escolha 1' : grupo.min > 0 ? 'Mín. '+grupo.min+', Máx. '+grupo.max : 'Até '+grupo.max;
  el.innerHTML = '<div class="adicional-grupo">'
    + '<div class="adicional-grupo-titulo">' + grupo.nome + (grupo.min > 0 ? ' <span style="color:var(--red);font-size:.65rem">*obrigatório</span>' : '') + '</div>'
    + '<div class="adicional-grupo-desc">' + maxTxt + '</div>'
    + (grupo.opcoes||[]).map((o, oi) =>
        '<div class="adicional-opt" id="aopt-0-' + oi + '" onclick="toggleAdicional(0,' + oi + ',' + grupo.max + ')">'
        + '<div class="adicional-opt-left"><div class="adicional-opt-check">✓</div><span class="adicional-opt-nome">' + o.nome + '</span></div>'
        + '<span class="adicional-opt-preco">' + (Number(o.preco||0)>0 ? '+R$ '+Number(o.preco).toFixed(2).replace('.',',') : 'Grátis') + '</span>'
        + '</div>'
      ).join('')
    + '<div class="adicional-limite-aviso" id="aviso-0">Limite de ' + grupo.max + ' opções</div>'
    + '</div>';

  calcTotalAdicionais();
  document.getElementById('modal-adicionais')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}


window.copiarLinkKDS = function() {
  const estab = getEstab();
  if (!estab) return;
  const slug = estab.slug || estab.id;
  const url = 'https://pediway.com.br/kds/' + slug;
  navigator.clipboard.writeText(url).catch(function() {
    const el = document.createElement('textarea');
    el.value = url; document.body.appendChild(el);
    el.select(); document.execCommand('copy'); document.body.removeChild(el);
  });
  showToast('✅ Link KDS copiado!');
};

window.abrirKDS = function() {
  const estab = getEstab();
  if (!estab) return;
  const slug = estab.slug || estab.id;
  // Passa ?loja= para auto-conectar sem precisar da tela de configuração manual
  // Evita que alguém adivinhe o slug de outro restaurante na tela de setup
  window.open('https://pediway.com.br/kds/geral?loja=' + slug, '_blank');
};

window.copiarLinkGarcom = function() {
  const estab = getEstab(); if (!estab) return;
  const url = `${BASE_URL}/comandas/${estab.slug}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link copiado! ✅');
  }).catch(() => {
    // fallback
    const el = document.createElement('input');
    el.value = url;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast('Link copiado! ✅');
  });
};


// ── Histórico de pedidos das mesas (aba Comandas) ────────────────────────────
// Chamável pelo botão de atualizar no HTML
window.renderHistoricoMesas = async function() {
  const estab = getEstab(); if (!estab) return;
  const lista = document.getElementById('mesas-historico-lista');
  if (!lista) return;

  // Usa 30h atrás para cobrir timezone Brasil (UTC-3) + pedidos da madrugada
  const desde = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
  const { data } = await getSupa().from('pedidos').select('*')
    .eq('estabelecimento_id', estab.id)
    .ilike('endereco', 'No local%')
    .neq('status', 'recusado')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(500);

  if (!data?.length) {
    lista.innerHTML = '<div style="color:#aaa;font-size:.82rem;text-align:center;padding:32px">Nenhum pedido de mesa hoje</div>';
    return;
  }

  const fmtR = v => 'R$ ' + Number(v||0).toFixed(2).replace('.',',');
  const stCor = { novo:'#f59e0b', preparo:'#3b82f6', pronto:'#22c55e' };
  const stLbl = { novo:'⏳ Aguardando', preparo:'✅ Na cozinha', pronto:'✅ Pronto' };

  // Agrupa por mesa
  const porMesa = {};
  data.forEach(p => {
    const parts = (p.endereco||'').split('—');
    const mesa  = !(parts.length < 2) ? parts[1].trim().split('·')[0].trim() : 'Mesa';
    if (!porMesa[mesa]) porMesa[mesa] = [];
    porMesa[mesa].push(p);
  });

  lista.innerHTML = Object.entries(porMesa).map(([mesa, peds]) => {
    const num       = mesa.replace('Mesa ','');
    const ativos    = peds.filter(p => ['novo','preparo','pronto'].includes(p.status));
    const finalizados = peds.filter(p => p.status === 'finalizado');
    // Total real: soma todos os pedidos da sessão ativa (ativos + finalizados desta sessão)
    // Usa pedidos ativos para o total em aberto
    const temAtivo  = ativos.length > 0;
    // Total em aberto (mesas ativas) ou total da sessão completa (mesas encerradas)
    const totalAtivos = ativos.reduce((s,p) => s+Number(p.total||0), 0);
    const totalFechados = finalizados.reduce((s,p) => s+Number(p.total||0), 0);
    const totalMesa = temAtivo ? totalAtivos : totalFechados;
    const mesaId    = 'hmesa-' + mesa.replace(/\s/g,'');

    // Cards de pedidos ativos
    const ativosHtml = ativos.map(p => _cardPedidoMesa(p, mesa, fmtR, stCor, stLbl)).join('');

    // Cards de pedidos histórico (prontos)
    const histHtml = finalizados.length && !temAtivo ? `
      <div style="margin-top:10px">
        <button onclick="toggleHistMesa('${mesaId}-hist')" style="width:100%;display:flex;align-items:center;justify-content:between;gap:8px;background:#f5f0eb;border:1.5px dashed #d4c4b0;border-radius:8px;padding:8px 12px;font-family:'Poppins',sans-serif;font-size:.75rem;font-weight:700;color:#888;cursor:pointer">
          <span style="flex:1;text-align:left">📋 Histórico de pedidos (${finalizados.length})</span>
          <span id="${mesaId}-hist-arrow">▼</span>
        </button>
        <div id="${mesaId}-hist" style="display:none;margin-top:8px">
          ${finalizados.map(p => _cardPedidoMesa(p, mesa, fmtR, stCor, stLbl)).join('')}
        </div>
      </div>` : '';

    // Conteúdo expandível
    const conteudo = `
      <div id="${mesaId}" style="display:none;padding:10px 0 4px">
        ${ativosHtml || '<div style="color:#aaa;font-size:.8rem;padding:8px 0">Nenhum pedido ativo</div>'}
        ${histHtml}
      </div>`;

    return `<div style="margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:10px;padding:13px 16px;background:#fff;border:1.5px solid ${temAtivo?'#16a34a':'#e0dbd5'};border-radius:12px;cursor:pointer" onclick="togglePedidosMesa('${mesaId}')">
        <div style="width:42px;height:42px;border-radius:10px;background:${temAtivo?'#16a34a':'#e0dbd5'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:900;flex-shrink:0">${num}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:.95rem;font-weight:800">${mesa}</div>
          <div style="font-size:.72rem;margin-top:1px">
            <span style="color:#888">${peds.length} pedido${peds.length!==1?'s':''}</span>
            ${temAtivo               ? '<span style="color:var(--red);font-weight:700;margin-left:6px">● ativa</span>'               : '<span style="color:#22c55e;font-weight:700;margin-left:6px">✓ encerrada</span>'}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:.88rem;font-weight:800;color:var(--red)">${temAtivo ? fmtR(totalMesa) : 'R$ 0,00'}</div>
          <button id="${mesaId}-btn" style="margin-top:4px;background:none;border:1.5px solid var(--border);border-radius:8px;padding:5px 12px;font-family:'Poppins',sans-serif;font-size:.72rem;font-weight:700;color:#555;cursor:pointer;white-space:nowrap">Ver pedidos ▼</button>
        </div>
      </div>
      <div style="padding:0 6px">
        ${conteudo}
      </div>
    </div>`;
  }).join('');
};

// Função auxiliar — card de pedido individual
function _cardPedidoMesa(p, mesa, fmtR, stCor, stLbl) {
  const itens   = Array.isArray(p.itens) ? p.itens : [];
  const dt      = new Date(p.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const nome    = (p.cliente_nome && p.cliente_nome !== mesa) ? p.cliente_nome : '';
  const garcom  = p.cliente_whats && !p.cliente_whats.includes('@') && !p.cliente_whats.match(/^\d+$/) ? p.cliente_whats : '';
  const enviado = getEnviadosCozinha().has(p.id);

  // Cor da borda: vermelho = não foi pra cozinha, verde = foi pra cozinha, cinza = pronto/outro
  const bordaCor = p.status === 'pronto' ? '#aaa'
    : enviado ? '#16a34a'
    : '#C0392B';

  // Badge de status — destaque visual forte
  const stBadge = {
    novo:         { bg:'#fef3c7', cor:'#92400e', icon:'🔔', txt:'Aguardando' },
    saiu_entrega: { bg:'#dbeafe', cor:'#1e40af', icon:'🚚', txt:'Saiu p/ entrega' },
    preparo: { bg:'#f0fdf4', cor:'#16a34a', icon:'✅', txt:'Na cozinha' },
    pronto:  { bg:'#dcfce7', cor:'#15803d', icon:'✅', txt:'Pronto'     },
  }[p.status] || { bg:'#f3f4f6', cor:'#555', icon:'', txt: p.status };

  return `<div style="background:#fff;border:1.5px solid #f0e9e0;border-left:5px solid ${bordaCor};border-radius:10px;padding:12px;margin-bottom:8px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px">
      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
        ${nome ? '<span style="background:#f0e9e0;padding:3px 10px;border-radius:50px;font-size:.78rem;font-weight:700;color:#555">'+(nome)+'</span>' : ''}
        ${garcom ? '<span style="background:#e8f5e9;padding:3px 10px;border-radius:50px;font-size:.72rem;font-weight:700;color:#2e7d32">👤 '+garcom+'</span>' : ''}
        <span style="font-size:.68rem;color:#aaa">#${p.id.slice(-4).toUpperCase()} · ${dt}</span>
      </div>
      <!-- Status badge bem destacado -->
      <span style="display:inline-flex;align-items:center;gap:4px;background:${stBadge.bg};color:${stBadge.cor};padding:5px 12px;border-radius:50px;font-size:.75rem;font-weight:800;flex-shrink:0;white-space:nowrap;letter-spacing:.01em">
        ${stBadge.icon} ${stBadge.txt}
      </span>
    </div>

    <!-- Indicador cozinha: só mostra se ainda não foi para cozinha -->
    ${p.status === 'novo' ? '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:5px 10px;border-radius:8px;background:#fff5f5;border:1px solid #fecaca"><span>⏳</span><span style="font-size:.72rem;font-weight:700;color:#C0392B">Aguardando envio para cozinha</span></div>' : (p.status==='preparo'?'<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:5px 10px;border-radius:8px;background:#f0fdf4;border:1px solid #bbf7d0"><span>🍳</span><span style="font-size:.72rem;font-weight:700;color:#15803d">Na cozinha</span></div>':'')}

    <!-- Itens -->
    <div style="background:#faf8f5;border-radius:8px;padding:8px 10px;margin-bottom:10px">
      ${itens.map(i=>'<div style="display:flex;justify-content:space-between;font-size:.83rem;padding:2px 0"><span style="font-weight:600">'+(i.qtd||1)+'x '+(i.nome)+'</span><span style="color:#888">R$ '+(((i.preco||0)*(i.qtd||1)).toFixed(2).replace('.',','))+'</span></div>').join('')}
      <div style="text-align:right;font-size:.9rem;font-weight:800;color:var(--red);margin-top:6px;border-top:1px solid #f0e9e0;padding-top:6px">${fmtR(p.total)}</div>
    </div>

    <!-- Ações -->
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${p.status==='novo' ? '<button class="btn-ped-aceitar" style="padding:7px 12px;font-size:.75rem" onclick="aceitarPedido('+p.id+')">Aceitar</button>       <button class="btn-ped-recusar" style="padding:7px 10px;font-size:.75rem" onclick="recusarPedido('+p.id+')">Recusar</button>' : ''}
      ${p.status==='novo' ? '<button class="btn-ped-imprimir" style="font-size:.75rem;background:#fff5f5;border:1.5px solid #C0392B;color:#C0392B;font-weight:700" onclick="imprimirCozinha('+p.id+')">🖨️ Enviar cozinha</button>' : ''}
      <button class="btn-ped-imprimir" style="font-size:.75rem" onclick="verPedido('${p.id}')">Ver mais</button>
    </div>
  </div>`;
}

// Expande/colapsa lista de pedidos de uma mesa
window.togglePedidosMesa = function(id) {
  const el   = document.getElementById(id);
  const btn  = document.getElementById(id + '-btn');
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display  = open ? 'none' : 'block';
  if (btn) btn.innerHTML = open ? 'Ver pedidos ▼' : 'Ocultar ▲';
};

// Expande/colapsa histórico (prontos) de uma mesa
window.toggleHistMesa = function(id) {
  const el  = document.getElementById(id);
  const arr = document.getElementById(id + '-arrow');
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  if (arr) arr.textContent = open ? '▼' : '▲';
};





// ── Controle de "enviado para cozinha" ──────────────────────────────────────
const _COZINHA_KEY = 'pw_enviados_cozinha';

function getEnviadosCozinha() {
  try { return new Set(JSON.parse(localStorage.getItem(_COZINHA_KEY)||'[]')); }
  catch(e) { return new Set(); }
}

function marcarEnviadoCozinha(pedidoId) {
  const set = getEnviadosCozinha();
  set.add(pedidoId);
  // Limpa IDs antigos (mais de 24h) — mantém localStorage limpo
  localStorage.setItem(_COZINHA_KEY, JSON.stringify([...set]));
}

// ── Imprimir ticket de cozinha (pedido individual) ────────────────────────────
// ═══════════════════════════════════════════════════════════════
// ESC/POS Dashboard — Impressão térmica com corte por setor
// ═══════════════════════════════════════════════════════════════
var _SETOR_EM_DASH = {cozinha:'🍔',bar:'🥤',sobremesa:'🍰',cafeteria:'☕',grill:'🔥',padaria:'🥖',pizza:'🍕',sushi:'🍣',caixa:'🏦',geral:'📋'};
var _SETOR_ORDEM   = ['cozinha','grill','pizza','padaria','sobremesa','cafeteria','bar','caixa','geral'];

// ESC/POS bytes
var _EP = {
  INIT:        [0x1B,0x40],
  BOLD_ON:     [0x1B,0x45,0x01], BOLD_OFF:  [0x1B,0x45,0x00],
  CENTER:      [0x1B,0x61,0x01], LEFT:      [0x1B,0x61,0x00],
  DBL_BOTH:    [0x1B,0x21,0x30], NORMAL:    [0x1B,0x21,0x00],
  CUT_PARTIAL: [0x1D,0x56,0x01], CUT_TOTAL: [0x1D,0x56,0x00],
  CUT_BEMA:    [0x1D,0x56,0x41,0x05],
  FEED: function(n){return[0x1B,0x64,n];}, LF:[0x0A],
};
function _epStr(s){var b=[];for(var i=0;i<s.length;i++){var c=s.charCodeAt(i);b.push(c>255?63:c);}return b;}
function _epLine(ch,n){return _epStr((ch||'=').repeat(n||32)+'\n');}
function _epCenter(s,w){var pad=Math.max(0,Math.floor((w-s.length)/2));return _epStr(' '.repeat(pad)+s+'\n');}

var _dashSerialPort=null;
async function _getDashSerial(){
  if(!navigator.serial)return null;
  try{if(_dashSerialPort&&_dashSerialPort.readable)return _dashSerialPort;_dashSerialPort=await navigator.serial.requestPort();await _dashSerialPort.open({baudRate:9600});return _dashSerialPort;}
  catch(e){return null;}
}
async function _sendEscPos(blocos,isBema){
  var port=await _getDashSerial();if(!port)return false;
  try{
    var writer=port.writable.getWriter();
    var cut=isBema?_EP.CUT_BEMA:_EP.CUT_PARTIAL;
    for(var i=0;i<blocos.length;i++){
      await writer.write(new Uint8Array(blocos[i]));
      if(i<blocos.length-1)await writer.write(new Uint8Array(cut));
    }
    await writer.write(new Uint8Array([..._EP.FEED(5),...(isBema?_EP.CUT_BEMA:_EP.CUT_TOTAL)]));
    writer.releaseLock();return true;
  }catch(e){return false;}
}

function _buildSetorBytes(pedNum,setor,itens,obs,nomeEstab,isFirst){
  var b=[],push=function(){for(var a=0;a<arguments.length;a++){var x=arguments[a];if(Array.isArray(x))for(var j=0;j<x.length;j++)b.push(x[j]);else{var s=_epStr(String(x));for(var j=0;j<s.length;j++)b.push(s[j]);}}};
  if(isFirst)push(_EP.INIT);
  push(_EP.CENTER,_EP.BOLD_ON,_EP.DBL_BOTH);push('PEDIDO #'+pedNum+'\n');
  push(_EP.NORMAL,_EP.BOLD_ON);push(_epCenter(setor.toUpperCase(),32));push(_EP.BOLD_OFF,_EP.LEFT);
  push(_epLine('='));
  itens.forEach(function(it){var q=Math.max(1,parseInt(it.qtd)||1);push(_EP.BOLD_ON);push(q+'x '+String(it.nome||'').slice(0,26)+'\n');push(_EP.BOLD_OFF);if(it.obs)push('   -> '+String(it.obs).slice(0,26)+'\n');});
  if(obs){push(_epLine('-'));push(_EP.BOLD_ON);push('OBS: '+String(obs).slice(0,58)+'\n');push(_EP.BOLD_OFF);}
  push(_epLine('='));push(_EP.FEED(3));
  return b;
}

function _buildSetorHTML(pedNum,setor,itens,obs){
  var em=_SETOR_EM_DASH[setor.toLowerCase()]||'🏷️';
  var rows=itens.map(function(it){
    var q=Math.max(1,parseInt(it.qtd)||1);
    var adds=Array.isArray(it.adicionais)&&it.adicionais.length?it.adicionais.map(function(a){return'<div class="adicional">+ '+a.nome+'</div>';}).join(''):'';
    return'<div class="item"><span class="item-qtd">'+q+'x</span><span class="item-nome">'+it.nome+'</span></div>'+adds+(it.obs?'<div class="adicional obs-item">↳ '+it.obs+'</div>':'');
  }).join('');
  return'<div class="setor-bloco">'
    +'<div class="setor-hdr"><div class="s-num">'+pedNum+'</div><div class="s-nome">'+em+' '+setor.toUpperCase()+'</div></div>'
    +'<div class="s-itens">'+rows+'</div>'
    +(obs?'<div class="obs-box">⚠️ OBS: '+obs+'</div>':'')
    +'</div>';
}

function _agruparSetores(itens){
  var g={};
  itens.forEach(function(it){var s=(it.setor||'geral').toLowerCase();if(!g[s])g[s]=[];g[s].push(it);});
  return g;
}
function _ordenarSetores(setores){
  return setores.sort(function(a,b){var ia=_SETOR_ORDEM.indexOf(a),ib=_SETOR_ORDEM.indexOf(b);return(ia<0?99:ia)-(ib<0?99:ib);});
}

// CSS compartilhado para ticket
var _CSS_TICKET = '<style>*{margin:0;padding:0;box-sizing:border-box}'
  +'body{font-family:Arial,sans-serif;font-size:13px;color:#000;background:#fff;width:80mm;margin:0 auto;padding:10px}'
  +'.center{text-align:center}.logo{font-size:18px;font-weight:900;letter-spacing:.06em}.logo-red{color:#C0392B}'
  +'.empresa{font-size:12px;font-weight:700;margin-top:2px}.tag{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-top:2px}'
  +'.sep-dash{border:none;border-top:1px dashed #888;margin:8px 0}.sep-thick{border:none;border-top:3px solid #000;margin:8px 0}'
  +'.setor-bloco{margin-bottom:0}'
  +'.setor-hdr{border:3px solid #000;padding:8px 6px;text-align:center;margin:6px 0}'
  +'.s-num{font-size:14px;font-weight:900;letter-spacing:.04em}'
  +'.s-nome{font-size:20px;font-weight:900;letter-spacing:.06em;margin-top:4px}'
  +'.s-itens{padding:4px 0}'
  +'.item{display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-bottom:1px dotted #ddd}'
  +'.item-qtd{font-size:16px;font-weight:900;color:#C0392B;flex-shrink:0;min-width:24px}'
  +'.item-nome{font-size:13px;font-weight:700;flex:1;line-height:1.3}'
  +'.adicional{font-size:11px;color:#555;padding:1px 0 2px 32px}'
  +'.obs-item{color:#e65c00;font-style:italic}'
  +'.obs-box{border:2px solid #C0392B;border-radius:4px;padding:6px 8px;margin:6px 0;font-size:12px;font-weight:700;color:#C0392B}'
  +'.corte{border-top:2px dashed #aaa;margin:10px 0;text-align:center;position:relative}'
  +'.corte-txt{font-size:9px;font-weight:700;color:#aaa;letter-spacing:.1em;background:#fff;padding:0 6px;display:inline-block;margin-top:-7px}'
  +'.mesa-bloco{background:#000;color:#fff;border-radius:6px;padding:10px 8px 8px;text-align:center;margin:6px 0}'
  +'.mesa-lbl{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa}'
  +'.mesa-num{font-size:42px;font-weight:900;line-height:1.1}'
  +'.hora{font-size:11px;color:#888;text-align:center;margin-bottom:4px}'
  +'.rodape{font-size:9px;color:#bbb;text-align:center;margin-top:8px;letter-spacing:.04em}'
  +'@media print{body{padding:2px;width:100%}.corte{page-break-after:always}@page{margin:0;size:80mm auto}}'
  +'</style>';

// Imprime pedido separado por setor (browser HTML + ESC/POS se disponível)
async function imprimirPorSetor(p, loja) {
  var itens = Array.isArray(p.itens)?p.itens:[];
  var pedNum = '#'+p.id.slice(-6).toUpperCase();
  var grupos = _agruparSetores(itens);
  var setores = _ordenarSetores(Object.keys(grupos));
  var obs = p.observacao||'';
  var parts = (p.endereco||'').split('—');
  var isMesa = (p.endereco||'').startsWith('No local');
  var mesa = !(parts.length<2)?parts[1].trim().split('·')[0].trim():p.endereco||'';
  var dt = new Date(p.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});

  var cabecalhoHTML = '<div class="center">'
    +'<div class="logo">PEDI<span class="logo-red">WAY</span></div>'
    +'<div class="empresa">'+loja+'</div>'
    +'<div class="tag">Ticket de Cozinha</div></div>'
    +'<hr class="sep-thick">'
    +(isMesa?'<div class="mesa-bloco"><div class="mesa-lbl">Mesa</div><div class="mesa-num">'+mesa.replace('Mesa ','')+'</div>'+(p.cliente_nome?'<div style="font-size:13px;font-weight:700;color:#ddd;margin-top:2px">'+p.cliente_nome+'</div>':'')+'</div>'
            :'<div style="border:2px solid #000;border-radius:6px;padding:8px;text-align:center;margin:6px 0"><div style="font-size:14px;font-weight:900">DELIVERY / RETIRADA</div>'+(p.cliente_nome?'<div style="font-size:14px;font-weight:700;margin-top:3px">'+p.cliente_nome+'</div>':'')+(p.endereco?'<div style="font-size:11px;color:#444;margin-top:2px">'+p.endereco+'</div>':'')+'</div>')
    +'<div class="hora">'+pedNum+' &nbsp;·&nbsp; '+dt+'</div>'
    +'<hr class="sep-dash">';

  // Tenta ESC/POS
  if(navigator.serial && _dashSerialPort) {
    var blocos = setores.map(function(s,i){return _buildSetorBytes(pedNum,s,grupos[s],obs,loja,i===0);});
    var ok = await _sendEscPos(blocos);
    if(ok) return;
  }

  // Fallback HTML
  var blocosHTML;
  if(!(setores.length>1) && (setores[0]==='geral'||!setores[0])) {
    // Sem setores: impressão normal com HTML melhorado
    var rows = itens.map(function(it){
      var q=Math.max(1,parseInt(it.qtd)||1);
      var adds=Array.isArray(it.adicionais)&&it.adicionais.length?it.adicionais.map(function(a){return'<div class="adicional">+ '+a.nome+'</div>';}).join(''):'';
      return'<div class="item"><span class="item-qtd">'+q+'x</span><span class="item-nome">'+it.nome+'</span></div>'+adds+(it.obs?'<div class="adicional obs-item">↳ '+it.obs+'</div>':'');
    }).join('');
    blocosHTML = '<div class="s-itens">'+rows+'</div>'+(obs?'<div class="obs-box">⚠️ OBS: '+obs+'</div>':'');
  } else {
    // Multi-setor com separadores de corte
    blocosHTML = setores.map(function(s,i){
      return _buildSetorHTML(pedNum,s,grupos[s],obs)
        +(i<setores.length-1?'<div class="corte"><span class="corte-txt">✂ CORTE PARCIAL</span></div>':'');
    }).join('');
  }

  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+pedNum+'</title>'+_CSS_TICKET+'</head><body>'+cabecalhoHTML+blocosHTML+'<div class="rodape">PEDIWAY &mdash; Sistema de Gestão</div></body></html>';
  var w=window.open('','_blank','width=340,height=700');
  if(!w){alert('Permita pop-ups.');return;}
  w.document.write(html);w.document.close();w.focus();setTimeout(function(){w.print();},500);
}

window.imprimirCozinha = function(pedidoId) {
  getSupa().from('pedidos').select('*').eq('id', pedidoId).maybeSingle().then(async function({ data: p }) {
    if (!p) return;
    const loja = getEstab()?.nome || 'Estabelecimento';
    await imprimirPorSetor(p, loja);
    marcarEnviadoCozinha(pedidoId);
    window.renderHistoricoMesas();
  });
};


// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS GLOBAIS
// ─────────────────────────────────────────────────────────────────────────────
window.initDashboard     = initDashboard;
window.abrirModalItem    = abrirModalItem;
window.fecharModal       = fecharModal;
window.fecharModalFora   = fecharModalFora;
window.selecionarEmoji   = selecionarEmoji;
window.previewFotos      = previewFotos;
window.previewFoto       = previewFoto;
window.salvarItem        = salvarItem;
window.editarItem        = editarItem;
window.deletarItem       = deletarItem;
window.postarFresquinho  = postarFresquinho;
window.removerFresquinho = removerFresquinho;
window.renderPedidos     = renderPedidos;

// ── Financeiro do estabelecimento ─────────────────────────
window.setFinPeriodo = setFinPeriodo;
window.exportarCSV   = exportarCSV;
window.exportarPDF   = exportarPDF;

// ═══════════════════════════════════════════════════════════
// SISTEMA DE COMANDAS — MODO GARÇOM
// ═══════════════════════════════════════════════════════════
let _mesaAtual        = null;   // chave da mesa aberta "Mesa 3"
let _pedidosMesas     = {};     // { "Mesa 3": [{...pedido}] }
let _mesasFechadas    = new Set();
let _cardapioCache    = null;   // cache dos produtos para seleção rápida
let _carrinhoComanda  = {};     // { "Mesa 3": [{nome, preco, qtd, emoji}] }
let _nomeComanda      = {};     // { "Mesa 3": "João" }
let _pagamentoComanda = null;   // pagamento selecionado ao fechar comanda
let _taxaServicoRemovida = false; // true se o garçom removeu a taxa no fechamento

function getNumMesas() {
  const estab = getEstab();
  // Prioridade: 1) banco (num_mesas no estab) 2) localStorage 3) padrão 10
  const doLocalStorage = localStorage.getItem('pw_num_mesas_' + (estab?.id || ''));
  return parseInt(estab?.num_mesas || doLocalStorage || '10', 10);
}

window.salvarNumMesas = async function(val) {
  const estab = getEstab(); if (!estab) return;
  const n = Math.max(1, Math.min(200, parseInt(val) || 10));

  // Atualiza o estab em memória IMEDIATAMENTE para renderMesas() pegar o valor novo
  estab.num_mesas = n;
  window._estab = { ...window._estab, num_mesas: n };
  const stored = JSON.parse(localStorage.getItem('pw_estab') || '{}');
  localStorage.setItem('pw_estab', JSON.stringify({ ...stored, num_mesas: n }));
  localStorage.setItem('pw_num_mesas_' + estab.id, String(n));

  // Atualiza o input visualmente com o valor normalizado
  const inp = document.getElementById('cfg-num-mesas');
  if (inp) inp.value = n;

  // Re-renderiza imediatamente
  renderMesas();

  // Salva no banco em background (não bloqueia)
  getSupa().from('estabelecimentos').update({ num_mesas: n }).eq('id', estab.id)
    .then(({ error }) => {
      if (error) console.error('[mesas] erro ao salvar:', error);
      else showToast(`${n} mesas configuradas ✅`);
    });
};

async function carregarPedidosMesas() {
  const estab = getEstab(); if (!estab) return;
  const { data } = await getSupa()
    .from('pedidos')
    .select('*')
    .eq('estabelecimento_id', estab.id)
    .ilike('endereco', 'No local%')
    .in('status', ['novo', 'preparo', 'pronto'])  // inclui pronto (mesa ainda ocupada)
    .gte('created_at', new Date(Date.now() - 30*60*60*1000).toISOString())  // últimas 30h (cobre timezone BR)
    .order('created_at', { ascending: true });

  _pedidosMesas = {};
  (data || []).forEach(p => {
    const raw   = (p.endereco || '');
    const parts = raw.split('—');
    if (parts.length < 2) return;
    const mesa  = parts[1].trim().split('·')[0].trim();
    if (!_pedidosMesas[mesa]) _pedidosMesas[mesa] = [];
    _pedidosMesas[mesa].push(p);
  });
  renderMesas();
}

function renderMesas() {
  const grid = document.getElementById('mesas-grid'); if (!grid) return;
  const n    = getNumMesas();
  const inp  = document.getElementById('cfg-num-mesas');
  if (inp) inp.value = n;
  const fmt  = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');

  // Atualiza cards de resumo
  const allPeds   = Object.values(_pedidosMesas).flat();
  const mOcup     = Object.keys(_pedidosMesas).filter(k => _pedidosMesas[k].length > 0).length;
  const totalAb   = allPeds.reduce((s, p) => s + Number(p.total || 0), 0);
  const elOcup    = document.getElementById('mesas-ocupadas-count');
  const elPeds    = document.getElementById('mesas-pedidos-count');
  const elTotal   = document.getElementById('mesas-total-count');
  if (elOcup)  elOcup.textContent  = mOcup;
  if (elPeds)  elPeds.textContent  = allPeds.length;
  if (elTotal) elTotal.textContent = fmt(totalAb);

  // Pedidos novos aguardando nas mesas (área de destaque)
  const novosM     = allPeds.filter(p => p.status === 'novo');
  const wrapNovos  = document.getElementById('mesas-pedidos-novos-wrap');
  const listaNovos = document.getElementById('mesas-pedidos-novos-lista');
  const badgeNovos = document.getElementById('badge-mesas-novos');
  if (wrapNovos)  wrapNovos.style.display  = novosM.length ? 'block' : 'none';
  if (badgeNovos) badgeNovos.textContent   = novosM.length;
  if (listaNovos && novosM.length) {
    listaNovos.innerHTML = novosM.map(p => {
      const itens = Array.isArray(p.itens) ? p.itens.map(i => `${i.qtd}x ${i.nome}`).join(' · ') : '';
      const parts = (p.endereco||'').split('—');
      const mesa  = !(parts.length < 2) ? parts[1].trim().split('·')[0].trim() : p.endereco || 'Mesa';
      const nome  = p.cliente_nome && p.cliente_nome !== mesa ? p.cliente_nome : '';
      const numMesa = mesa.replace('Mesa ','');
      return `<div style="background:#fff;border:2px solid var(--red);border-radius:14px;padding:14px 12px;display:flex;flex-direction:column;gap:8px;min-height:160px">
        <!-- Número da mesa destaque -->
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="width:46px;height:46px;background:var(--red);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:900;color:#fff">${numMesa}</div>
          <span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:50px;font-size:.65rem;font-weight:800">NOVO</span>
        </div>
        <!-- Nome e itens -->
        <div style="flex:1">
          <div style="font-size:.92rem;font-weight:800;color:#1a1a1a">${mesa}${nome ? ` <span style="font-size:.72rem;color:#888;font-weight:500">${nome}</span>` : ''}</div>
          <div style="font-size:.72rem;color:#aaa;margin-top:3px;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${itens}</div>
        </div>
        <!-- Valor e ações -->
        <div style="border-top:1px solid #f0e9e0;padding-top:8px">
          <div style="font-size:1rem;font-weight:800;color:var(--red);margin-bottom:6px">${fmt(p.total)}</div>
          <div style="display:flex;gap:5px">
            <button class="btn-ped-aceitar" style="flex:1;padding:6px;font-size:.72rem" onclick="aceitarPedido('${p.id}')">✓ Aceitar</button>
            <button class="btn-ped-recusar" style="padding:6px 8px;font-size:.72rem" onclick="recusarPedido('${p.id}')">✕</button>
            <button class="btn-ped-imprimir" style="padding:6px 8px;font-size:.72rem" onclick="imprimirCozinha('${p.id}')">🖨️</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  grid.innerHTML = Array.from({ length: n }, (_, i) => {
    const num    = i + 1;
    const key    = 'Mesa ' + num;
    const peds   = _pedidosMesas[key] || [];
    const ativa  = peds.length > 0;
    const fechada= _mesasFechadas.has(key);
    const total  = peds.reduce((s, p) => s + Number(p.total || 0), 0);
    const qtdIt  = peds.reduce((s, p) => s + (Array.isArray(p.itens) ? p.itens.reduce((a, i) => a + (i.qtd || 1), 0) : 0), 0);

    let cls = 'vazia', dot = 'livre', info = '<span class="mesa-label">Livre</span>';
    if (fechada) {
      cls  = 'fechando'; dot = '';
      info = '<span class="mesa-label" style="color:var(--red)">✗ Fechada</span>';
    } else if (ativa) {
      cls  = 'ocupada'; dot = 'ocup';
      info = '<span class="mesa-total">' + fmt(total) + '</span><span class="mesa-qtd">' + peds.length + ' ped · ' + qtdIt + ' itens</span>';
    }

    return '<div class="mesa-card ' + cls + '" onclick="abrirComanda(' + num + ')">' +
      '<div class="mesa-status-dot ' + dot + '"></div>' +
      '<div class="mesa-num">' + num + '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:center;gap:3px">' + info + '</div>' +
      '</div>';
  }).join('');
}

// ── Carrega cardápio para seleção no modo garçom ──────────────────────────────
async function carregarCardapioComanda() {
  if (_cardapioCache) return _cardapioCache;
  const estab = getEstab(); if (!estab) return [];
  const { data } = await getSupa()
    .from('produtos').select('id,nome,preco,emoji,categoria,disponivel,grupo_adicional_id')
    .eq('estabelecimento_id', estab.id)
    .eq('disponivel', true)
    .order('categoria');
  
  // Enriquece com dados do grupo de adicionais
  if (data) {
    const grupoIds = [...new Set(data.filter(p=>p.grupo_adicional_id).map(p=>p.grupo_adicional_id))];
    if (grupoIds.length) {
      const { data: grupos } = await getSupa().from('grupos_adicionais').select('*').in('id', grupoIds);
      const grupoMap = {};
      (grupos||[]).forEach(g=>{ grupoMap[g.id]=g; });
      data.forEach(p=>{ if(p.grupo_adicional_id) p.adicionais_grupo = grupoMap[p.grupo_adicional_id]; });
    }
  }
  _cardapioCache = data || [];
  return _cardapioCache;
}

// ── Nome do cliente na mesa ──────────────────────────────────────────────────────
window.salvarNomeComanda = function(val) {
  if (_mesaAtual) _nomeComanda[_mesaAtual] = val.trim();
};

// ── Troca de tab dentro do modal ──────────────────────────────────────────────
window.switchComandaTab = function(tab) {
  // Normaliza aliases
  if (tab === 'pedidos' || tab === 'novo') tab = 'pedido';
  if (tab === 'historico' || tab === 'comanda') tab = 'hist';
  document.querySelectorAll('.ctab').forEach(b => b.classList.remove('ativo'));
  document.getElementById('ctab-' + tab)?.classList.add('ativo');
  document.getElementById('cpanel-pedido').style.display = tab === 'pedido' ? 'flex' : 'none';
  document.getElementById('cpanel-hist').style.display   = tab === 'hist'   ? 'flex' : 'none';
};

// ── Adiciona item ao carrinho da mesa ──────────────────────────────────────────
function addItemComanda(mesaKey, id, nome, preco, emoji, setor) {
  if (!_carrinhoComanda[mesaKey]) _carrinhoComanda[mesaKey] = [];
  const ex = _carrinhoComanda[mesaKey].find(x => x.id === id);
  if (ex) { ex.qtd++; } else { _carrinhoComanda[mesaKey].push({ id, nome, preco, emoji, setor: setor||null, qtd: 1 }); }
  renderCarrinhoComanda(mesaKey);
}
window.addItemComanda = addItemComanda;

function rmItemComanda(mesaKey, id) {
  if (!_carrinhoComanda[mesaKey]) return;
  const ex = _carrinhoComanda[mesaKey].find(x => x.id === id);
  if (!ex) return;
  if (ex.qtd > 1) { ex.qtd--; } else { _carrinhoComanda[mesaKey] = _carrinhoComanda[mesaKey].filter(x=>x.id!==id); }
  renderCarrinhoComanda(mesaKey);
}
window.rmItemComanda = rmItemComanda;

function renderCarrinhoComanda(mesaKey) {
  const carr = _carrinhoComanda[mesaKey] || [];
  const total = carr.reduce((s,i)=>s+i.preco*i.qtd, 0);
  const fmtR  = v=>'R$ '+Number(v).toFixed(2).replace('.',',');
  const el = document.getElementById('comanda-carrinho');
  const elTotal = document.getElementById('comanda-carr-total');
  const btnEnviar = document.getElementById('btn-enviar-comanda');
  if (!el) return;
  if (!carr.length) {
    el.innerHTML = '<div style="text-align:center;padding:12px 0;color:#ccc;font-size:.78rem">Nenhum item</div>';
    if (elTotal)   elTotal.textContent = 'R$ 0,00';
    if (btnEnviar) btnEnviar.disabled = true;
    return;
  }
  el.innerHTML = carr.map(i=>`
    <div class="carr-row">
      <span style="font-size:1.1rem;flex-shrink:0">${i.emoji||'🍽️'}</span>
      <span class="carr-nome">${i.nome}</span>
      <div class="carr-ctrl">
        <button class="carr-btn minus" onclick="rmItemComanda('${mesaKey}','${i.id}')">−</button>
        <span class="carr-qtd">${i.qtd}</span>
        <button class="carr-btn plus" onclick="addItemComanda('${mesaKey}','${i.id}','${i.nome.replace(/'/g,"\'")}',${i.preco},'${i.emoji||''}')">+</button>
      </div>
      <span class="carr-subtot">${fmtR(i.preco*i.qtd)}</span>
    </div>`).join('');
  if (elTotal)   elTotal.textContent = fmtR(total);
  if (btnEnviar) btnEnviar.disabled = false;
}

// ── Envia pedido da comanda para o banco ───────────────────────────────────────
window.enviarPedidoComanda = async function() {
  if (!_mesaAtual) return;
  const carr  = _carrinhoComanda[_mesaAtual] || [];
  if (!carr.length) return;
  const estab = getEstab(); if (!estab) return;
  const total = carr.reduce((s,i)=>s+i.preco*i.qtd, 0);
  const btn   = document.getElementById('btn-enviar-comanda');
  if (btn) { btn.disabled=true; btn.textContent='Enviando...'; }
  try {
    const nomeCliente = _nomeComanda[_mesaAtual] || _mesaAtual;
    const itens = carr.map(i=>({nome:i.nome,preco:i.preco,qtd:i.qtd,emoji:i.emoji,setor:i.setor||null}));

    // Pedido do dashboard já nasce aceito — operador está no caixa
    const { data: pedidoNovo, error } = await getSupa().from('pedidos').insert({
      estabelecimento_id: estab.id,
      cliente_nome:       nomeCliente,
      cliente_whats:      '',
      endereco:           'No local — ' + _mesaAtual,
      itens,
      total,
      status:             'preparo',
      pagamento:          'No local',
    }).select().maybeSingle();

    if (error) throw error;

    // Imprime ticket da cozinha automaticamente
    if (pedidoNovo) {
      try { await imprimirPorSetor(pedidoNovo, estab.nome || ''); } catch(e) {}
    }

    _carrinhoComanda[_mesaAtual] = [];
    showToast('✅ Pedido enviado e impresso!');
    renderCarrinhoComanda(_mesaAtual);
    await carregarPedidosMesas();
    renderPedidosComanda(_mesaAtual);

    // Muda para aba da Comanda para mostrar o que foi enviado
    window.switchComandaTab('hist');

  } catch(e) {
    showToast('Erro ao enviar: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled=false; btn.textContent='🍳 Enviar e imprimir'; }
  }
};

// ── Abre painel da mesa (mode garçom) ─────────────────────────────────────────
async function abrirComanda(num) {
  const key  = 'Mesa ' + num;
  _mesaAtual = key;
  if (!_carrinhoComanda[key]) _carrinhoComanda[key] = [];

  const modal = document.getElementById('modal-comanda');
  const title = document.getElementById('comanda-title');
  if (title) title.textContent = key;

  // Número grande da mesa
  const numEl = document.getElementById('comanda-num-mesa');
  if (numEl) numEl.textContent = num;

  // Carrega cardápio
  const prods = await carregarCardapioComanda();
  renderCardapioComanda(key, prods);
  renderPedidosComanda(key);
  renderCarrinhoComanda(key);

  // Preenche nome salvo
  const nomeInput = document.getElementById('comanda-nome-cliente');
  if (nomeInput) nomeInput.value = _nomeComanda[key] || '';

  // Sempre abre na tab "Novo pedido"
  window.switchComandaTab('pedido');

  if (modal) modal.classList.add('open');
}

function renderCardapioComanda(mesaKey, prods) {
  const el = document.getElementById('comanda-cardapio');
  if (!el) return;
  if (!prods.length) {
    el.innerHTML = '<div style="color:#aaa;font-size:.8rem;text-align:center;padding:24px">Nenhum produto disponível</div>';
    return;
  }
  const cats = {};
  prods.forEach(p => {
    const cat = p.categoria || 'Outros';
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(p);
  });

  el.innerHTML = Object.entries(cats).map(([cat, items]) => {
    const itemsHtml = items.map(p => {
      const nomeEnc  = p.nome.replace(/"/g, '&quot;');
      const precoFmt = Number(p.preco).toFixed(2).replace('.',',');
      return `<div class="cmd-item" onclick="tcmdItem(this)"
        data-pid="${p.id}"
        data-nome="${nomeEnc}"
        data-preco="${p.preco}"
        data-emoji="${p.emoji||'🍽️'}"
        data-setor="${p.setor||''}"
        data-mesa="${mesaKey}">
        <span class="cmd-item-emoji">${p.emoji||'🍽️'}</span>
        <span class="cmd-item-nome">${p.nome}</span>
        <span class="cmd-item-preco">R$ ${precoFmt}</span>
      </div>`;
    }).join('');
    return '<div style="margin-bottom:12px">'
      + '<div style="font-size:.6rem;font-weight:800;color:#aaa;text-transform:uppercase;letter-spacing:.08em;padding:8px 0 4px;border-bottom:1px solid #f0ebe4;margin-bottom:4px">' + cat + '</div>'
      + itemsHtml
      + '</div>';
  }).join('');
}

window.toggleComandaCat = function(catId) {
  if (!catId) return;
  var el = document.getElementById(catId);
  var arrow = document.getElementById('arrow-' + catId);
  if (!el) return;
  var aberto = el.style.display !== 'none';
  el.style.display = aberto ? 'none' : 'block';
  if (arrow) arrow.textContent = aberto ? '▶' : '▼';
};


function renderPedidosComanda(mesaKey) {
  const el   = document.getElementById('comanda-historico');
  const peds = _pedidosMesas[mesaKey] || [];
  const fmtR = v => 'R$ ' + Number(v||0).toFixed(2).replace('.',',');
  const stLbl = {novo:'⏳ Aguardando',preparo:'✅ Na cozinha',pronto:'✅ Pronto'};
  const stClr = {novo:'#f59e0b',preparo:'#3b82f6',pronto:'#22c55e'};

  const totalMesa = peds.reduce((s,p)=>s+Number(p.total||0),0);
  const elTotal = document.getElementById('comanda-total-geral');
  if (elTotal) elTotal.textContent = fmtR(totalMesa);

  if (!el) return;
  if (!peds.length) { el.innerHTML='<div style="color:#aaa;font-size:.8rem;text-align:center;padding:12px">Nenhum pedido lançado</div>'; return; }

  // Agrupa por nome do cliente
  const grupos = {};
  peds.forEach(p => {
    const nm = p.cliente_nome || 'Cliente';
    if (!grupos[nm]) grupos[nm] = [];
    grupos[nm].push(p);
  });

  el.innerHTML = Object.entries(grupos).map(([nome, gpeds]) => {
    const subtotal = gpeds.reduce((s,p)=>s+Number(p.total||0),0);
    const inicial  = nome.charAt(0).toUpperCase();
    const pedRows  = gpeds.map(p => {
      const itens = Array.isArray(p.itens) ? p.itens : [];
      const dt    = new Date(p.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      return '<div style="margin-bottom:6px;padding-bottom:6px;border-bottom:1px dashed #f0e9e0">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">'
        +'<span style="font-size:.65rem;color:#aaa">'+dt+'</span>'
        +'<span style="font-size:.65rem;font-weight:700;color:'+stClr[p.status]+'">'+(stLbl[p.status]||p.status)+'</span>'
        +'</div>'
        +itens.map(i=>'<div style="display:flex;justify-content:space-between;font-size:.82rem"><span>'+(i.qtd||1)+'x '+i.nome+'</span><span>R$ '+((i.preco||0)*(i.qtd||1)).toFixed(2).replace('.',',')+'</span></div>').join('')
        +'</div>';
    }).join('');

    return '<div style="border:1.5px solid #f0e9e0;border-radius:10px;padding:10px;margin-bottom:10px;background:#fff">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #f0e9e0">'
      +'<div style="width:32px;height:32px;border-radius:50%;background:var(--red);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.9rem;flex-shrink:0">'+inicial+'</div>'
      +'<span style="font-size:.92rem;font-weight:800;flex:1">'+nome+'</span>'
      +'<span style="font-size:.85rem;font-weight:800;color:var(--red)">'+fmtR(subtotal)+'</span>'
      +'</div>'
      +pedRows
      +'</div>';
  }).join('');
}

window.fecharComanda = function() {
  const modal = document.getElementById('modal-comanda');
  if (modal) modal.classList.remove('open');
  _mesaAtual = null;
};

async function confirmarFecharComanda() {
  if (!_mesaAtual) return;
  const peds  = _pedidosMesas[_mesaAtual] || [];
  const fmt   = v => 'R$ ' + Number(v||0).toFixed(2).replace('.',',');
  const carr  = _carrinhoComanda[_mesaAtual] || [];
  const totalMesa = peds.reduce((s,p)=>s+Number(p.total||0),0);

  // Avisa carrinho pendente
  if (carr.length > 0) {
    if (!confirm('Ha itens nao enviados no carrinho. Deseja fechar mesmo assim?')) return;
  }

  // Reseta seleção de pagamento e abre modal
  _pagamentoComanda = null;
  _taxaServicoRemovida = false;
  ['PIX','CARTÃO','DINHEIRO'].forEach(m => {
    const btn = document.getElementById('pgto-btn-' + m);
    if (btn) { btn.style.borderColor='#e0dbd5'; btn.style.background='#fff'; btn.style.color='#555'; }
  });
  const aviso = document.getElementById('pgto-aviso');
  if (aviso) aviso.style.display = 'none';

  const mesaEl = document.getElementById('fechar-comanda-mesa');
  const totEl  = document.getElementById('fechar-comanda-total');
  const infEl  = document.getElementById('fechar-comanda-info');
  if (mesaEl) mesaEl.textContent = _mesaAtual;
  if (infEl)  infEl.textContent  = peds.length + ' pedido(s)';

  // Taxa de serviço
  const estab = getEstab();
  const taxaAtiva = estab?.taxa_servico === true;
  const percServico = Number(estab?.perc_servico || 10);
  const taxaWrap = document.getElementById('fechar-taxa-wrap');
  const btnRemover = document.getElementById('btn-remover-taxa');

  if (taxaAtiva) {
    const valorTaxa = totalMesa * (percServico / 100);
    const totalFinal = totalMesa + valorTaxa;
    // Mostra breakdown
    if (totEl) totEl.textContent = fmt(totalFinal);
    const subEl = document.getElementById('fechar-subtotal');
    const labEl = document.getElementById('fechar-taxa-label');
    const taxaEl = document.getElementById('fechar-taxa-valor');
    const finalEl = document.getElementById('fechar-total-final');
    if (subEl)   subEl.textContent  = fmt(totalMesa);
    if (labEl)   labEl.textContent  = `Taxa de serviço (${percServico}%)`;
    if (taxaEl)  taxaEl.textContent = fmt(valorTaxa);
    if (finalEl) finalEl.textContent = fmt(totalFinal);
    if (taxaWrap) taxaWrap.style.display = 'block';
    if (btnRemover) btnRemover.style.display = 'inline-flex';
  } else {
    if (totEl) totEl.textContent = fmt(totalMesa);
    if (taxaWrap) taxaWrap.style.display = 'none';
  }

  const modal = document.getElementById('modal-fechar-comanda');
  if (modal) modal.style.display = 'flex';
}

window.cancelarFecharComanda = function() {
  const modal = document.getElementById('modal-fechar-comanda');
  if (modal) modal.style.display = 'none';
  _pagamentoComanda = null;
  _taxaServicoRemovida = false;
};

// Remove a taxa de serviço a pedido do cliente
window.removerTaxaServico = function() {
  _taxaServicoRemovida = true;
  const fmt = v => 'R$ ' + Number(v||0).toFixed(2).replace('.',',');
  // Esconde a linha da taxa e atualiza os totais
  const taxaLinha = document.getElementById('fechar-taxa-linha');
  if (taxaLinha) taxaLinha.style.display = 'none';
  // Subtotal vira o total
  const subEl   = document.getElementById('fechar-subtotal');
  const finalEl = document.getElementById('fechar-total-final');
  const totEl   = document.getElementById('fechar-comanda-total');
  const subtotal = subEl?.textContent || '';
  if (finalEl) finalEl.textContent = subtotal;
  if (totEl)   totEl.textContent   = subtotal;
  // Muda label do bloco pra "Sem taxa de serviço"
  const labEl = document.getElementById('fechar-taxa-label');
  if (labEl) { labEl.textContent = 'Taxa de serviço removida'; labEl.style.textDecoration = 'line-through'; labEl.style.color = '#ccc'; }
  const taxaEl = document.getElementById('fechar-taxa-valor');
  if (taxaEl) { taxaEl.textContent = 'R$ 0,00'; taxaEl.style.color = '#ccc'; }
  const btn = document.getElementById('btn-remover-taxa');
  if (btn) btn.style.display = 'none';
};

// Toggle submenu Crédito/Débito
window.toggleCartaoSubMenu = function() {
  const sub = document.getElementById('pgto-cartao-submenu');
  const btn = document.getElementById('pgto-btn-CARTÃO');
  if (!sub) return;
  const abrindo = sub.style.display === 'none' || !sub.style.display;
  sub.style.display = abrindo ? 'flex' : 'none';
  sub.style.flexDirection = 'column';
  if (btn) {
    btn.style.borderColor = abrindo ? '#C0392B' : '#e0dbd5';
    btn.style.background  = abrindo ? '#fff5f5' : '#fff';
    btn.style.color       = abrindo ? '#C0392B' : '#555';
  }
};

window.selecionarPagamentoComanda = function(metodo) {
  _pagamentoComanda = metodo;
  // Reseta todos os botões
  ['PIX','CARTÃO','DINHEIRO','CRÉDITO','DÉBITO'].forEach(m => {
    const btn = document.getElementById('pgto-btn-' + m);
    if (!btn) return;
    btn.style.borderColor = '#e0dbd5';
    btn.style.background  = '#fff';
    btn.style.color       = '#555';
  });
  // Destaca o selecionado
  const sel = document.getElementById('pgto-btn-' + metodo);
  if (sel) { sel.style.borderColor='#C0392B'; sel.style.background='#fff5f5'; sel.style.color='#C0392B'; }
  // Se crédito/débito, destaca também o botão pai "Cartão"
  if (metodo === 'CRÉDITO' || metodo === 'DÉBITO') {
    const btnC = document.getElementById('pgto-btn-CARTÃO');
    if (btnC) { btnC.style.borderColor='#C0392B'; btnC.style.background='#fff5f5'; btnC.style.color='#C0392B'; }
  }
  const aviso = document.getElementById('pgto-aviso');
  if (aviso) aviso.style.display = 'none';
};

window.executarFecharComanda = async function() {
  // Exige pagamento selecionado
  if (!_pagamentoComanda) {
    const aviso = document.getElementById('pgto-aviso');
    if (aviso) aviso.style.display = 'block';
    return;
  }

  const modal = document.getElementById('modal-fechar-comanda');
  if (modal) modal.style.display = 'none';

  if (!_mesaAtual) return;
  const peds = _pedidosMesas[_mesaAtual] || [];
  const mesaFechando = _mesaAtual;
  const fmt = v => 'R$ ' + Number(v||0).toFixed(2).replace('.',',');
  const subtotal = peds.reduce((s,p)=>s+Number(p.total||0),0);

  // Calcula total final considerando taxa de serviço
  const estab = getEstab();
  const taxaAtiva = estab?.taxa_servico === true && !_taxaServicoRemovida;
  const percServico = Number(estab?.perc_servico || 10);
  const valorTaxa = taxaAtiva ? subtotal * (percServico / 100) : 0;
  const totalMesa = subtotal + valorTaxa;

  // Salva pagamento + status nos pedidos da mesa
  const ids = peds.map(p=>p.id);
  if (ids.length) {
    // Normaliza pagamento para o padrão do caixa
    const _PAG_NORM = {
      'PIX': 'pix', 'DINHEIRO': 'dinheiro',
      'CRÉDITO': 'cartao-credito', 'DÉBITO': 'cartao-debito',
      'CARTÃO': 'cartao-credito'
    };
    const _pagNorm = _PAG_NORM[_pagamentoComanda] || _pagamentoComanda.toLowerCase();
    await getSupa().from('pedidos').update({
      status: 'finalizado',
      pagamento: _pagNorm,
    }).in('id', ids);
  }

  delete _pedidosMesas[mesaFechando];
  delete _carrinhoComanda[mesaFechando];
  _mesasFechadas.add(mesaFechando);
  setTimeout(()=>{ _mesasFechadas.delete(mesaFechando); renderMesas(); }, 5000);

  _pagamentoComanda = null;
  _taxaServicoRemovida = false;
  window.fecharComanda();
  showToast('Comanda da ' + mesaFechando + ' fechada! ' + fmt(totalMesa));
  renderMesas();
  window.renderHistoricoMesas();
  await renderPedidos();
  await carregarFinanceiro();
};




// Exports das comandas — precisam estar em window para o onclick funcionar
window.abrirComanda           = abrirComanda;
window.confirmarFecharComanda = confirmarFecharComanda;
window.renderMesas            = renderMesas;
window.renderHistoricoMesas   = window.renderHistoricoMesas;
window.togglePedidosMesa      = window.togglePedidosMesa;
window.toggleHistMesa         = window.toggleHistMesa;
window.imprimirCozinha        = window.imprimirCozinha;
window.salvarNumMesas         = window.salvarNumMesas;
window.switchComandaTab       = window.switchComandaTab;

window.toggleTaxaEntrega = function(ativo) {
  const w = document.getElementById('taxa-entrega-wrap');
  if (w) w.style.display = ativo ? 'block' : 'none';
};

// ═══════════════════════════════════════════════════════════════════════════════
// 🔥 MODAL QUENTE — Promoção por percentual
// ═══════════════════════════════════════════════════════════════════════════════
let _quentePct = 10;

window.abrirModalQuente = async function() {
  const modal = document.getElementById('modal-quente');
  if (!modal) return;

  // Gera pills de percentual (5 a 50, step 5)
  const pctWrap = document.getElementById('quente-percentuais');
  if (pctWrap) {
    pctWrap.innerHTML = [5,10,15,20,25,30,35,40,45,50].map(p => `
      <button onclick="selecionarPctQuente(${p})" id="qpct-${p}"
        style="padding:8px 16px;border-radius:100px;border:2px solid ${p===_quentePct?'#e65e32':'#e0dbd5'};
               background:#fff;
               color:${p===_quentePct?'#e65e32':'#555'};
               font-family:'Poppins',sans-serif;font-weight:800;font-size:.82rem;cursor:pointer;transition:all .15s">
        ${p}% OFF
      </button>`).join('');
  }

  // Mostra preview
  atualizarPreviewQuente();

  // Carrega produtos da loja
  await carregarProdutosQuente();

  modal.style.display = 'flex';
};

window.selecionarPctQuente = function(pct) {
  _quentePct = pct;
  // Atualiza visual dos botões
  [5,10,15,20,25,30,35,40,45,50].forEach(p => {
    const btn = document.getElementById('qpct-'+p);
    if (!btn) return;
    btn.style.background     = '#fff';
    btn.style.borderColor    = p === pct ? '#e65e32' : '#e0dbd5';
    btn.style.color          = p === pct ? '#e65e32' : '#555';
  });
  atualizarPreviewQuente();
  // Recalcula preços nos cards de produto usando o preço BASE (nunca o descontado)
  document.querySelectorAll('[data-preco-orig]').forEach(el => {
    const base = parseFloat(el.dataset.precoOrig);
    const desc = base * (1 - _quentePct / 100);
    el.textContent = 'R$ ' + desc.toFixed(2).replace('.', ',');
  });
};

function atualizarPreviewQuente() {
  const prev = document.getElementById('quente-preview');
  const lbl  = document.getElementById('quente-preview-pct');
  if (prev) prev.style.display = 'flex';
  if (lbl)  lbl.textContent   = _quentePct + '% OFF';
}

async function carregarProdutosQuente() {
  const lista = document.getElementById('quente-lista-produtos');
  if (!lista) return;
  lista.innerHTML = '<div style="text-align:center;color:#aaa;padding:20px;font-size:.82rem">Carregando...</div>';

  const estab = getEstab();
  if (!estab?.id) { lista.innerHTML = '<div style="color:#aaa;font-size:.82rem;padding:20px;text-align:center">Nenhum produto encontrado</div>'; return; }

  const { data: prods } = await getSupa().from('produtos').select('id,nome,preco,preco_original,em_promocao,desconto_percent,foto_url,categoria').eq('estabelecimento_id', estab.id).eq('disponivel', true).order('nome');

  if (!prods?.length) {
    lista.innerHTML = '<div style="color:#aaa;font-size:.82rem;padding:20px;text-align:center">Nenhum produto cadastrado</div>';
    return;
  }

  lista.innerHTML = prods.map(p => {
    const emPromo = p.em_promocao && p.desconto_percent > 0;
    // SEMPRE usa preco_original como base — nunca o preço já descontado
    const precoBase = parseFloat(p.preco_original || p.preco);
    const precoDesc = precoBase * (1 - _quentePct / 100);
    return `
    <label style="display:flex;align-items:center;gap:12px;background:${emPromo?'#fff8f5':'#faf8f5'};border:1.5px solid ${emPromo?'#e65e32':'#f0ebe4'};border-radius:12px;padding:12px 14px;cursor:pointer;transition:all .15s">
      <input type="checkbox" value="${p.id}" ${emPromo?'checked':''}
        data-preco-base="${precoBase}"
        style="width:18px;height:18px;accent-color:#e65e32;cursor:pointer;flex-shrink:0">
      ${p.foto_url?`<img src="${p.foto_url}" style="width:42px;height:42px;border-radius:8px;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`:         '<div style="width:42px;height:42px;border-radius:8px;background:#f0ebe4;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0">🍽️</div>'}
      <div style="flex:1;min-width:0">
        <div style="font-size:.85rem;font-weight:700;color:#1a1a1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nome}</div>
        <div style="font-size:.72rem;color:#aaa">${p.categoria||''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:.72rem;color:#bbb;text-decoration:line-through">R$ ${precoBase.toFixed(2).replace('.',',')}</div>
        <div style="font-size:.9rem;font-weight:800;color:#e65e32" data-preco-orig="${precoBase}">R$ ${precoDesc.toFixed(2).replace('.',',')}</div>
      </div>
    </label>`;
  }).join('');
}

window.salvarQuente = async function() {
  const checkboxes = document.querySelectorAll('#quente-lista-produtos input[type=checkbox]');
  const marcados   = [...checkboxes].filter(c => c.checked);
  const desmarcados= [...checkboxes].filter(c => !c.checked);
  const pct        = _quentePct;
  const estab      = getEstab();

  showToast('Salvando...', '#f59e0b');

  // Remove promoção dos desmarcados — SEMPRE restaura preco ao preco_original
  for (const cb of desmarcados) {
    const precoBase = parseFloat(cb.dataset.precoBase); // original guardado no data attr
    // Dupla segurança: busca preco_original do banco
    const { data: prod } = await getSupa().from('produtos')
      .select('preco_original,em_promocao').eq('id', cb.value).single();
    // Só age em produtos que estavam em promoção
    if (!prod?.em_promocao) continue;
    const precoRestaurado = prod?.preco_original || precoBase;
    await getSupa().from('produtos').update({
      em_promocao:      false,
      desconto_percent: 0,
      preco:            precoRestaurado,  // ← restaura o preço original de verdade
      preco_original:   null,
    }).eq('id', cb.value);
  }

  // Salva produtos marcados com o percentual
  for (const cb of marcados) {
    const precoBase = parseFloat(cb.dataset.precoBase); // sempre o original
    const precoDesc = parseFloat((precoBase * (1 - pct/100)).toFixed(2));
    await getSupa().from('produtos').update({
      em_promocao:      true,
      desconto_percent: pct,
      preco_original:   precoBase,   // guarda o original
      preco:            precoDesc,   // aplica desconto sobre o original
    }).eq('id', cb.value);
  }

  // Atualiza flag da loja
  if (estab?.id) {
    await getSupa().from('estabelecimentos').update({
      promocao_ativa:   marcados.length > 0,
      desconto_percent: marcados.length > 0 ? pct : 0,
    }).eq('id', estab.id);
  }

  fecharModalQuente();
  showToast(marcados.length > 0 ? '🔥 Promoção QUENTE salva!' : '✅ Promoção removida!');
  await renderCardapio();
};

window.fecharModalQuente = function() {
  const modal = document.getElementById('modal-quente');
  if (modal) modal.style.display = 'none';
  const prev = document.getElementById('quente-preview');
  if (prev) prev.style.display = 'none';
};

// ── Sub-abas do cardápio (Todos / 🔥 QUENTE) ─────────────────────────────────
let _dashSubTab = 'todos';

window.dashSubTab = async function(tab, btn) {
  _dashSubTab = tab;
  // Estilo dos botões
  ['todos','quente'].forEach(t => {
    const b = document.getElementById('dash-subtab-' + t);
    if (!b) return;
    const ativo = t === tab;
    b.style.color       = ativo ? 'var(--red)' : '#aaa';
    b.style.borderBottom= ativo ? '2.5px solid var(--red)' : '2.5px solid transparent';
  });
  await renderCardapio();
};

// Atualiza animação do foguinho no dashboard
function atualizarFireDash() {
  const ico = document.getElementById('dash-fire-ico');
  if (!ico) return;
  // Verifica se há produtos QUENTE
  getSupa().from('produtos').select('id').eq('estabelecimento_id', getEstab()?.id).eq('em_promocao', true).limit(1)
    .then(({ data }) => {
      if (data?.length) {
        ico.style.cssText = 'display:inline-block;animation:fire-pulse-dash 1.8s ease-in-out infinite';
      } else {
        ico.style.cssText = 'display:inline-block;opacity:.3;filter:grayscale(1)';
      }
    });
}

// Injeta keyframe no dash
if (!document.getElementById('dash-fire-style')) {
  const s = document.createElement('style');
  s.id = 'dash-fire-style';
  s.textContent = '@keyframes fire-pulse-dash{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}';
  document.head.appendChild(s);
}

window.toggleCfgTaxaServico = function(ativo) {
  const w = document.getElementById('cfg-taxa-servico-wrap');
  if (w) w.style.display = ativo ? 'block' : 'none';
};

// ── Accordion das configurações ───────────────────────────────────────────────
// Abre modal de configuração ao clicar no card
// salvarCfgModal removido — usa salvarConfig direto


window.fecharCfgModal = function() {
  // Delega para fecharCfgPopup que devolve os filhos ao cfg-topic-body corretamente
  if (typeof window.fecharCfgPopup === 'function') {
    window.fecharCfgPopup();
  } else {
    const ov = document.getElementById('cfg-modal-overlay');
    if (ov) ov.style.display = 'none';
  }
};

// Fecha ao clicar fora
document.addEventListener('click', function(e) {
  const ov = document.getElementById('cfg-modal-overlay');
  if (ov && e.target === ov) window.fecharCfgModal();
});

function abrirCfgModal(header) {
  // Desativado — usa o sistema de popup CSS via initCfgAccordion
  // Mantido apenas para compatibilidade de chamadas antigas
}

// Fecha popup de config (desktop)
// fecharCfgPopup antiga removida — usa a versão no initCfgAccordion

window.fecharCfgPopup = function() {
  const ov = document.getElementById('cfg-modal-overlay');
  if (!ov) return;
  const mb = document.getElementById('cfg-modal-body');
  if (mb && mb._sourceCard) {
    // Devolve filhos ao BODY original (não ao card)
    const body = mb._sourceCard.querySelector('.cfg-topic-body');
    if (body) {
      Array.from(mb.children).forEach(function(el) {
        if (!el.classList.contains('cfg-popup-actions')) {
          body.appendChild(el);  // volta para o body correto
        }
      });
    }
    mb._sourceCard = null;
  }
  ov.style.display = 'none';
};

window.initCfgAccordion = function() {
  document.querySelectorAll('.cfg-topic-header').forEach(function(header) {
    if (header.dataset.accordion) return;
    header.dataset.accordion = '1';
    header.addEventListener('click', function(e) {
      if (e.target.closest('input,button,label,select,a,textarea')) return;
      var card = header.closest('.cfg-topic-card');
      var body = card && card.querySelector('.cfg-topic-body');
      if (!body) return;

      var isDesktop = !(window.innerWidth < 860);

      if (isDesktop) {
        // ── DESKTOP: usa cfg-modal-overlay que está direto no <body> ──
        var ov = document.getElementById('cfg-modal-overlay');
        var mb = document.getElementById('cfg-modal-body');
        var mt = document.getElementById('cfg-modal-title');
        var ms = document.getElementById('cfg-modal-sub');
        var mi = document.getElementById('cfg-modal-icon');
        if (!ov || !mb) return;

        // Atualiza cabeçalho do modal
        if (mt) mt.textContent = header.querySelector('.cfg-topic-title')?.textContent || '';
        if (ms) ms.textContent = header.querySelector('.cfg-topic-sub')?.textContent || '';
        if (mi) mi.textContent = header.querySelector('.cfg-topic-icon')?.textContent || '';

        // Remove actions antigas do body (da sessão anterior)
        var oldActs = body.querySelector('.cfg-popup-actions');
        if (oldActs) oldActs.remove();

        // Move o body real para dentro do modal (sem clonar — sem IDs duplicados)
        mb.innerHTML = '';
        mb._sourceCard = card;
        Array.from(body.children).forEach(function(child) {
          mb.appendChild(child);
        });

        // Adiciona botões (sempre cria novos pois mb foi limpo)
        if (!mb.querySelector('.cfg-popup-actions')) {
          var acts = document.createElement('div');
          acts.className = 'cfg-popup-actions';
          acts.style.cssText = 'display:flex;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid #f0ebe4;flex-shrink:0';
          acts.innerHTML = '<button onclick="fecharCfgPopup()" style="flex:1;background:none;border:1.5px solid #ddd;border-radius:12px;padding:11px;font-family:inherit;font-size:.85rem;font-weight:700;color:#666;cursor:pointer">Cancelar</button>'
            + '<button onclick="salvarConfig();fecharCfgPopup();" style="flex:2;background:var(--red);color:#fff;border:none;border-radius:12px;padding:11px;font-family:inherit;font-size:.88rem;font-weight:800;cursor:pointer">💾 Salvar e fechar</button>';
          mb.appendChild(acts);
        }

        // Dispara change em selects cascata (estado→cidade)
        setTimeout(function() {
          mb.querySelectorAll('select').forEach(function(sel) {
            // cfg-estado: usa carregarCidadesDash direto passando a cidade já salva
            // para não perder a seleção ao reabrir o modal
            if (sel.id === 'cfg-estado') {
              if (sel.value) {
                var cidadeAtual = mb.querySelector('#cfg-cidade')?.value || null;
                if (typeof window.carregarCidadesDash === 'function') {
                  window.carregarCidadesDash(sel.value, cidadeAtual);
                }
              }
              return;
            }
            if (sel.value) sel.dispatchEvent(new Event('change', { bubbles: true }));
          });
        }, 60);

        ov.style.display = 'flex';

      } else {
        // ── MOBILE: accordion inline ──
        var isOpen = body.classList.contains('open');
        document.querySelectorAll('.cfg-topic-body.open').forEach(function(b) {
          b.classList.remove('open');
          var h = b.closest('.cfg-topic-card')?.querySelector('.cfg-topic-header');
          if (h) h.classList.remove('open');
        });
        if (!isOpen) {
          body.classList.add('open');
          header.classList.add('open');
          body.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    });
  });
};


// ═══════════════════════════════════════════════════════════════════════════
// FILTRO DE PEDIDOS POR DATA
// ═══════════════════════════════════════════════════════════════════════════
window.filtrarPedidosData = async function() {
  const estab  = getEstab(); if (!estab) return;
  const deVal  = document.getElementById('ped-data-de')?.value;
  const ateVal = document.getElementById('ped-data-ate')?.value;

  if (!deVal && !ateVal) {
    // Sem filtro: recarrega normal
    await renderPedidos(); return;
  }

  // Re-busca do banco com datas reais
  var q = getSupa().from('pedidos')
    .select('id,cliente_nome,cliente_whats,status,total,taxa_entrega,pagamento,troco,endereco,itens,created_at,estabelecimento_id')
    .eq('estabelecimento_id', estab.id)
    .order('created_at', { ascending: false });
  if (deVal)  q = q.gte('created_at', deVal + 'T00:00:00');
  if (ateVal) q = q.lte('created_at', ateVal + 'T23:59:59');

  const { data } = await q.limit(1000);
  const cont = document.getElementById('todos-pedidos');
  if (!cont) return;
  if (!data?.length) {
    cont.innerHTML = '<div style="color:#aaa;text-align:center;padding:32px">Nenhum pedido neste período</div>';
    return;
  }
  await renderPedidos(data);
};

// ═══════════════════════════════════════════════════════════════════════════
// QUENTE — DESATIVA PROMOÇÕES AUTOMATICAMENTE AO VIRAR O DIA
// ═══════════════════════════════════════════════════════════════════════════
async function verificarExpiracaoQuente() {
  const estab = getEstab();
  if (!estab || estab.id === 'demo') return;
  const hoje  = new Date().toDateString();
  const chave = 'pw_quente_dia_' + estab.id;
  if (localStorage.getItem(chave) === hoje) return; // já resetou hoje
  try {
    const { data: promos } = await getSupa()
      .from('produtos').select('id,preco_original')
      .eq('estabelecimento_id', estab.id).eq('em_promocao', true);
    if (promos && promos.length) {
      for (var p of promos) {
        await getSupa().from('produtos').update({ em_promocao: false, desconto_percent: 0, preco: p.preco_original || p.preco }).eq('id', p.id);
      }
      showToast('🌅 Promoções Quente do dia anterior foram encerradas.');
      await renderCardapio();
    }
  } catch(e) { console.warn('Erro ao expirar promoções:', e); }
  localStorage.setItem(chave, hoje);
}

// Agenda reset exato à meia-noite, depois repete a cada 24h
function agendarResetMeiaNoite() {
  var agora = new Date();
  var meiaNoite = new Date(agora);
  meiaNoite.setHours(24, 0, 0, 100); // próxima meia-noite + 100ms de margem
  var msAte = meiaNoite - agora;
  setTimeout(function() {
    verificarExpiracaoQuente();
    setInterval(verificarExpiracaoQuente, 24 * 60 * 60 * 1000); // repete todo dia
  }, msAte);
}
agendarResetMeiaNoite();

// Fallback: também verifica a cada hora (cobre casos de tab dormindo)
setInterval(function() { verificarExpiracaoQuente(); }, 60 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════════
// CAIXA — PERSISTENTE (localStorage primário, Supabase secundário)
// ═══════════════════════════════════════════════════════════════════════════

// ── HORÁRIO AUTOMÁTICO ────────────────────────────────────────────────────────
(function() {
  var _autoHorarioInterval = null;

  function verificarHorarioAuto() {
    try {
      var estab = getEstab();
      if (!estab || !estab.horarios) return;
      var horarios = estab.horarios;
      if (!Array.isArray(horarios) || !horarios.length) return;

      var agora = new Date();
      var diaSemana = agora.getDay(); // 0=dom, 1=seg...
      var horaAtual = agora.getHours() * 60 + agora.getMinutes();

      var diaAtivo = horarios.find(function(h) {
        return Array.isArray(h.dias) && h.dias.includes(diaSemana) && h.ativo !== false;
      });

      var deveEstarAberta = false;
      if (diaAtivo && diaAtivo.abertura && diaAtivo.fechamento) {
        var parts1 = diaAtivo.abertura.split(':');
        var parts2 = diaAtivo.fechamento.split(':');
        var abMin = parseInt(parts1[0]) * 60 + parseInt(parts1[1] || 0);
        var feMin = parseInt(parts2[0]) * 60 + parseInt(parts2[1] || 0);
        deveEstarAberta = !(horaAtual < abMin) && horaAtual < feMin;
      }

      var estaAberta = !!estab.loja_aberta;
      if (deveEstarAberta !== estaAberta) {
        getSupa().from('estabelecimentos')
          .update({ loja_aberta: deveEstarAberta })
          .eq('id', estab.id)
          .then(function(res) {
            if (!res.error) {
              try {
                var stored = JSON.parse(localStorage.getItem('pw_estab') || '{}');
                stored.loja_aberta = deveEstarAberta;
                localStorage.setItem('pw_estab', JSON.stringify(stored));
                if (window._estab) window._estab.loja_aberta = deveEstarAberta;
              } catch(e) {}
              showToast(deveEstarAberta ? '🟢 Loja aberta automaticamente!' : '🔴 Loja fechada automaticamente!');
              // Atualiza toggle visual
              var tog = document.getElementById('cfg-aberto');
              if (tog) { tog.checked = deveEstarAberta; }
            }
          });
      }
    } catch(e) {}
  }

  window.iniciarAutoHorario = function() {
    if (_autoHorarioInterval) clearInterval(_autoHorarioInterval);
    verificarHorarioAuto();
    _autoHorarioInterval = setInterval(verificarHorarioAuto, 60000); // Verifica a cada minuto
  };
})();

var _caixaAberto   = false;
var _caixaAbertura = null;
var _caixaId       = null;
var _caixaTimer    = null;

var _caixaCanal = null;

function iniciarAutoRefreshCaixa() {
  // Mantém intervalo como fallback (60s)
  if (_caixaTimer) clearInterval(_caixaTimer);
  _caixaTimer = setInterval(function() { if (_caixaAberto) atualizarResumoCaixa(); }, 60000);

  // Realtime: atualiza caixa imediatamente quando chega pedido novo ou é atualizado
  var estab = getEstab();
  if (!estab) return;
  if (_caixaCanal) { try { _caixaCanal.unsubscribe(); } catch(e) {} }
  _caixaCanal = getSupa()
    .channel('caixa-rt-' + estab.id)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'pedidos',
      filter: 'estabelecimento_id=eq.' + estab.id
    }, function() {
      if (_caixaAberto) atualizarResumoCaixa();
    })
    .subscribe();
}

function pararAutoRefreshCaixa() {
  if (_caixaTimer) { clearInterval(_caixaTimer); _caixaTimer = null; }
  if (_caixaCanal) { try { _caixaCanal.unsubscribe(); } catch(e) {} _caixaCanal = null; }
}

async function atualizarResumoCaixa() {
  var estab = getEstab();
  if (!estab || !_caixaAberto || !_caixaAbertura) return;
  var fmt = function(v) { return 'R$ ' + Number(v||0).toFixed(2).replace('.',','); };
  try {
    // Busca pedidos aceitos desde a abertura do caixa
    var res = await getSupa().from('pedidos')
      .select('total,pagamento,status')
      .eq('estabelecimento_id', estab.id)
      .gte('created_at', _caixaAbertura.hora)
      .neq('status', 'recusado')
      .neq('status', 'novo');

    var todos = res.data || [];

    // Pagamento salvo como: 'pix', 'dinheiro', 'cartao-credito-*', 'cartao-debito-*', 'No local'
    var pag = function(p) { return String(p.pagamento||'').toLowerCase(); };
    var som = function(arr) { return arr.reduce(function(s,p){return s+Number(p.total||0);},0); };

    var totalPix      = som(todos.filter(function(p){ return pag(p)==='pix'; }));
    var totalCredito  = som(todos.filter(function(p){ return pag(p).startsWith('cartao-credito') || pag(p)==='crédito' || pag(p)==='credito'; }));
    var totalDebito   = som(todos.filter(function(p){ return pag(p).startsWith('cartao-debito') || pag(p)==='débito' || pag(p)==='debito'; }));
    var totalCartao   = totalCredito + totalDebito;
    var totalDinheiro = som(todos.filter(function(p){ return pag(p)==='dinheiro'; }));
    var totalMesa     = som(todos.filter(function(p){ return pag(p)==='no local'; }));
    var totalVendas   = totalPix + totalCartao + totalDinheiro + totalMesa;
    var totalCaixa    = totalVendas + Number(_caixaAbertura.valorAbertura||0);

    var el = function(id){return document.getElementById(id);};
    if (el('caixa-total-pix'))      el('caixa-total-pix').textContent      = fmt(totalPix);
    if (el('caixa-total-credito'))  el('caixa-total-credito').textContent  = fmt(totalCredito);
    if (el('caixa-total-debito'))   el('caixa-total-debito').textContent   = fmt(totalDebito);
    if (el('caixa-total-cartao'))   el('caixa-total-cartao').textContent   = fmt(totalCartao);
    if (el('caixa-total-dinheiro')) el('caixa-total-dinheiro').textContent = fmt(totalDinheiro);
    if (el('caixa-total-mesa'))     el('caixa-total-mesa').textContent     = fmt(totalMesa);
    if (el('caixa-total-vendas'))   el('caixa-total-vendas').textContent   = fmt(totalVendas);
    if (el('caixa-total-geral'))    el('caixa-total-geral').textContent    = fmt(totalCaixa);
    if (el('caixa-num-pedidos'))    el('caixa-num-pedidos').textContent    = todos.length;

    // Fundo inicial (valor de abertura)
    if (el('caixa-fundo-display')) el('caixa-fundo-display').textContent = fmt(Number(_caixaAbertura.valorAbertura||0));
    // Diferença físico vs esperado
    var fisico = parseFloat((el('caixa-fisico')?.value||'0').replace(',','.')) || 0;
    var diff = fisico - totalCaixa;
    if (el('caixa-diferenca')) {
      el('caixa-diferenca').textContent = fmt(Math.abs(diff)) + (diff < 0 ? ' (falta)' : diff > 0 ? ' (sobra)' : '');
      el('caixa-diferenca').style.color = diff < 0 ? '#dc2626' : diff > 0 ? '#16a34a' : '#555';
      el('caixa-diferenca').style.fontWeight = diff !== 0 ? '900' : '700';
    }
  } catch(e) { console.error('Caixa error:', e); }
}
window.atualizarResumoCaixa = atualizarResumoCaixa;

// ── Gera HTML visual do recibo de fechamento (igual para fechar e reimprimir) ─
function _gerarHtmlReciboCaixa(h, estab) {
  var fmt = function(v){ return 'R$ ' + Number(v||0).toFixed(2).replace('.',','); };
  var nome  = (estab && estab.nome  ? estab.nome  : 'Estabelecimento').toUpperCase();
  var end_  = estab && estab.endereco ? estab.endereco : '';
  var tel   = estab && (estab.telefone_contato || estab.whatsapp) ? (estab.telefone_contato || estab.whatsapp) : '';
  var cnpj  = estab && estab.cpf_cnpj ? 'CNPJ: ' + estab.cpf_cnpj : '';
  var dif   = Number(h.diferenca || 0);
  var temDif = h.fisico > 0 && dif !== 0;
  var difHtml = '';
  if (h.fisico > 0) {
    var difCor = dif < 0 ? '#dc2626' : dif > 0 ? '#16a34a' : '#16a34a';
    var difTxt = dif === 0 ? '✔ Caixa fechado certinho!' : (dif < 0 ? '▼ Faltou ' : '▲ Sobrou ') + fmt(Math.abs(dif));
    difHtml = '<div style="margin:6px 0;padding:6px 8px;border-radius:6px;background:' + (dif < 0 ? '#fef2f2' : '#f0fdf4') + ';border:1.5px solid ' + (dif < 0 ? '#fca5a5' : '#86efac') + ';text-align:center;font-size:12px;font-weight:900;color:' + difCor + '">' + difTxt + '</div>';
  }
  var mesaHtml = h.totalMesa > 0 ? '<div class="row"><span class="lbl">Mesa/Local</span><span class="val">' + fmt(h.totalMesa) + '</span></div>' : '';
  var obsHtml  = h.obs ? '<div style="font-size:9px;color:#555;margin-top:4px">Obs: ' + h.obs + '</div>' : '';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fechamento de Caixa</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700;900&display=swap" rel="stylesheet">'
    + '<style>'
    + '*{margin:0;padding:0;box-sizing:border-box}'
    + 'body{font-family:Poppins,Arial,sans-serif;font-size:12px;background:#fff;color:#000;width:300px;max-width:300px;margin:0 auto;padding:12px 10px}'
    + '.center{text-align:center}'
    + '.logo{font-size:18px;font-weight:900;letter-spacing:.06em}.logo-red{color:#C0392B}'
    + '.emp{font-size:13px;font-weight:700;margin-top:2px}'
    + '.info{font-size:10px;color:#333;line-height:1.7;margin-top:2px}'
    + '.sep-thick{border:none;border-top:3px solid #000;margin:8px 0}'
    + '.sep-dash{border:none;border-top:1px dashed #888;margin:7px 0}'
    + '.sec{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#555;border-bottom:1px solid #ccc;padding-bottom:2px;margin:7px 0 4px}'
    + '.row{display:flex;justify-content:space-between;font-size:11px;padding:1px 0;gap:6px}'
    + '.row .lbl{color:#555}.row .val{font-weight:700;text-align:right}'
    + '.total-bloco{border-top:2px solid #000;border-bottom:2px solid #000;padding:5px 0;margin:5px 0;display:flex;justify-content:space-between;align-items:center}'
    + '.total-lbl{font-size:14px;font-weight:900}'
    + '.total-val{font-size:16px;font-weight:900;color:#16a34a}'
    + '.rodape{font-size:9px;text-align:center;color:#888;margin-top:8px;letter-spacing:.04em}'
    + '@media print{body{padding:4px}@page{margin:0;size:80mm auto}}'
    + '</style></head><body>'
    + '<div class="center">'
    + '<div class="logo">PEDI<span class="logo-red">WAY</span></div>'
    + '<div class="emp">' + nome + '</div>'
    + '<div class="info">' + (end_ ? end_ + '<br>' : '') + (tel ? 'Tel: ' + tel + '<br>' : '') + cnpj + '</div>'
    + '</div>'
    + '<hr class="sep-thick">'
    + '<div class="center" style="font-size:13px;font-weight:900;letter-spacing:.05em">FECHAMENTO DE CAIXA</div>'
    + '<hr class="sep-dash">'
    + '<div class="sec">Período</div>'
    + '<div class="row"><span class="lbl">Operador</span><span class="val">' + (h.operador || 'Operador') + '</span></div>'
    + '<div class="row"><span class="lbl">Abertura</span><span class="val">' + new Date(h.aberturaEm || '').toLocaleString('pt-BR') + '</span></div>'
    + '<div class="row"><span class="lbl">Fechamento</span><span class="val">' + new Date(h.fechadoEm || '').toLocaleString('pt-BR') + '</span></div>'
    + '<hr class="sep-dash">'
    + '<div class="sec">Fundo de Caixa</div>'
    + '<div class="row"><span class="lbl">Valor inicial</span><span class="val">' + fmt(h.valorAbertura) + '</span></div>'
    + '<hr class="sep-dash">'
    + '<div class="sec">Recebimentos</div>'
    + '<div class="row"><span class="lbl">PIX</span><span class="val">' + fmt(h.totalPix) + '</span></div>'
    + '<div class="row"><span class="lbl">Cartão Crédito</span><span class="val">' + fmt(h.totalCredito || 0) + '</span></div>'
    + '<div class="row"><span class="lbl">Cartão Débito</span><span class="val">' + fmt(h.totalDebito || 0) + '</span></div>'
    + '<div class="row"><span class="lbl">Dinheiro</span><span class="val">' + fmt(h.totalDinheiro) + '</span></div>'
    + mesaHtml
    + '<div class="row" style="margin-top:3px"><span class="lbl">Nº de pedidos</span><span class="val">' + (h.numPedidos || 0) + '</span></div>'
    + '<hr class="sep-dash">'
    + '<div class="sec">Totais</div>'
    + '<div class="row"><span class="lbl">Subtotal vendas</span><span class="val">' + fmt(h.totalVendas) + '</span></div>'
    + '<div class="row"><span class="lbl">Fundo inicial</span><span class="val">+ ' + fmt(h.valorAbertura) + '</span></div>'
    + (h.fisico > 0 ? '<div class="row"><span class="lbl">Físico contado</span><span class="val">' + fmt(h.fisico) + '</span></div>' : '')
    + difHtml
    + obsHtml
    + '<div class="total-bloco"><span class="total-lbl">TOTAL EM CAIXA</span><span class="total-val">' + fmt(h.totalGeral) + '</span></div>'
    + '<div class="center rodape">Gerado em: ' + new Date(h.fechadoEm || '').toLocaleString('pt-BR') + '<br>PEDIWAY · Plataforma de delivery independente</div>'
    + '</body></html>';
}

// Config da plataforma (carregada do Supabase via mandaadmin)
var _platformConfig = { wpp: '', wppMsg: '', precoPro: '49', precoPrem: '99' };

// Busca config da plataforma no Supabase (número de suporte definido no mandaadmin)
async function carregarConfigPlataforma() {
  try {
    var { data } = await getSupa()
      .from('pediway_config')
      .select('wpp, wpp_msg, preco_pro, preco_prem')
      .eq('id', 'global')
      .maybeSingle();
    if (!data) return;

    // Armazena na variável global
    _platformConfig.precoPro  = String(data.preco_pro  || 49);
    _platformConfig.precoPrem = String(data.preco_prem || 99);
    _platformConfig.wppMsg    = data.wpp_msg || 'Olá! Preciso de ajuda com o PEDIWAY.';

    // Atualiza link ME AJUDA
    var wpp = (data.wpp || '').replace(/\D/g, '');
    if (wpp) {
      _platformConfig.wpp = wpp;
      var n   = wpp.length > 11 ? wpp : '55' + wpp;
      var msg = encodeURIComponent(_platformConfig.wppMsg);
      // Salva URL global — usada pelo onclick do card de suporte
      window._pediwaySupportUrl = 'https://wa.me/' + n + '?text=' + msg;
    }

    // Atualiza preços exibidos no painel de planos
    var elPro  = document.getElementById('dash-preco-pro');
    var elPrem = document.getElementById('dash-preco-prem') || document.getElementById('dash-preco-premium');
    if (elPro)  elPro.textContent  = _platformConfig.precoPro;
    if (elPrem) elPrem.textContent = _platformConfig.precoPrem;

  } catch(e) { console.warn('Config plataforma:', e); }
}

// Calcula e exibe diferença físico vs esperado em tempo real (chamada pelo oninput)
window.calcularDiferenca = function() {
  var el = function(id){ return document.getElementById(id); };
  var wrap = el('caixa-diferenca-wrap');
  if (!wrap) return;

  var fisicoVal = parseFloat((el('caixa-fisico')?.value||'0').replace(',','.')) || 0;

  // Usa o total calculado internamente (mais confiável que ler o texto da tela)
  var esperado = 0;
  var geralEl = el('caixa-total-geral');
  if (geralEl) {
    esperado = parseFloat(geralEl.textContent.replace('R$','').replace(/\./g,'').replace(',','.').trim()) || 0;
  }
  // Fallback: lê vendas + fundo da tela
  if (!esperado) {
    var vendasEl = el('caixa-total-vendas');
    var fundoEl  = el('caixa-fundo-display');
    var vendas = vendasEl ? parseFloat(vendasEl.textContent.replace('R$','').replace(/\./g,'').replace(',','.').trim()) || 0 : 0;
    var fundo  = fundoEl  ? parseFloat(fundoEl.textContent.replace('R$','').replace(/\./g,'').replace(',','.').trim()) || 0 : 0;
    esperado = vendas + fundo;
  }

  var fmt = function(v){ return 'R$ ' + Number(Math.abs(v)).toFixed(2).replace('.',','); };

  if (!fisicoVal) {
    wrap.style.display = 'none';
    return;
  }

  var diff = fisicoVal - esperado;
  wrap.style.display      = 'block';
  wrap.style.borderRadius = '10px';
  wrap.style.padding      = '10px 16px';
  wrap.style.textAlign    = 'center';
  wrap.style.fontWeight   = '800';
  wrap.style.fontSize     = '.88rem';

  if (diff < 0) {
    wrap.style.background = 'rgba(220,38,38,.09)';
    wrap.style.border     = '1.5px solid rgba(220,38,38,.3)';
    wrap.style.color      = '#dc2626';
    wrap.innerHTML = '<span style="font-size:1.1rem;vertical-align:middle">▼</span> Faltou <strong>' + fmt(diff) + '</strong>';
  } else if (diff > 0) {
    wrap.style.background = 'rgba(22,163,74,.09)';
    wrap.style.border     = '1.5px solid rgba(22,163,74,.3)';
    wrap.style.color      = '#16a34a';
    wrap.innerHTML = '<span style="font-size:1.1rem;vertical-align:middle">▲</span> Sobrou <strong>' + fmt(diff) + '</strong>';
  } else {
    wrap.style.background = 'rgba(0,0,0,.04)';
    wrap.style.border     = '1.5px solid #e0e0e0';
    wrap.style.color      = '#16a34a';
    wrap.innerHTML = '✓ Caixa fechado certinho!';
  }
};

function aplicarUICaixaAberto(operador, hora) {
  var el = function(id){return document.getElementById(id);};
  var agora = new Date(hora);
  if (el('caixa-status-card'))    el('caixa-status-card').style.background    = 'linear-gradient(135deg,#16a34a,#15803d)';
  if (el('caixa-status-label'))   el('caixa-status-label').textContent         = '— Aberto —';
  if (el('caixa-status-hora'))    el('caixa-status-hora').textContent           = 'Desde ' + agora.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  if (el('caixa-status-icon'))    el('caixa-status-icon').textContent           = '🔓';
  if (el('caixa-abrir-card'))     el('caixa-abrir-card').style.display          = 'none';
  if (el('caixa-fechar-card'))    el('caixa-fechar-card').style.display         = 'block';
  if (el('caixa-operador-label')) el('caixa-operador-label').textContent        = 'Operador: ' + (operador||'Operador');
}

async function restaurarCaixa() {
  var estab = getEstab();
  if (!estab || estab.id === 'demo') return;
  renderHistoricoCaixa();
  try {
    var salvo = JSON.parse(localStorage.getItem('pw_caixa_' + estab.id) || 'null');
    if (salvo && salvo.aberto && salvo.hora) {
      _caixaAberto   = true;
      _caixaAbertura = salvo;
      aplicarUICaixaAberto(salvo.operador, salvo.hora);
      await atualizarResumoCaixa();
      iniciarAutoRefreshCaixa();
    }
  } catch(e) {}
}
window.restaurarCaixa = restaurarCaixa;

window.abrirCaixa = async function() {
  var estab = getEstab();
  if (!estab) return;
  var valorAbertura = parseFloat(document.getElementById('caixa-valor-abertura')?.value || 0);
  var operador      = (document.getElementById('caixa-operador')?.value.trim() || 'Operador').slice(0,100);
  var obs           = (document.getElementById('caixa-obs-abertura')?.value.trim() || '').slice(0,300);
  var agora         = new Date();
  _caixaAberto   = true;
  // Sempre usa NOW como início — nunca herda sessão anterior
  _caixaAbertura = { valorAbertura: valorAbertura, operador: operador, obs: obs, hora: new Date().toISOString(), aberto: true };
  try { localStorage.setItem('pw_caixa_' + estab.id, JSON.stringify(_caixaAbertura)); } catch(e) {}
  aplicarUICaixaAberto(operador, _caixaAbertura.hora);
  await atualizarResumoCaixa();
  iniciarAutoRefreshCaixa();
  showToast('✅ Caixa aberto!');
};

window.fecharCaixa = async function() {
  if (!confirm('Confirma o fechamento do caixa? Um comprovante será gerado.')) return;
  var estab = getEstab();
  if (!estab || !_caixaAbertura) { showToast('Caixa não está aberto.'); return; }
  var agora     = new Date();
  var abertura  = _caixaAbertura; // salva referência ANTES de resetar
  var fmt       = function(v){return 'R$ ' + Number(v||0).toFixed(2).replace('.',',');};
  var pag       = function(p){return String(p.pagamento||'').toLowerCase();};
  var som       = function(arr){return arr.reduce(function(s,p){return s+Number(p.total||0);},0);};
  var fisico    = parseFloat((document.getElementById('caixa-fisico')?.value||'0').replace(',','.')) || 0;
  var obs       = document.getElementById('caixa-obs-fechamento')?.value || '';

  var totalPix=0, totalCredito=0, totalDebito=0, totalDinheiro=0, totalMesa=0, numPedidos=0;
  try {
    var res = await getSupa().from('pedidos').select('total,pagamento,status')
      .eq('estabelecimento_id', estab.id)
      .gte('created_at', abertura.hora)
      .neq('status','recusado')
      .neq('status','novo')
      .order('created_at', {ascending: true});
    var todos = res.data || [];
    numPedidos    = todos.length;
    totalPix      = som(todos.filter(function(p){return pag(p)==='pix';}));
    totalCredito  = som(todos.filter(function(p){return pag(p).startsWith('cartao-credito');}));
    totalDebito   = som(todos.filter(function(p){return pag(p).startsWith('cartao-debito');}));
    totalDinheiro = som(todos.filter(function(p){return pag(p)==='dinheiro';}));
    totalMesa     = som(todos.filter(function(p){return pag(p)==='no local';}));
  } catch(e) { console.error('Caixa fechamento:', e); }
  var totalCartao   = totalCredito + totalDebito;
  var totalVendas   = totalPix + totalCartao + totalDinheiro + totalMesa;
  var totalGeral    = totalVendas + Number(abertura.valorAbertura||0);
  var diferenca     = fisico > 0 ? (fisico - totalGeral) : 0;
  try { localStorage.removeItem('pw_caixa_' + estab?.id); } catch(e) {}
  pararAutoRefreshCaixa();
  _caixaAberto = false; _caixaAbertura = null; _caixaId = null;
  try { localStorage.removeItem('pw_caixa_' + estab.id); } catch(e) {} // limpa sessão
  var el = function(id){return document.getElementById(id);};
  if (el('caixa-status-card'))  el('caixa-status-card').style.background  = 'linear-gradient(135deg,#1a1a1a,#333)';
  if (el('caixa-status-label')) el('caixa-status-label').textContent       = '— Fechado —';
  if (el('caixa-status-hora'))  el('caixa-status-hora').textContent        = 'Fechado às ' + agora.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  if (el('caixa-status-icon'))  el('caixa-status-icon').textContent        = '🔒';
  if (el('caixa-abrir-card'))   el('caixa-abrir-card').style.display       = 'block';
  if (el('caixa-fechar-card'))  el('caixa-fechar-card').style.display      = 'none';
  // Salva no histórico local
  try {
    var hist = JSON.parse(localStorage.getItem('pw_caixa_hist_' + estab?.id) || '[]');
    var fisicoVal = parseFloat((document.getElementById('caixa-fisico')?.value||'0').replace(',','.')) || 0;
    var difVal    = fisicoVal > 0 ? (fisicoVal - totalGeral) : 0;
    hist.unshift({
      fechadoEm:      agora.toISOString(),
      operador:       abertura?.operador || 'Operador',
      obs:            document.getElementById('caixa-obs-fechamento')?.value || '',
      aberturaEm:     abertura?.hora || agora.toISOString(),
      valorAbertura:  Number(abertura?.valorAbertura || 0),
      totalPix:       totalPix,
      totalCredito:   totalCredito,
      totalDebito:    totalDebito,
      totalCartao:    totalCartao,
      totalDinheiro:  totalDinheiro,
      totalMesa:      totalMesa,
      totalVendas:    totalVendas,
      totalGeral:     totalGeral,
      fisico:         fisicoVal,
      diferenca:      difVal,
      numPedidos:     numPedidos,
    });
    if (hist.length > 20) hist = hist.slice(0, 20);
    localStorage.setItem('pw_caixa_hist_' + estab?.id, JSON.stringify(hist));
    renderHistoricoCaixa();
  } catch(e) {}

  showToast('🔒 Caixa fechado!');
  // Usa a função compartilhada de recibo (igual ao Reimprimir)
  var hRecibo = {
    operador:      abertura ? abertura.operador : 'Operador',
    aberturaEm:    abertura ? abertura.hora : agora.toISOString(),
    fechadoEm:     agora.toISOString(),
    valorAbertura: Number(abertura ? abertura.valorAbertura : 0),
    totalPix: totalPix, totalCredito: totalCredito, totalDebito: totalDebito,
    totalDinheiro: totalDinheiro, totalMesa: totalMesa,
    totalVendas: totalVendas, totalGeral: totalGeral,
    fisico: fisico, diferenca: diferenca,
    numPedidos: numPedidos, obs: obs,
  };
  var corpo = _gerarReciboCaixa(hRecibo, estab);
  var htmlComp = _gerarHtmlReciboCaixa(hRecibo, estab);
  var w = window.open('', '_blank', 'width=440,height=700');
  if (w) { w.document.write(htmlComp); w.document.close(); setTimeout(function(){w.print();},600); }
};

// Comprovante do cliente (estilo cupom)
window.imprimirComprovanteCliente = async function(id) {
  var res = await getSupa().from('pedidos').select('*').eq('id', id).maybeSingle();
  var p   = res?.data;
  if (!p) return;
  var estab   = getEstab();
  var itens   = Array.isArray(p.itens) ? p.itens : [];
  var fmtR    = function(v){return 'R$ ' + Number(v||0).toFixed(2).replace('.',',');};
  var numPed  = '#' + p.id.slice(-6).toUpperCase();
  var dt      = new Date(p.created_at);
  var dataFmt = dt.toLocaleDateString('pt-BR') + ' as ' + dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  var isEnt   = p.endereco && p.endereco !== 'Retirada no local' && !p.endereco.startsWith('No local');
  var cnpj    = estab?.cpf_cnpj ? 'CNPJ: ' + estab.cpf_cnpj : '';
  var tel     = estab?.telefone_contato || estab?.whatsapp || '';
  var end_    = estab?.endereco || '';
  var insta   = estab?.instagram ? 'Instagram: @' + estab.instagram.replace('@','') : '';
  var ttok    = estab?.tiktok    ? 'TikTok: @'    + estab.tiktok.replace('@','')    : '';
  var msgFim  = estab?.msg_nota  || 'Obrigado pela preferencia!';
  var pgto    = (p.pagamento || 'Nao informado').toUpperCase();
  var taxa    = Number(p.taxa_entrega||0);
  var total   = Number(p.total||0);
  var nl      = '\n';
  var sep     = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  var itensLinhas = itens.map(function(i) {
    var sub  = Number((i.preco||0)*(i.qtd||1)).toFixed(2).replace('.',',');
    var adds = Array.isArray(i.adicionais) && i.adicionais.length
      ? nl + '  + Adicionais: ' + i.adicionais.map(function(a){return a.nome;}).join(', ')
      : '';
    return (i.qtd||1) + 'x ' + (i.nome||'') + adds + nl + '   R$ ' + sub;
  }).join(nl + '─────────────────────────────────' + nl);
  var corpo = [
    '█████████████████████████████████',
    '        COMPROVANTE',
    '█████████████████████████████████',
    (estab?.nome || 'Estabelecimento').toUpperCase(),
    end_,
    tel  ? 'Tel: ' + tel : '',
    cnpj,
    insta,
    ttok,
    sep,
    'PEDIDO: ' + numPed,
    'Data:   ' + dataFmt,
    isEnt ? ('ENTREGA' + nl + 'End: ' + p.endereco) : 'RETIRADA NO LOCAL',
    sep,
    'CLIENTE: ' + (p.cliente_nome||'—'),
    p.cliente_whats ? 'WhatsApp: ' + p.cliente_whats : '',
    sep,
    'ITENS:',
    itensLinhas,
    sep,
    taxa > 0 ? 'Taxa entrega: ' + fmtR(taxa) : '',
    'TOTAL:  ' + fmtR(total),
    sep,
    'PAGAMENTO: ' + pgto,
    sep,
    msgFim,
    'Gerado em: ' + new Date().toLocaleString('pt-BR'),
  ].filter(function(l){return l !== '';}).join(nl);
  var htmlComp = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pedido ' + numPed + '</title>'
    + '<style>*{margin:0;padding:0;box-sizing:border-box}'
    + 'body{font-family:Courier New,monospace;font-size:13px;padding:16px;max-width:400px;margin:0 auto;background:#fff;color:#111}'
    + 'pre{white-space:pre-wrap;word-break:break-word;line-height:1.6}'
    + '@media print{body{padding:4px}@page{margin:4mm;size:80mm auto}}'
    + '</style></head><body><pre>' + corpo + '</pre></body></html>';
  var w = window.open('', '_blank', 'width=440,height=700');
  if (w) { w.document.write(htmlComp); w.document.close(); setTimeout(function(){w.print();},500); }
};

// ═══════════════════════════════════════════════════════════════════════════
// HISTÓRICO DE CAIXAS
// ═══════════════════════════════════════════════════════════════════════════
// ── Gera o corpo do recibo de fechamento (usado no fechamento e na reimpressão) ─
function _gerarReciboCaixa(h, estab) {
  var fmt = function(v){ return 'R$ ' + Number(v||0).toFixed(2).replace('.',','); };
  var nl  = '\n';
  var sep = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  var blk = '████████████████████████████████';
  var nome = (estab && estab.nome || 'Estabelecimento').toUpperCase();
  var end_ = estab && estab.endereco ? estab.endereco : '';
  var tel  = estab && (estab.telefone_contato || estab.whatsapp) ? (estab.telefone_contato || estab.whatsapp) : '';
  var cnpj = estab && estab.cpf_cnpj ? 'CNPJ: ' + estab.cpf_cnpj : '';
  var inst = estab && estab.instagram ? '@' + estab.instagram.replace('@','') : '';

  var dif     = Number(h.diferenca || 0);
  var temDif  = h.fisico > 0 && dif !== 0;
  var difLinha = '';
  if (temDif) {
    var sinal = dif < 0 ? '▼ FALTOU: ' : '▲ SOBROU: ';
    difLinha = [
      blk,
      '  ' + sinal + fmt(Math.abs(dif)),
      blk,
    ].join(nl);
  } else if (h.fisico > 0) {
    difLinha = '  ✔ CAIXA FECHADO CERTINHO!';
  }

  var linhas = [
    blk,
    '     FECHAMENTO DE CAIXA',
    blk,
    nome,
    end_, tel, cnpj, inst,
    sep,
    'Operador:   ' + (h.operador || '—'),
    'Abertura:   ' + new Date(h.aberturaEm||'').toLocaleString('pt-BR'),
    'Fechamento: ' + new Date(h.fechadoEm||'').toLocaleString('pt-BR'),
    sep,
    'FUNDO DE CAIXA INICIAL:  ' + fmt(h.valorAbertura||0),
    sep,
    '  RECEBIMENTOS DO PERÍODO',
    sep,
    '  PIX:            ' + fmt(h.totalPix||0),
    '  CARTÃO CRÉDITO: ' + fmt(h.totalCredito||0),
    '  CARTÃO DÉBITO:  ' + fmt(h.totalDebito||0),
    '  DINHEIRO:       ' + fmt(h.totalDinheiro||0),
    h.totalMesa > 0 ? '  MESA/LOCAL:     ' + fmt(h.totalMesa||0) : '',
    sep,
    '  SUBTOTAL VEND:  ' + fmt(h.totalVendas||0),
    '  FUNDO INICIAL:+ ' + fmt(h.valorAbertura||0),
    sep,
    '  TOTAL ESPERADO: ' + fmt(h.totalGeral||0),
    h.fisico > 0 ? '  FÍSICO CONTADO: ' + fmt(h.fisico) : '',
    sep,
    difLinha,
    sep,
    '  Nº DE PEDIDOS:  ' + (h.numPedidos||0),
    h.obs ? '  OBS: ' + h.obs : '',
    sep,
    'Gerado: ' + new Date(h.fechadoEm||'').toLocaleString('pt-BR'),
    sep,
    '     ** PEDIWAY **',
    '',
  ];
  return linhas.filter(function(l){ return l !== undefined && l !== null; }).join(nl);
}

// Reimprime comprovante de fechamento de um caixa histórico
window.reimprimirCaixa = function(idx) {
  try {
    var estab    = getEstab();
    var hist     = JSON.parse(localStorage.getItem('pw_caixa_hist_' + (estab&&estab.id)) || '[]');
    var h = hist[idx]; if (!h) return;
    var htmlComp = _gerarHtmlReciboCaixa(h, estab);
    var w = window.open('', '_blank', 'width=440,height=700');
    if (!w) return;
    w.document.write(htmlComp);
    w.document.close(); w.focus(); setTimeout(function(){ w.print(); }, 600);
  } catch(e) { console.error('reimprimirCaixa:', e); }
};

function renderHistoricoCaixa() {
  var estab = getEstab();
  var el    = document.getElementById('caixa-historico');
  if (!el) return;
  if (!estab || estab.id === 'demo') { el.innerHTML = '<div style="text-align:center;color:#aaa;font-size:.82rem;padding:24px">Nenhum registro ainda</div>'; return; }
  try {
    var hist = JSON.parse(localStorage.getItem('pw_caixa_hist_' + estab.id) || '[]');
    if (!hist.length) { el.innerHTML = '<div style="text-align:center;color:#aaa;font-size:.82rem;padding:24px">Nenhum fechamento registrado ainda</div>'; return; }
    var fmt = function(v){return 'R$ ' + Number(v||0).toFixed(2).replace('.',',');};
    var fmt2 = function(v){return 'R$ '+Number(v||0).toFixed(2).replace('.',',');};
    el.innerHTML = hist.map(function(h, i) {
      var dt  = new Date(h.fechadoEm).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
      var ab  = new Date(h.aberturaEm).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      var fe  = new Date(h.fechadoEm).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      var dif = Number(h.diferenca || 0);
      var temDif  = dif !== 0 && h.fisico > 0;
      var difCor  = dif < 0 ? '#dc2626' : '#16a34a';
      var difBg   = dif < 0 ? 'rgba(220,38,38,.1)' : 'rgba(22,163,74,.1)';
      var difIcon = dif < 0 ? '▼' : '▲';
      var difLbl  = dif < 0 ? 'Faltou' : 'Sobrou';
      var bord    = temDif && dif < 0 ? '#fecaca' : '#f0ebe4';
      var bg      = temDif && dif < 0 ? '#fff8f8' : '#fff';
      return '<div style="border:1.5px solid '+bord+';border-radius:12px;padding:14px;margin-bottom:8px;background:'+bg+'">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">'
        + '<div><div style="font-size:.8rem;font-weight:800">' + dt + '</div>'
        + '<div style="font-size:.72rem;color:#888;margin-top:2px">Operador: <b>' + (h.operador||'—') + '</b>'+(h.obs?' · '+h.obs:'')+'</div></div>'
        + (temDif ? '<div style="display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:50px;background:'+difBg+';border:1.5px solid '+difCor+'33">'
            + '<span style="font-size:1rem;color:'+difCor+'">'+difIcon+'</span>'
            + '<span style="font-size:.75rem;font-weight:900;color:'+difCor+'">'+difLbl+' '+fmt2(Math.abs(dif))+'</span>'
          + '</div>' : '')
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:.75rem">'
        + '<span style="color:#888">Turno:</span><span style="font-weight:700;text-align:right">' + ab + ' – ' + fe + '</span>'
        + '<span style="color:#888">PIX:</span><span style="font-weight:700;text-align:right">' + fmt2(h.totalPix) + '</span>'
        + '<span style="color:#888">Crédito:</span><span style="font-weight:700;text-align:right">' + fmt2(h.totalCredito||0) + '</span>'
        + '<span style="color:#888">Débito:</span><span style="font-weight:700;text-align:right">' + fmt2(h.totalDebito||0) + '</span>'
        + '<span style="color:#888">Dinheiro:</span><span style="font-weight:700;text-align:right">' + fmt2(h.totalDinheiro) + '</span>'
        + (h.totalMesa?'<span style="color:#888">Mesa:</span><span style="font-weight:700;text-align:right">' + fmt2(h.totalMesa) + '</span>':'')
        + '<span style="color:#888">Fundo inicial:</span><span style="font-weight:700;text-align:right">' + fmt2(h.valorAbertura) + '</span>'
        + (h.fisico?'<span style="color:#888">Físico contado:</span><span style="font-weight:700;color:'+difCor+';text-align:right">' + fmt2(h.fisico) + '</span>':'')
        + '<span style="color:#888">Pedidos:</span><span style="font-weight:700;text-align:right">' + (h.numPedidos||0) + '</span>'
        + '</div>'
        + '<div style="margin-top:10px;padding-top:8px;border-top:1px solid '+bord+';display:flex;justify-content:space-between;align-items:center">'
        + '<span style="font-size:.82rem;font-weight:800;color:#555">TOTAL EM CAIXA</span>'
        + '<div style="display:flex;align-items:center;gap:8px">'
        + '<button onclick="reimprimirCaixa('+i+')" style="background:none;border:1.5px solid #ddd;border-radius:6px;padding:3px 9px;font-size:.65rem;font-weight:700;color:#666;cursor:pointer">\ud83d\udda8 Reimprimir</button>'
        + '<span style="font-size:.92rem;font-weight:900;color:#16a34a">' + fmt2(h.totalGeral) + '</span>'
        + '</div></div></div>';
    }).join('');
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;color:#aaa;font-size:.82rem;padding:24px">Erro ao carregar histórico</div>';
  }
}
window.renderHistoricoCaixa = renderHistoricoCaixa;


// ══════════════════════════════════════════════════════════════════════
// KDS — Toggle, Links com botão Abrir, e funções globais
// ══════════════════════════════════════════════════════════════════════
window.renderKdsLinks = function(estab) {
  var sec  = document.getElementById('cfg-kds-section');
  var wrap = document.getElementById('cfg-kds-links');
  if (!estab) return;
  if (sec) sec.style.display = estab.usa_setores ? 'block' : 'none';
  if (!wrap || !estab.usa_setores) return;

  var slug = estab.slug || '';
  var EM   = {cozinha:'🍳',bar:'🥤',sobremesa:'🍰',cafeteria:'☕',grill:'🔥',padaria:'🥖',pizza:'🍕',sushi:'🍣',geral:'📋'};

  getSupa().from('produtos').select('setor').eq('estabelecimento_id', estab.id).eq('disponivel', true)
    .then(function(res) {
      var setores = res.error ? [] :
        [...new Set((res.data||[]).map(function(p){return p.setor;}).filter(Boolean).map(function(s){return s.toLowerCase();}))].sort();

      if (!setores.length) { wrap.innerHTML = ''; return; }

      wrap.innerHTML = '<div style="font-size:.65rem;color:#888;margin-bottom:4px">Setores disponíveis:</div>'
        + setores.map(function(s) {
          var url   = 'https://pediway.com.br/kds/' + s + '?loja=' + slug;
          var label = s.charAt(0).toUpperCase() + s.slice(1);
          return '<div style="display:flex;align-items:center;gap:8px;background:#faf8f5;border:1.5px solid var(--border);border-radius:10px;padding:9px 12px">'
            + '<span>' + (EM[s]||'🏷️') + '</span>'
            + '<div style="flex:1;min-width:0;font-size:.78rem;font-weight:700;color:#333">' + label + '</div>'
            + '<a href="' + url + '" target="_blank" style="background:#1a1a1a;color:#fff;border:none;border-radius:7px;padding:6px 12px;font-family:Poppins,sans-serif;font-size:.7rem;font-weight:800;cursor:pointer;text-decoration:none;flex-shrink:0">Abrir</a>'
            + '</div>';
        }).join('');
    });
};

// Abre o KDS detectando o primeiro setor disponível
window.abrirKdsPaineis = async function() {
  var estab = getEstab();
  if (!estab) return;
  var slug = estab.slug || '';
  try {
    var res = await getSupa().from('produtos').select('setor').eq('estabelecimento_id', estab.id).eq('disponivel', true);
    var setores = res.error ? [] :
      [...new Set((res.data||[]).map(function(p){return p.setor;}).filter(Boolean).map(function(s){return s.toLowerCase()}))];
    var setor = setores.length ? setores[0] : 'geral';
    window.open('https://pediway.com.br/kds/' + setor + '?loja=' + slug, '_blank');
  } catch(e) {
    window.open('https://pediway.com.br/kds/geral?loja=' + slug, '_blank');
  }
};

window.abrirKdsCustom = function() {
  var inp = document.getElementById('kds-setor-custom');
  var estab = getEstab();
  if (!inp || !estab) return;
  var s = (inp.value||'').trim().toLowerCase();
  if (!s) { showToast('Digite o nome do setor.', 'error'); return; }
  var url = 'https://pediway.com.br/kds/' + s + '?loja=' + (estab.slug||'');
  window.open(url, '_blank');
};

window.toggleUsaSetores = async function(checked) {
  var estab = getEstab(); if (!estab) return;
  var tr = document.getElementById('kds-track'), th = document.getElementById('kds-thumb');
  if (tr) tr.style.background = checked ? '#E8001C' : '#ddd';
  if (th) th.style.transform  = checked ? 'translateX(20px)' : 'translateX(0)';
  try {
    var res = await getSupa().from('estabelecimentos').update({usa_setores: checked}).eq('id', estab.id);
    if (res.error) throw res.error;
    var sec = document.getElementById('cfg-kds-section');
    if (sec) sec.style.display = checked ? 'block' : 'none';
    try {
      var o = JSON.parse(localStorage.getItem('pw_estab') || '{}');
      o.usa_setores = checked;
      localStorage.setItem('pw_estab', JSON.stringify(o));
      if (window._estab) window._estab.usa_setores = checked;
    } catch(e) {}
    if (checked) { try { window.renderKdsLinks(estab); } catch(e) {} }
    showToast(checked ? '🍳 KDS ativado!' : 'KDS desativado');
  } catch(e) {
    showToast('⚠️ Execute o SQL no Supabase primeiro.', 'error');
    var chk = document.getElementById('cfg-usa-setores');
    if (chk) { chk.checked = !checked; if (tr) tr.style.background = !checked?'#E8001C':'#ddd'; if (th) th.style.transform = !checked?'translateX(20px)':'translateX(0)'; }
  }
};


// ══════════════════════════════════════════════════════════════════════════════
// ✨ CARDÁPIO EM SEGUNDOS — Scanner IA (multi-foto, compressão agressiva)
// ══════════════════════════════════════════════════════════════════════════════

var _iaFotos = []; // [{base64, mimeType, preview}]
var _iaItens = [];
var _iaAdicionais = []; // grupos de adicionais detectados

window.abrirScannerIA = function() {
  const m = document.getElementById('modal-scanner-ia');
  if (m) { m.style.display = 'flex'; iaReset(); }
};
window.fecharScannerIA = function() {
  const m = document.getElementById('modal-scanner-ia');
  if (m) m.style.display = 'none';
};

function ia$(id) { return document.getElementById(id) || {}; }

function iaReset() {
  _iaFotos = []; _iaItens = []; _iaAdicionais = [];
  ia$('ia-upload-zone').style.display = 'block';
  ia$('ia-thumbs').innerHTML = '';
  ia$('ia-thumbs').style.display = 'none';
  ia$('ia-btn-analisar').style.display = 'none';
  ia$('ia-loading').style.display = 'none';
  ia$('ia-resultados').style.display = 'none';
  ia$('ia-erro').style.display = 'none';
  ia$('ia-lista-itens').innerHTML = '';
  const inp = document.getElementById('ia-file-input');
  if (inp) inp.value = '';
}

window.iaHandleDrop = function(e) {
  e.preventDefault();
  ia$('ia-upload-zone').style.borderColor = '#d4d4f9';
  const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
  files.forEach(iaCarregarArquivo);
};

window.iaPreviewImagem = function(input) {
  const files = [...(input.files || [])].filter(f => f.type.startsWith('image/'));
  files.forEach(iaCarregarArquivo);
};

// Comprime a imagem no canvas (portrait-first, max 900px, qualidade 0.78)
function comprimirImagem(file, cb) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const MAX = 900;
      let w = img.width, h = img.height;
      // Mantém orientação vertical (portrait)
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      if (h > MAX * 2) { w = Math.round(w * (MAX * 2) / h); h = MAX * 2; } // max 900x1800
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/jpeg', 0.78);
      const b64 = compressed.split(',')[1];
      const kb = Math.round(b64.length * 0.75 / 1024);
      console.log('Foto comprimida:', kb + 'KB', w + 'x' + h);
      cb({ base64: b64, mimeType: 'image/jpeg', preview: compressed, kb });
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function iaCarregarArquivo(file) {
  comprimirImagem(file, function(foto) {
    if (foto.kb > 2000) {
      showToast('⚠️ Foto ' + Math.round(foto.kb/1024*10)/10 + 'MB ainda grande. Use foto menor.', 'error');
      return;
    }
    _iaFotos.push(foto);
    iaMostrarThumbs();
  });
}

function iaMostrarThumbs() {
  const zone = ia$('ia-upload-zone');
  const thumbsWrap = ia$('ia-thumbs');
  zone.style.display = _iaFotos.length < 6 ? 'block' : 'none'; // permite até 6 fotos
  thumbsWrap.style.display = 'flex';
  thumbsWrap.innerHTML = _iaFotos.map(function(f, i) {
    return '<div style="position:relative;flex-shrink:0">'
      + '<img src="' + f.preview + '" style="height:90px;width:60px;object-fit:cover;border-radius:8px;border:2px solid #c7d2fe;display:block">'
      + '<div style="position:absolute;bottom:2px;left:0;right:0;text-align:center;font-size:9px;background:rgba(0,0,0,.5);color:#fff;border-radius:0 0 6px 6px;padding:1px">' + f.kb + 'KB</div>'
      + '<button onclick="iaRemoverFoto(' + i + ')" style="position:absolute;top:-6px;right:-6px;background:#E8001C;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:.6rem;cursor:pointer;line-height:18px;text-align:center;padding:0">✕</button>'
      + '</div>';
  }).join('');
  ia$('ia-btn-analisar').style.display = _iaFotos.length > 0 ? 'block' : 'none';
  ia$('ia-btn-analisar').textContent = _iaFotos.length > 1
    ? '✨ Analisar ' + _iaFotos.length + ' fotos com IA'
    : '✨ Analisar com IA';
}

window.iaRemoverFoto = function(i) {
  _iaFotos.splice(i, 1);
  iaMostrarThumbs();
};

window.analisarCardapioIA = async function() {
  if (!_iaFotos.length) return;
  ia$('ia-btn-analisar').style.display = 'none';
  ia$('ia-loading').style.display = 'block';
  ia$('ia-erro').style.display = 'none';
  ia$('ia-resultados').style.display = 'none';
  _iaItens = [];

  const loadTxt = ia$('ia-loading-txt');

  for (let i = 0; i < _iaFotos.length; i++) {
    if (loadTxt && loadTxt.textContent !== undefined)
      loadTxt.textContent = _iaFotos.length > 1
        ? 'Analisando foto ' + (i+1) + ' de ' + _iaFotos.length + '...'
        : 'Analisando cardápio com IA...';
    try {
      const rawText = await (await fetch('/api/scan-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: _iaFotos[i].base64, mimeType: 'image/jpeg' })
      })).text();

      let json;
      try { json = JSON.parse(rawText); }
      catch(e) { throw new Error('Servidor: ' + rawText.slice(0, 100)); }
      if (json.error) throw new Error(json.error);

      const novos = (json.itens || []).map(function(it, j) {
        return { ...it, _id: i * 1000 + j, _sel: true };
      });
      // Evita duplicatas pelo nome
      novos.forEach(function(n) {
        const dup = _iaItens.find(function(x) { return x.nome?.toLowerCase() === n.nome?.toLowerCase(); });
        if (!dup) _iaItens.push(n);
      });
      // Guarda adicionais detectados
      if (json.adicionais && json.adicionais.length) {
        json.adicionais.forEach(function(grupo) {
          const existente = _iaAdicionais.find(function(g) { return g.grupo === grupo.grupo; });
          if (!existente) _iaAdicionais.push({ ...grupo, _sel: true });
        });
      }
    } catch(e) {
      ia$('ia-loading').style.display = 'none';
      ia$('ia-btn-analisar').style.display = 'block';
      const err = ia$('ia-erro');
      err.style.display = 'block';
      err.textContent = '❌ Foto ' + (i+1) + ': ' + e.message;
      return;
    }
  }

  ia$('ia-loading').style.display = 'none';
  ia$('ia-resultados').style.display = 'block';
  ia$('ia-count').textContent = _iaItens.length
    + (_iaAdicionais.length ? ' + ' + _iaAdicionais.length + ' grupo(s) adicional' : '');
  iaRenderLista();
};

function iaRenderLista() {
  const lista = ia$('ia-lista-itens');
  if (!lista || lista.innerHTML === undefined) return;
  lista.innerHTML = _iaItens.map(function(it) {
    const preco = it.preco > 0 ? 'R$ ' + Number(it.preco).toFixed(2).replace('.', ',') : '—';
    return '<label style="display:flex;align-items:flex-start;gap:10px;background:#f8f8ff;border:1.5px solid '
      + (it._sel ? '#ffcccc' : '#f0f0f0') + ';border-radius:10px;padding:10px 12px;cursor:pointer">'
      + '<input type="checkbox" data-iaid="' + it._id + '" '
      + (it._sel ? 'checked' : '')
      + ' onchange="iaToggleItem(' + it._id + ',this.checked)" style="margin-top:3px;accent-color:#E8001C;flex-shrink:0">'
      + '<div style="flex:1;min-width:0">'
      + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;flex-wrap:wrap">'
      + '<span>' + (it.emoji || '🍽️') + '</span>'
      + '<span style="font-size:.83rem;font-weight:800;color:#111">' + it.nome + '</span>'
      + '<span style="background:#e0e7ff;color:#E8001C;font-size:.56rem;font-weight:800;padding:1px 7px;border-radius:50px;margin-left:auto">'
      + (it.categoria || 'OUTROS') + '</span></div>'
      + (it.descricao ? '<div style="font-size:.7rem;color:#888;margin-bottom:3px">' + it.descricao + '</div>' : '')
      + '<div style="font-size:.75rem;font-weight:700;color:#E8001C">' + preco + '</div>'
      + '</div></label>';
  }).join('');
}

window.iaToggleItem = function(id, checked) {
  const it = _iaItens.find(function(x) { return x._id === id; });
  if (it) it._sel = checked;
};

window.iaSelecionarTodos = function() {
  _iaItens.forEach(function(it) { it._sel = true; });
  ia$('ia-lista-itens').querySelectorAll('input[type=checkbox]').forEach(function(cb) { cb.checked = true; });
};

window.iaAdicionarSelecionados = async function() {
  const estab = getEstab(); if (!estab) return;
  const sel = _iaItens.filter(function(it) { return it._sel; });
  if (!sel.length) return showToast('Selecione pelo menos um item.');

  const btn = document.querySelector('#modal-scanner-ia button[onclick="iaAdicionarSelecionados()"]');
  if (btn) { btn.textContent = 'Adicionando...'; btn.disabled = true; }

  let ok = 0, erros = 0;

  // 1. Adiciona os itens principais
  for (const it of sel) {
    try {
      const { error } = await getSupa().from('produtos').insert({
        estabelecimento_id: estab.id,
        nome:       String(it.nome || '').slice(0, 120),
        categoria:  String(it.categoria || 'OUTROS').toUpperCase().slice(0, 40),
        descricao:  String(it.descricao || '').slice(0, 200),
        emoji:      String(it.emoji || '🍽️').slice(0, 10),
        preco:      Number(it.preco) || 0,
        disponivel: true,
        promocao:   false,
      });
      if (error) erros++; else ok++;
    } catch(e) { erros++; }
  }

  // 2. Cria grupos de adicionais com opcoes[] — estrutura correta do banco
  let okAdic = 0;
  const adicSel = _iaAdicionais.filter(function(g) { return g._sel !== false; });
  for (const grupo of adicSel) {
    try {
      // opcoes é um array JSONB: [{nome, preco}, ...]
      const opcoes = (grupo.itens || []).map(function(it) {
        return {
          nome:  String(it.nome || '').slice(0, 80),
          preco: Number(it.preco) || 0,
        };
      });
      if (!opcoes.length) continue;

      const { error } = await getSupa()
        .from('grupos_adicionais')
        .insert({
          estabelecimento_id: estab.id,
          nome:   String(grupo.grupo || 'Adicionais').slice(0, 60),
          min:    0,
          max:    opcoes.length,
          opcoes: opcoes,
        });
      if (error) throw error;
      okAdic++;
    } catch(e) { console.error('[IA] Erro grupo adicional:', e.message); }
  }

  fecharScannerIA();
  let msg = '✅ ' + ok + ' itens criados';
  if (okAdic > 0) msg += ' + ' + okAdic + ' grupo(s) de adicionais';
  if (erros) msg += ' — ' + erros + ' erro(s)';
  msg += '! Cardápio pronto 🎉';
  showToast(msg, 4000);
  setTimeout(function() {
    const cardapioTab = document.querySelector('[data-tab="cardapio"]');
    if (cardapioTab) cardapioTab.click();
  }, 600);
};


// ════════════════════════════════════════════════════════════════════════════
// PEDI-AI v2 — Executa ações REAIS no Supabase
// ════════════════════════════════════════════════════════════════════════════

var _paiOpen    = false;
var _paiHistory = [];  // histórico da conversa
var _paiCtxSent = false;

window.togglePediAI = function() {
  _paiOpen = !_paiOpen;
  const modal = document.getElementById('pedi-ai-modal');
  if (modal) modal.classList.toggle('show', _paiOpen);
  if (_paiOpen && !_paiCtxSent) _paiBoasVindas();
};

async function _paiBoasVindas() {
  _paiCtxSent = true;
  const estab = getEstab();
  const nome = estab?.nome ? ' da **' + estab.nome + '**' : '';
  _paiAddMsg('ai',
    'Olá! Sou a **PEDI-AI** ✦, sua consultora exclusiva' + nome + '!\n\n' +
    'Posso analisar seus produtos, sugerir preços, ajustar a loja, dar dicas de negócio e muito mais — tudo com base nos dados reais da sua loja.\n\n' +
    'O que você quer fazer?'
  );
  _paiChips([
    '📊 Analisar meu cardápio completo',
    '💰 Sugerir melhorias de preço',
    '🔓 Abrir/fechar loja',
    '🚀 Dicas para vender mais',
    '⚙️ Ajustar configurações da loja',
    '🧾 Analisar nota fiscal'
  ]);
}

// ── Mensagens ────────────────────────────────────────────────────────────────
function _paiAddMsg(tipo, texto, actions) {
  const msgs = document.getElementById('pai-messages');
  if (!msgs) return;
  msgs.querySelector('.pai-typing')?.remove();
  const div = document.createElement('div');
  div.className = 'pai-msg pai-msg-' + tipo;
  div.innerHTML = texto.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
  msgs.appendChild(div);

  // Botões de ação confirmáveis
  if (actions?.length && tipo === 'ai') {
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px';
    actions.forEach(function(a) {
      const b = document.createElement('button');
      b.style.cssText = 'background:var(--red);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-family:Poppins,sans-serif;font-size:.75rem;font-weight:800;cursor:pointer';
      b.textContent = '✓ Confirmar';
      b.onclick = async function() {
        btns.remove();
        await _paiExecutarActions(actions);
      };
      btns.appendChild(b);
      const c2 = document.createElement('button');
      c2.style.cssText = 'background:none;border:1.5px solid #ddd;border-radius:8px;padding:7px 14px;font-family:Poppins,sans-serif;font-size:.75rem;font-weight:700;cursor:pointer;color:#888';
      c2.textContent = 'Cancelar';
      c2.onclick = function() { btns.remove(); _paiAddMsg('ai','Ok, cancelei! Posso ajudar com mais alguma coisa?'); };
      btns.appendChild(c2);
    });
    msgs.appendChild(btns);
  }
  msgs.scrollTop = msgs.scrollHeight;
}

function _paiTyping() {
  const msgs = document.getElementById('pai-messages');
  if (!msgs) return;
  const d = document.createElement('div');
  d.className = 'pai-typing';
  d.innerHTML = '<div class="pai-dot"></div><div class="pai-dot"></div><div class="pai-dot"></div>';
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
}

function _paiChips(opts) {
  const msgs = document.getElementById('pai-messages');
  if (!msgs) return;
  const wrap = document.createElement('div');
  wrap.className = 'pai-chips-wrap';
  opts.forEach(function(op) {
    const b = document.createElement('button');
    b.className = 'pai-chip';
    b.textContent = op;
    b.onclick = function() { wrap.remove(); _paiEnviar(op); };
    wrap.appendChild(b);
  });
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

window.enviarPediAI = function() {
  const inp = document.getElementById('pai-input');
  if (!inp) return;
  const t = inp.value.trim();
  if (!t) return;
  inp.value = '';
  _paiEnviar(t);
};

// Renderiza análise de cardápio
function _paiRenderAnalise(analise) {
  const msgs = document.getElementById('pai-messages');
  if (!msgs || !analise) return;
  const fmt = v => 'R$ ' + Number(v||0).toFixed(2).replace('.',',');
  let html = '<div style="background:#f8f8f8;border:1.5px solid #eee;border-radius:12px;padding:12px;margin-top:6px;font-size:.78rem">';

  if (analise.resumo) {
    html += '<div style="font-weight:800;color:#222;margin-bottom:8px">📊 Análise do cardápio</div>';
    html += '<div style="color:#555;line-height:1.6;margin-bottom:10px">' + analise.resumo + '</div>';
  }
  if (analise.destaques?.length) {
    html += '<div style="font-weight:700;color:#16a34a;margin-bottom:4px">✅ Pontos positivos</div>';
    analise.destaques.forEach(d => { html += '<div style="color:#333;padding:2px 0 2px 10px;border-left:3px solid #16a34a;margin-bottom:4px">' + d + '</div>'; });
  }
  if (analise.melhorias?.length) {
    html += '<div style="font-weight:700;color:#d97706;margin-bottom:4px;margin-top:8px">⚡ Oportunidades</div>';
    analise.melhorias.forEach(m => { html += '<div style="color:#333;padding:2px 0 2px 10px;border-left:3px solid #f59e0b;margin-bottom:4px">' + m + '</div>'; });
  }
  if (analise.produtos?.length) {
    html += '<div style="font-weight:700;color:#111;margin-top:10px;margin-bottom:6px">💰 Sugestões de preço</div>';
    html += '<div style="display:flex;flex-direction:column;gap:4px">';
    analise.produtos.forEach(p => {
      const sobe = p.preco_sugerido > p.preco_atual;
      const cor = sobe ? '#16a34a' : '#dc2626';
      html += '<div style="background:#fff;border-radius:8px;padding:7px 10px;display:flex;justify-content:space-between;align-items:center;gap:8px">'
        + '<div style="flex:1;min-width:0"><div style="font-weight:700;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + p.nome + '</div>'
        + (p.motivo ? '<div style="color:#888;font-size:.7rem">' + p.motivo + '</div>' : '')
        + '</div>'
        + '<div style="text-align:right;flex-shrink:0">'
        + '<div style="color:#aaa;text-decoration:line-through;font-size:.7rem">' + fmt(p.preco_atual) + '</div>'
        + '<div style="color:' + cor + ';font-weight:800">' + fmt(p.preco_sugerido) + '</div>'
        + '</div></div>';
    });
    html += '</div>';
  }
  html += '</div>';
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

// Renderiza análise de nota fiscal
function _paiRenderFiscal(itens) {
  const msgs = document.getElementById('pai-messages');
  if (!msgs || !itens?.length) return;
  const fmt = v => 'R$ ' + Number(v||0).toFixed(2).replace('.',',');
  let html = '<div style="background:#f8f8f8;border:1.5px solid #eee;border-radius:12px;padding:12px;margin-top:6px;font-size:.78rem">';
  html += '<div style="font-weight:800;color:#222;margin-bottom:8px">🧾 Análise da nota fiscal</div>';
  html += '<div style="display:flex;flex-direction:column;gap:4px">';
  itens.forEach(it => {
    html += '<div style="background:#fff;border-radius:8px;padding:8px 10px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center">'
      + '<span style="font-weight:700;color:#222">' + it.ingrediente + '</span>'
      + '<span style="color:#888;font-size:.7rem">' + fmt(it.custo_unitario) + '/' + (it.unidade||'un') + '</span>'
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;margin-top:3px">'
      + '<span style="color:#555">Venda sugerida:</span>'
      + '<span style="color:#16a34a;font-weight:800">' + fmt(it.preco_venda_sugerido) + '</span>'
      + '</div></div>';
  });
  html += '</div></div>';
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

// Analisa nota fiscal/fatura enviada como imagem
window.paiEnviarNota = function(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  _paiAddMsg('user', '📄 Enviando nota fiscal para análise...');
  _paiTyping();
  const reader = new FileReader();
  reader.onload = async function(e) {
    const b64 = e.target.result.split(',')[1];
    // Comprime se muito grande
    const img = new Image();
    img.onload = async function() {
      const MAX = 1200;
      let w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h*MAX/w); w = MAX; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
      try {
        const estab = getEstab();
        const { data: prods } = await getSupa().from('produtos').select('id,nome,preco,categoria').eq('estabelecimento_id', estab.id).limit(20);
        const raw = await (await fetch('/api/pedi-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: compressed,
            imagePrompt: 'Analise esta nota fiscal. Produtos do cardápio: ' + JSON.stringify((prods||[]).map(function(p){return p.nome+' (R$'+p.preco+')';})) + '. Calcule margens e sugira preços de venda com 65% de margem.',
            messages: [],
            context: { estab: { nome: estab.nome, tipo: estab.tipo_estabelecimento } }
          })
        })).text();
        let json; try { json = JSON.parse(raw); } catch(e) { throw new Error(raw.slice(0,100)); }
        if (json.error) throw new Error(json.error);
        _paiAddMsg('ai', json.resposta || 'Análise concluída!');
        // Mostra tabela de análise fiscal
        if (json.analise_fiscal?.length) {
          _paiMostraAnalise(json.analise_fiscal);
        }
      } catch(e) {
        _paiAddMsg('ai', '❌ Erro na análise: ' + e.message);
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

function _paiMostraAnalise(analise) {
  const msgs = document.getElementById('pai-messages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.style.cssText = 'background:#fff8f8;border:1.5px solid #ffcccc;border-radius:10px;padding:10px 12px;margin-top:4px;font-size:.75rem';
  div.innerHTML = '<div style="font-size:.72rem;font-weight:800;color:#333;margin-bottom:8px">📊 Análise de Custos</div>'
    + analise.slice(0,10).map(function(it) {
        const sugerido = it.preco_venda_sugerido > 0
          ? ' → <strong style="color:var(--red)">Venda: R$ '+Number(it.preco_venda_sugerido).toFixed(2).replace('.',',')+'</strong>' : '';
        return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #fff0f0">'
          + '<span style="flex:1;font-weight:600">'+it.ingrediente+'</span>'
          + '<span style="color:#888">R$ '+Number(it.custo_unitario||0).toFixed(2).replace('.',',')+'</span>'
          + sugerido
          + '<span style="background:#dcfce7;color:#16a34a;font-size:.6rem;font-weight:800;padding:1px 6px;border-radius:50px">'+it.margem+'</span>'
          + '</div>';
      }).join('');
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

// ── Envio para API e execução ─────────────────────────────────────────────────
async function _paiEnviar(texto) {
  _paiAddMsg('user', texto);
  _paiTyping();
  _paiHistory.push({ role:'user', content: texto });
  if (_paiHistory.length > 12) _paiHistory = _paiHistory.slice(-12);

  const estab = getEstab();

  try {
    // Busca produtos para contexto
    const { data: prods } = await getSupa().from('produtos').select('id,nome,preco,categoria,disponivel,setor').eq('estabelecimento_id', estab.id).limit(30);

    // Estatísticas rápidas dos produtos
    const prodsAtivos   = (prods||[]).filter(p => p.disponivel);
    const prodsInativos = (prods||[]).filter(p => !p.disponivel);
    const semDescricao  = (prods||[]).filter(p => !p.descricao);
    const precoMedio    = prodsAtivos.length ? (prodsAtivos.reduce((s,p)=>s+Number(p.preco||0),0)/prodsAtivos.length).toFixed(2) : 0;
    const categorias    = [...new Set((prods||[]).map(p=>p.categoria).filter(Boolean))];

    const raw = await (await fetch('/api/pedi-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: _paiHistory,
        context: {
          estab: {
            id: estab.id,
            nome: estab.nome,
            cidade: estab.cidade,
            estado: estab.estado,
            endereco: estab.endereco,
            taxa_entrega: estab.taxa_entrega,
            pedido_minimo: estab.pedido_minimo,
            whatsapp: estab.whatsapp,
            instagram: estab.instagram,
            loja_aberta: estab.loja_aberta,
            tipo_estabelecimento: estab.tipo_estabelecimento || estab.tipo_estab,
            descricao: estab.descricao
          },
          produtos: (prods||[]).map(p => ({
            id: p.id, nome: p.nome, preco: p.preco,
            categoria: p.categoria, disponivel: p.disponivel,
            descricao: p.descricao || null, setor: p.setor,
            tem_foto: !!(p.foto_url || (p.fotos_urls && p.fotos_urls.length))
          })),
          resumo: {
            total_produtos: (prods||[]).length,
            ativos: prodsAtivos.length,
            inativos: prodsInativos.length,
            sem_descricao: semDescricao.length,
            preco_medio: Number(precoMedio),
            categorias: categorias
          }
        }
      })
    })).text();

    let json; try { json = JSON.parse(raw); } catch(e) { throw new Error('Erro de comunicação com a IA.'); }
    if (json.error) throw new Error(json.error);

    const resposta = json.resposta || 'Pronto!';
    _paiHistory.push({ role:'assistant', content: resposta });

    const actions = json.actions || [];

    if (json.pergunta && actions.length) {
      _paiAddMsg('ai', resposta + '\n\n' + json.pergunta, actions);
    } else if (actions.length) {
      _paiAddMsg('ai', resposta);
      await _paiExecutarActions(actions);
    } else {
      _paiAddMsg('ai', resposta);
    }

    // Renderiza análise de cardápio se vier
    if (json.analise) {
      _paiRenderAnalise(json.analise);
    }

    // Renderiza análise fiscal se vier
    if (json.analise_fiscal?.length) {
      _paiRenderFiscal(json.analise_fiscal);
    }

  } catch(e) {
    _paiAddMsg('ai', '❌ ' + (e.message || 'Erro. Tente novamente.'));
  }
}

// ── Mapa: campo Supabase → ID do input na tela ───────────────────────────────
var _PAI_CAMPO_UI = {
  'nome':            'cfg-nome',
  'descricao':       'cfg-desc',
  'slug':            'cfg-slug',
  'whatsapp':        'cfg-whats',
  'cidade':          'cfg-cidade',
  'estado':          'cfg-estado',
  'endereco':        'cfg-endereco',
  'taxa_entrega':    'cfg-taxa',
  'pedido_minimo':   'cfg-pedido-min',
  'instagram':       'cfg-instagram',
  'tiktok':          'cfg-tiktok',
  'site':            'cfg-site',
  'telefone':        'cfg-telefone',
};

// ── Executor de ações no Supabase ─────────────────────────────────────────────
async function _paiExecutarActions(actions) {
  // Garante que temos o estabelecimento com ID
  var estab = getEstab();
  if (!estab || !estab.id) {
    _paiAddMsg('ai', '❌ Não encontrei sua loja. Tente recarregar a página.');
    return;
  }

  var ok = 0, erros = 0, msgs = [];

  for (var i = 0; i < actions.length; i++) {
    var a = actions[i];
    try {
      // ── update_estab: atualiza campo da loja ──────────────────────────────
      if (a.type === 'update_estab') {
        var upd = {};
        // Coerce tipos corretamente
        var val = a.valor;
        if (a.campo === 'taxa_entrega' || a.campo === 'pedido_minimo') {
          val = parseFloat(String(val).replace(',', '.')) || 0;
        }
        upd[a.campo] = val;

        var res = await getSupa().from('estabelecimentos').update(upd).eq('id', estab.id);
        if (res.error) throw new Error(res.error.message);

        // Atualiza localStorage e estado global
        try {
          var stored = JSON.parse(localStorage.getItem('pw_estab') || '{}');
          stored[a.campo] = val;
          localStorage.setItem('pw_estab', JSON.stringify(stored));
          if (window._estab) window._estab[a.campo] = val;
        } catch(ex) {}

        // Atualiza o campo na tela IMEDIATAMENTE
        var inputId = _PAI_CAMPO_UI[a.campo];
        if (inputId) {
          var el = document.getElementById(inputId);
          if (el) el.value = val;
        }

        ok++;
        msgs.push('✓ ' + a.campo.replace(/_/g,' ') + ' → ' + val);

      // ── toggle_loja: abre/fecha loja ──────────────────────────────────────
      } else if (a.type === 'toggle_loja') {
        var aberta = (a.valor === true || a.valor === 'true' || a.valor === 'aberta' || a.valor === 1);
        var res2 = await getSupa().from('estabelecimentos').update({ loja_aberta: aberta }).eq('id', estab.id);
        if (res2.error) throw new Error(res2.error.message);

        try {
          var stored2 = JSON.parse(localStorage.getItem('pw_estab') || '{}');
          stored2.loja_aberta = aberta;
          localStorage.setItem('pw_estab', JSON.stringify(stored2));
          if (window._estab) window._estab.loja_aberta = aberta;
        } catch(ex) {}

        // Atualiza toggle visual (o botão "Aberto/Fechado")
        var togAberto = document.getElementById('cfg-aberto');
        if (togAberto) { togAberto.checked = aberta; togAberto.dispatchEvent(new Event('change')); }
        var badge = document.getElementById('loja-status-badge');
        if (badge) {
          badge.textContent = aberta ? 'Aberta' : 'Fechada';
          badge.className = 'loja-status-badge ' + (aberta ? 'loja-aberta' : 'loja-fechada');
        }
        ok++;
        msgs.push(aberta ? '✓ Loja aberta' : '✓ Loja fechada');

      // ── update_produto: atualiza campo de produto ─────────────────────────
      } else if (a.type === 'update_produto') {
        if (!a.produto_id) { erros++; continue; }
        var updP = {};
        var valP = a.campo === 'preco' ? (parseFloat(String(a.valor).replace(',','.')) || 0) : a.valor;
        updP[a.campo] = valP;
        var resP = await getSupa().from('produtos').update(updP).eq('id', a.produto_id).eq('estabelecimento_id', estab.id);
        if (resP.error) throw new Error(resP.error.message);
        ok++;
        msgs.push('✓ ' + (a.produto_nome||'Produto') + ' atualizado');

      // ── toggle_produto: ativa/desativa produto ────────────────────────────
      } else if (a.type === 'toggle_produto') {
        if (!a.produto_id) { erros++; continue; }
        var dispP = (a.valor === true || a.valor === 'true');
        var resTP = await getSupa().from('produtos').update({ disponivel: dispP }).eq('id', a.produto_id).eq('estabelecimento_id', estab.id);
        if (resTP.error) throw new Error(resTP.error.message);
        ok++;
        msgs.push((dispP ? '✓ Ativado: ' : '✓ Desativado: ') + (a.produto_nome||'Produto'));
      }

    } catch(e) {
      erros++;
      console.error('[PEDI-AI] Erro na action:', a, e.message);
    }
  }

  // Feedback visual
  if (ok > 0) {
    var feedbackMsg = '✅ ' + (ok === 1 ? 'Alteração feita!' : ok + ' alterações feitas!');
    if (erros) feedbackMsg += ' (' + erros + ' erro(s))';
    feedbackMsg += '\n\nPrecisa de mais alguma coisa?';
    _paiAddMsg('ai', feedbackMsg);

    // Recarrega seção de configurações se estiver aberta
    setTimeout(function() {
      try { if (typeof carregarEstadosDash === 'function') carregarEstadosDash(); } catch(e) {}
      try { if (typeof renderProdutos === 'function') renderProdutos(); } catch(e) {}
    }, 800);
  } else if (erros > 0) {
    _paiAddMsg('ai', '❌ Não consegui fazer as alterações. Verifique sua conexão e tente novamente.\nSe o problema persistir, ajuste manualmente nas Configurações.');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ONBOARDING — Primeiros passos para novos usuários
// ════════════════════════════════════════════════════════════════════════════

var _obStep   = 1;
var _obDados  = {};
var _obTipos  = [
  {em:'🍔',nm:'Hamburgueria',val:'hamburgueria'},
  {em:'🍕',nm:'Pizzaria',val:'pizzaria'},
  {em:'🍽️',nm:'Restaurante',val:'restaurante'},
  {em:'🥤',nm:'Bar / Drinks',val:'bar'},
  {em:'🥖',nm:'Padaria',val:'padaria'},
  {em:'☕',nm:'Cafeteria',val:'cafeteria'},
  {em:'🍣',nm:'Japonês',val:'japones'},
  {em:'🌮',nm:'Lanches',val:'lanchonete'},
  {em:'🛒',nm:'Outro',val:'outro'},
];

function verificarOnboarding(estab) {
  // Aparece UMA ÚNICA VEZ — verifica APENAS o localStorage (não o banco)
  // Isso garante que qualquer conta nova vai ver o popup
  const chave = 'pw_ob_' + estab.id;
  if (localStorage.getItem(chave)) return; // já viu antes neste browser
  // Marca como visto IMEDIATAMENTE para não repetir
  localStorage.setItem(chave, '1');
  // Mostra após o dashboard carregar completamente
  setTimeout(function() { mostrarOnboarding(estab); }, 1200);
}

function mostrarOnboarding(estab) {
  _obStep  = 1;
  _obDados = { nome: estab.nome || '', id: estab.id };
  const modal = document.getElementById('onboarding-modal');
  if (modal) { modal.classList.add('show'); renderObStep(1); }
}

function renderObStep(step) {
  _obStep = step;
  const title    = document.getElementById('ob-title');
  const subtitle = document.getElementById('ob-subtitle');
  const body     = document.getElementById('ob-body');
  const dots     = [1,2,3].map(function(i) { return document.getElementById('ob-dot-'+i); });

  dots.forEach(function(d,i) {
    if(!d) return;
    d.classList.toggle('active', i+1 === step);
  });

  const prog = Math.round((step-1)/2*100);

  if (step === 1) {
    title.textContent    = '👋 Bem-vindo ao PEDIWAY!';
    subtitle.textContent = 'Vamos deixar sua loja pronta em 3 passos';
    body.innerHTML = `
      <div class="ob-progress"><div class="ob-progress-bar"><div class="ob-progress-fill" style="width:0%"></div></div><span style="font-size:.7rem;color:#aaa">Passo 1 de 3</span></div>
      <div class="ob-ai-msg">🚀 Você está a <strong>3 passos</strong> de ter sua loja online recebendo pedidos! Vou te ajudar a configurar tudo agora. Bora?</div>
      <div class="ob-field"><label>Nome do estabelecimento</label>
        <input class="ob-input" id="ob-nome" placeholder="Ex: Burger da Casa, Pizzaria do João..." value="${_obDados.nome||''}">
      </div>
      <div class="ob-field"><label>O que você vende?</label>
        <div class="ob-tipos">${_obTipos.map(function(t){
          return '<div class="ob-tipo'+(t.val===_obDados.tipo?' selected':'')+'" onclick="obSelecionarTipo(\'' + t.val + '\',this)">'
            +'<span class="ob-tipo-em">'+t.em+'</span>'
            +'<span class="ob-tipo-nm">'+t.nm+'</span>'
            +'</div>';
        }).join('')}</div>
      </div>
      <button class="ob-btn" onclick="obProximo(1)">Vamos lá! →</button>`;
    setTimeout(function(){const f=body.querySelector('.ob-progress-fill');if(f)f.style.width='5%';},50);

  } else if (step === 2) {
    title.textContent    = '🍽️ Monte seu cardápio';
    subtitle.textContent = 'A PEDI-AI vai criar tudo automaticamente';
    body.innerHTML = `
      <div class="ob-progress"><div class="ob-progress-bar"><div class="ob-progress-fill" style="width:0%"></div></div><span style="font-size:.7rem;color:#aaa">Passo 2 de 3</span></div>
      <div class="ob-ai-msg" id="ob-ai-tip">📸 Lojas com cardápio completo recebem <strong>3x mais pedidos</strong>! Tire uma foto do seu cardápio e a IA cadastra tudo em segundos.</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
        <button onclick="obUsarScanner()" style="border:2px solid var(--red);border-radius:12px;padding:16px;background:#fff8f8;cursor:pointer;display:flex;align-items:center;gap:12px;font-family:Poppins,sans-serif;text-align:left;position:relative">
          <span style="font-size:2rem">📸</span>
          <div style="flex:1"><div style="font-size:.88rem;font-weight:800;color:var(--red)">Fotografar meu cardápio agora</div><div style="font-size:.7rem;color:#888;margin-top:2px">A IA detecta todos os itens e preços automaticamente</div></div>
          <span style="background:var(--red);color:#fff;font-size:.6rem;font-weight:900;padding:2px 8px;border-radius:50px">RECOMENDADO</span>
        </button>
        <button onclick="obProximo(2)" style="border:2px solid #e5e5e5;border-radius:12px;padding:14px;background:#fafafa;cursor:pointer;display:flex;align-items:center;gap:12px;font-family:Poppins,sans-serif;text-align:left">
          <span style="font-size:2rem">✏️</span>
          <div><div style="font-size:.85rem;font-weight:800;color:#555">Prefiro adicionar manualmente</div><div style="font-size:.7rem;color:#aaa;margin-top:2px">Você pode usar a IA depois também</div></div>
        </button>
      </div>`;
    setTimeout(function(){const f=body.querySelector('.ob-progress-fill');if(f)f.style.width='50%';},50);
    // Busca dica da IA para este tipo
    obBuscarDicaIA();

  } else if (step === 3) {
    title.textContent    = '🎉 Quase lá!';
    subtitle.textContent = 'Últimos ajustes rápidos';
    body.innerHTML = `
      <div class="ob-progress"><div class="ob-progress-bar"><div class="ob-progress-fill" style="width:0%"></div></div><span style="font-size:.7rem;color:#aaa">Passo 3 de 3</span></div>
      <div class="ob-ai-msg">Perfeito! Agora vamos configurar a entrega. Você pode alterar tudo isso depois nas <strong>Configurações</strong>.</div>
      <div class="ob-field"><label>Cidade (para taxa de entrega)</label>
        <input class="ob-input" id="ob-cidade" placeholder="Ex: São Paulo, Belo Horizonte...">
      </div>
      <div class="ob-field"><label>Taxa de entrega padrão (R$)</label>
        <input class="ob-input" id="ob-taxa" type="number" placeholder="Ex: 5.00" step="0.50" min="0">
      </div>
      <div class="ob-field"><label>WhatsApp para contato</label>
        <input class="ob-input" id="ob-whats" type="tel" placeholder="(11) 99999-9999">
      </div>
      <button class="ob-btn" onclick="obFinalizar()">🚀 Abrir minha loja!</button>
      <button class="ob-btn-sec" onclick="fecharOnboarding()">Pular por agora</button>`;
    setTimeout(function(){const f=body.querySelector('.ob-progress-fill');if(f)f.style.width='100%';},50);
  }
}

window.obSelecionarTipo = function(val, el) {
  _obDados.tipo = val;
  document.querySelectorAll('.ob-tipo').forEach(function(t){ t.classList.remove('selected'); });
  if(el) el.classList.add('selected');
};

window.obProximo = function(fromStep) {
  if (fromStep === 1) {
    const nome = (document.getElementById('ob-nome')?.value||'').trim();
    if (!nome) { showToast('Digite o nome da sua loja!'); return; }
    _obDados.nome = nome;
    if (!_obDados.tipo) { showToast('Selecione o tipo do negócio!'); return; }
    // Salva nome no Supabase
    getSupa().from('estabelecimentos').update({ nome: nome, tipo_estabelecimento: _obDados.tipo }).eq('id', _obDados.id).then(function(){});
  }
  if (fromStep === 2) {
    renderObStep(3);
    return;
  }
  renderObStep(fromStep + 1);
};

async function obBuscarDicaIA() {
  const el = document.getElementById('ob-ai-tip');
  if (!el) return;
  try {
    const raw = await (await fetch('/api/pedi-ai', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'onboarding_step', context:{ step:1, dados:_obDados } })
    })).text();
    const json = JSON.parse(raw);
    if (json.content && el) {
      el.innerHTML = json.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g,'<br>');
    }
  } catch(e) {}
}

window.obUsarScanner = function() {
  fecharOnboarding();
  setTimeout(function() {
    const btn = document.querySelector('[onclick="abrirScannerIA()"]');
    if (btn) btn.click();
    showToast('📸 Agora fotografe seu cardápio!');
  }, 300);
};

window.obFinalizar = async function() {
  const cidade = document.getElementById('ob-cidade')?.value.trim() || '';
  const taxa   = parseFloat(document.getElementById('ob-taxa')?.value) || 0;
  const whats  = document.getElementById('ob-whats')?.value.trim() || '';
  const estab  = getEstab();
  if (!estab) return;
  const updates = {};
  if (cidade) updates.cidade = cidade;
  if (taxa)   updates.taxa_entrega = taxa;
  if (whats)  updates.whatsapp = whats.replace(/\D/g,'');
  updates.onboarding_done = true;
  await getSupa().from('estabelecimentos').update(updates).eq('id', estab.id);
  localStorage.setItem('pw_onboarding_done_' + estab.id, '1');
  fecharOnboarding();
  showToast('🎉 Loja configurada! Bem-vindo ao PEDIWAY!');
  // Abre PEDI-AI para dar boas-vindas
  setTimeout(function() {
    const btn = document.getElementById('pedi-ai-btn');
    if (btn) btn.click();
  }, 1200);
};

window.fecharOnboarding = function() {
  const modal = document.getElementById('onboarding-modal');
  if (modal) modal.classList.remove('show');
  const estab = getEstab();
  if (estab) {
    localStorage.setItem('pw_ob_' + estab.id, '1');
    // Salva no banco para não mostrar nem em outros dispositivos
    try { getSupa().from('estabelecimentos').update({ onboarding_done: true }).eq('id', estab.id).then(function(){}); } catch(e) {}
  }
};

// ════════════════════════════════════════════════════════════════════════════
// Integração PEDI-AI no Scanner "Cardápio em Segundos"
// ════════════════════════════════════════════════════════════════════════════

// Após gerar os itens, PEDI-AI analisa os preços automaticamente
var _iaOriginalRenderLista = null;

window.iaAnalisarPrecosPediAI = async function() {
  if (!_iaItens || !_iaItens.length) return;
  const estab = getEstab();
  try {
    const rawText = await (await fetch('/api/pedi-ai', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        action: 'analyze_menu',
        context: {
          itens: _iaItens.map(function(it){return{nome:it.nome,preco:it.preco,categoria:it.categoria};}),
          tipo_estabelecimento: estab?.tipo_estabelecimento || 'restaurante'
        }
      })
    })).text();
    const json = JSON.parse(rawText);
    if (!json.structured?.analise) return;
    // Aplica sugestões nos itens
    json.structured.analise.forEach(function(sug) {
      const it = _iaItens.find(function(x){return x.nome===sug.nome;});
      if (it && sug.preco_sugerido > 0 && sug.status !== 'ok') {
        it._preco_sugerido = sug.preco_sugerido;
        it._status = sug.status;
        it._motivo = sug.motivo;
      }
    });
    _iaDicaGeral = json.structured.dica_geral || '';
    iaRenderListaComAnalise();
  } catch(e) {}
};

var _iaDicaGeral = '';

// Override iaRenderLista para incluir análise de preços
window.iaRenderLista = function() {
  const lista = ia$('ia-lista-itens');
  if (!lista || lista.innerHTML === undefined) return;
  lista.innerHTML = _iaItens.map(function(it) {
    const preco = it.preco > 0 ? 'R$ ' + Number(it.preco).toFixed(2).replace('.', ',') : '—';
    const temSugestao = it._preco_sugerido && it._status !== 'ok';
    const statusIco = {baixo:'⬆️', alto:'⬇️'}[it._status] || '';
    const precoSug = temSugestao ? ' <span style="color:var(--red);font-weight:800">→ R$ '+Number(it._preco_sugerido).toFixed(2).replace('.',',')+'</span>' : '';
    return '<label style="display:flex;align-items:flex-start;gap:10px;background:'+(it._sel?'#fff8f8':'#fafafa')+';border:1.5px solid '+(it._sel?'#ffcccc':'#e5e7eb')+';border-radius:10px;padding:10px 12px;cursor:pointer">'
      + '<input type="checkbox" data-iaid="'+it._id+'" '+(it._sel?'checked':'')
      + ' onchange="iaToggleItem('+it._id+',this.checked)" style="margin-top:3px;accent-color:var(--red);flex-shrink:0">'
      + '<div style="flex:1;min-width:0">'
      + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;flex-wrap:wrap">'
      + '<span>'+(it.emoji||'🍽️')+'</span>'
      + '<span style="font-size:.83rem;font-weight:800;color:#111">'+it.nome+'</span>'
      + '<span style="background:#ffe0e0;color:var(--red);font-size:.56rem;font-weight:800;padding:1px 7px;border-radius:50px;margin-left:auto">'+(it.categoria||'OUTROS')+'</span></div>'
      + (it.descricao?'<div style="font-size:.7rem;color:#888;margin-bottom:3px">'+it.descricao+'</div>':'')
      + '<div style="font-size:.75rem;font-weight:700;color:#555">'+preco+precoSug
      + (statusIco?' <span title="'+(it._motivo||'')+'">'+statusIco+'</span>':'')+'</div>'
      + (it._motivo?'<div style="font-size:.65rem;color:#888;margin-top:2px">'+it._motivo+'</div>':'')
      + '</div></label>';
  }).join('');
  // Dica geral da PEDI-AI
  if (_iaDicaGeral) {
    lista.innerHTML += '<div style="background:#fff8f8;border:1.5px solid #ffcccc;border-radius:10px;padding:10px 12px;font-size:.75rem;color:#555;margin-top:4px">💡 <strong>PEDI-AI:</strong> '+_iaDicaGeral+'</div>';
  }

  // Seção de adicionais detectados
  if (_iaAdicionais && _iaAdicionais.length) {
    lista.innerHTML += '<div style="border-top:2px solid #f0f0f0;margin-top:12px;padding-top:10px">'
      + '<div style="font-size:.72rem;font-weight:800;color:#555;margin-bottom:8px;display:flex;align-items:center;gap:6px">🧩 Adicionais detectados <span style="background:#e0e7ff;color:#6366f1;font-size:.6rem;font-weight:900;padding:1px 8px;border-radius:50px">GRUPOS</span></div>'
      + _iaAdicionais.map(function(grupo, gi) {
          return '<div style="background:#f8f8ff;border:1.5px solid #e5e7ff;border-radius:10px;padding:10px 12px;margin-bottom:6px">'
            + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
            + '<input type="checkbox" id="adic-chk-'+gi+'" '+(grupo._sel?'checked':'')+' onchange="_iaAdicionais['+gi+']._sel=this.checked" style="accent-color:#6366f1">'
            + '<label for="adic-chk-'+gi+'" style="font-size:.78rem;font-weight:800;color:#333;cursor:pointer">'+grupo.grupo+'</label>'
            + '</div>'
            + (grupo.itens||[]).map(function(it){
                return '<div style="font-size:.72rem;color:#666;padding:2px 0 2px 22px">• '+it.nome+(it.preco>0?' — R$ '+Number(it.preco).toFixed(2).replace('.',','):'')+'</div>';
              }).join('')
            + '</div>';
        }).join('')
      + '</div>';
  }
};

function iaRenderListaComAnalise() {
  window.iaRenderLista();
}

// Modifica analisarCardapioIA para chamar análise de preços após gerar itens
var _iaOrigAnalisar = window.analisarCardapioIA;
window.analisarCardapioIA = async function() {
  _iaDicaGeral = '';
  if (_iaItens) _iaItens.forEach(function(it){delete it._preco_sugerido;delete it._status;delete it._motivo;});
  if (typeof _iaOrigAnalisar === 'function') await _iaOrigAnalisar.call(this);
  // Após gerar, analisa preços com PEDI-AI
  if (_iaItens && _iaItens.length > 0) {
    setTimeout(window.iaAnalisarPrecosPediAI, 500);
  }
};


// ── Grupos de Adicionais no modal de produto ─────────────────────────────────
async function _carregarGruposNoModal(estabId, selecionados) {
  const wrap = document.getElementById('item-grupos-adic');
  const empty = document.getElementById('item-grupos-empty');
  if (!wrap) return;
  try {
    const { data: grupos } = await getSupa()
      .from('grupos_adicionais')
      .select('id, nome')
      .eq('estabelecimento_id', estabId)
      .order('nome');

    if (!grupos || !grupos.length) {
      wrap.innerHTML = '<span style="font-size:.72rem;color:#aaa">Nenhum grupo criado ainda. Crie em Cardápio → Adicionais.</span>';
      return;
    }
    const selSet = new Set(selecionados || []);
    wrap.innerHTML = grupos.map(function(g) {
      const sel = selSet.has(g.id);
      return '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0">'
        + '<input type="checkbox" class="grupo-adic-chk" value="'+g.id+'" '+(sel?'checked':'')+' style="accent-color:var(--red);width:16px;height:16px">'
        + '<span style="font-size:.8rem;font-weight:'+(sel?'700':'600')+';color:'+(sel?'var(--red)':'#333')+'">'+g.nome+'</span>'
        + '</label>';
    }).join('');
  } catch(e) {
    wrap.innerHTML = '<span style="font-size:.72rem;color:#aaa">Erro ao carregar grupos.</span>';
  }
}

function _coletarGruposSelecionados() {
  const chks = document.querySelectorAll('.grupo-adic-chk:checked');
  return Array.from(chks).map(function(c) { return c.value; });
}
