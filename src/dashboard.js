// src/dashboard.js
import { getSupa } from './supabase.js';
import { showToast } from './utils.js';

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

// ── Link ME AJUDA PEDIWAY — usa config do CEO ──────────────────────────────
function atualizarLinkSuporte() {
  const cfg = JSON.parse(localStorage.getItem('pw_ceo_cfg') || '{}');
  // Valida que wpp contém apenas dígitos (evita javascript: ou URLs maliciosas)
  const wppRaw = String(cfg.wpp || '5500000000000').replace(/\D/g, '');
  const wpp = wppRaw.length >= 10 && wppRaw.length <= 15 ? wppRaw : '5500000000000';
  const msg = encodeURIComponent(String(cfg.wppMsg || 'Olá! Preciso de ajuda com o PEDIWAY.').slice(0, 500));
  const link = document.getElementById('link-me-ajuda');
  if (link) link.href = `https://wa.me/${wpp}?text=${msg}`;
}


// ── CHECKOUT / PLANOS ─────────────────────────────────────────────────────────
window.irCheckout = function(plano) {
  const estab = getEstab();
  if (!estab) return showToast('Faça login primeiro.', 'error');
  const cfg  = JSON.parse(localStorage.getItem('pw_ceo_cfg') || '{}');
  const pro  = cfg.precoPro  || '49';
  const prem = cfg.precoPrem || '99';
  window.open(`/checkout?plano=${plano}&estab=${estab.id}&precoPro=${pro}&precoPrem=${prem}`, '_blank');
};

// Atualiza preços no dashboard conforme config do CEO
function atualizarPrecosDash() {
  const cfg = JSON.parse(localStorage.getItem('pw_ceo_cfg') || '{}');
  const pro  = cfg.precoPro  || '49';
  const prem = cfg.precoPrem || '99';
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
    if (5 >= dias) elvenc.style.color = '#C0392B';
  }
}

export async function initDashboard() {
  let estab = getEstab();
  if (!estab) return;

  // Mostra loading suave enquanto carrega
  const loadingEl = document.getElementById('dash-loading-overlay');
  if (loadingEl) loadingEl.style.display = 'flex';

  atualizarLinkSuporte();
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

  // Mostra card de boas-vindas APENAS na primeira vez (após cadastro)
  try {
    var boasVindas = document.getElementById('card-boas-vindas');
    if (boasVindas) {
      var chave = 'pw_bv_visto_' + estab.id;
      var visto = localStorage.getItem(chave);
      if (!visto) {
        // Verifica se é conta nova (criada há menos de 10 minutos)
        var criadoEm = estab.created_at ? new Date(estab.created_at) : null;
        var agora    = new Date();
        var minutos  = criadoEm ? (agora - criadoEm) / 60000 : 999;
        if (minutos < 10) {
          boasVindas.style.display = 'block';
        }
        // Marca como visto para não aparecer mais
        localStorage.setItem(chave, '1');
      }
    }
  } catch(e) {}

  // Textos do header
  const sn = $('dash-store-name'); if (sn) sn.textContent = estab.nome;
  const lu = $('link-url');        if (lu) lu.textContent = `${BASE_URL}/${estab.slug}`;
  const lug = $('link-url-garcom');if (lug) lug.textContent = `${BASE_URL}/comandas/${estab.slug}`;

  // Preenche configurações
  preencherConfig(estab);
  if (estab.logo_url) mostrarLogoPreview(estab.logo_url);

  // Cor e capa
  corAtiva = normalizeHex(estab.cor_primaria || '#C0392B');
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
    await renderPedidos();
    await carregarFinanceiro();
    iniciarRealtime();
    await carregarPedidosMesas();
    renderMesas();
    window.renderHistoricoMesas();
    renderEmojiGrid();
  }

  // Remove loading overlay
  if (loadingEl) {
    loadingEl.style.opacity = '0';
    setTimeout(function(){ loadingEl.style.display = 'none'; loadingEl.style.opacity = '1'; }, 300);
  }

  if (false) {
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
  const ctsToggle = $('cfg-taxa-servico');
  const ctsWrap   = document.getElementById('cfg-taxa-servico-wrap');
  const ctsPerc   = $('cfg-perc-servico');
  if (ctsToggle) ctsToggle.checked = estab.taxa_servico === true;
  if (ctsWrap)   ctsWrap.style.display = estab.taxa_servico ? 'block' : 'none';
  if (ctsPerc)   ctsPerc.value = estab.perc_servico || 10;
  // Carrega estados e restaura estado + cidade salvos
  if (typeof window.carregarEstadosDash === 'function') {
    window.carregarEstadosDash({ estado: estab.estado || null, cidade: estab.cidade || null });
  }
}

function aplicarCorDash(cor) {
  const hex = isGradient(cor) ? gradToHex(cor) : cor;
  const dash = document.querySelector('[data-screen="s-dash"]');
  if (dash) dash.style.setProperty('--red', hex);
  document.querySelectorAll('.dash-nav,.tab-content,.config-card').forEach(el => el.style.setProperty('--red', hex));
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
  const img = $('logo-preview-img');
  const txt = $('logo-placeholder-text');
  if (img) { img.src = url; img.style.display = 'block'; }
  if (txt) txt.style.display = 'none';
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
    ctx.beginPath(); ctx.arc(W/2, H/2, safe/2, 0, Math.PI*2); ctx.stroke();
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
  if (isCircle) { ctx.beginPath(); ctx.arc(safe/2, safe/2, safe/2, 0, Math.PI*2); ctx.clip(); }
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
  crpGetBlob('crop-canvas', 'crop-stage', 'cso', true, blob => {
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

  grid.innerHTML = filtrado.map(p => {
    const emQuente = p.em_promocao && parseInt(p.desconto_percent||0) > 0;
    const precoOrig = Number(p.preco_original || p.preco).toFixed(2).replace('.',',');
    const precoDesc = Number(p.preco).toFixed(2).replace('.',',');

    // Card QUENTE: grande, laranja, igual ao app
    if (_dashSubTab === 'quente' && emQuente) {
      return `<div style="grid-column:1/-1;border-radius:18px;overflow:hidden;background:linear-gradient(135deg,#FF6B1A 0%,#e65e32 45%,#c94820 100%);position:relative;cursor:pointer;" onclick="editarItem('${p.id}')">
        <div style="position:absolute;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.07);top:-50px;right:-40px;pointer-events:none"></div>
        <div style="position:absolute;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.05);bottom:-20px;left:30px;pointer-events:none"></div>
        <div style="display:flex;align-items:center;padding:18px 20px;gap:16px;position:relative;z-index:1;">
          <div style="flex-shrink:0;width:80px;height:80px;border-radius:14px;overflow:hidden;background:rgba(0,0,0,.15);box-shadow:0 6px 20px rgba(0,0,0,.25);">
            ${p.foto_url ? '<img src="'+p.foto_url+'" style="width:100%;height:100%;object-fit:cover;display:block;">'
              : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;">'+(p.emoji||'🍔')+'</div>'}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="background:#FFD166;color:#111;font-size:11px;font-weight:900;padding:3px 10px;border-radius:30px;">${p.desconto_percent}% OFF 🔥</span>
              <span style="font-size:10px;color:rgba(255,255,255,.65);">${p.categoria||''}</span>
            </div>
            <div style="font-size:17px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.02em;">${p.nome}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
              <span style="font-size:12px;color:rgba(255,255,255,.45);text-decoration:line-through;">R$ ${precoOrig}</span>
              <span style="font-size:20px;font-weight:900;color:#FFD166;">R$ ${precoDesc}</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
            <button onclick="event.stopPropagation();editarItem('${p.id}')" style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);border-radius:10px;padding:7px 12px;font-size:12px;color:#fff;cursor:pointer;font-weight:700;">✏️ Editar</button>
            <button onclick="event.stopPropagation();deletarItem('${p.id}')" style="background:rgba(0,0,0,.15);border:1px solid rgba(0,0,0,.15);border-radius:10px;padding:7px 12px;font-size:12px;color:rgba(255,255,255,.7);cursor:pointer;font-weight:700;">🗑️</button>
          </div>
        </div>
      </div>`;
    }

    // Card normal (aba Todos)
    return `<div class="item-card">
      <div class="item-card-img">
        ${p.foto_url ? '<img class="item-img" src="'+(p.foto_url)+'" alt="'+(p.nome)+'">' : '<div class="item-emoji-bg">'+(p.emoji || '🍔')+'</div>'}
        <span class="item-disponivel">${p.disponivel ? 'Disponível' : 'Indisponível'}</span>
        ${emQuente ? '<span class="item-promo-badge" style="background:#e65e32;color:#fff;">🔥 '+p.desconto_percent+'% OFF</span>' : p.promocao ? '<span class="item-promo-badge">🔥 Promoção</span>' : ''}
      </div>
      <div class="item-body">
        <div class="item-categoria">${p.categoria || 'SEM CATEGORIA'}</div>
        <div class="item-nome">${p.nome}</div>
        <div class="item-desc-text">${p.descricao || ''}</div>
        <div class="item-footer">
          <div>
            ${emQuente
              ? '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><span style="font-size:.65rem;font-weight:800;color:#e65e32;">🔥 '+p.desconto_percent+'% OFF</span><span class="item-preco-original">R$ '+precoOrig+'</span></div><div class="item-preco" style="color:#e65e32;">R$ '+precoDesc+'</div>'
              : p.promocao && p.preco_original
                ? '<div class="item-preco-original">R$ '+precoOrig+'</div><div class="item-preco">R$ '+precoDesc+'</div>'
                : '<div class="item-preco">R$ '+precoDesc+'</div>'}
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
      if (editIdx != null && editIdx >= 0 && editIdx < fotosFiles.length) {
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
    if (idx >= files.length) return;
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
    if (idx >= files.length) return;
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
      v.onloadedmetadata = () => resolve(30 >= v.duration);
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
async function renderPedidos() {
  const estab = getEstab(); if (!estab) return;
  const { data } = await getSupa().from('pedidos').select('*')
    .eq('estabelecimento_id', estab.id).order('created_at', { ascending: false }).limit(50);

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
            </div>
            <div style="font-size:.7rem;color:#aaa;margin-top:2px">${tempoStr} atrás · ${endStr}</div>
          </div>
        </div>
        <span class="pedido-status ${cls}" style="white-space:nowrap;flex-shrink:0">${lbl}</span>
      </div>
      ${itensStr ? '<div style="font-size:.82rem;color:#666;background:#faf8f5;border-radius:8px;padding:8px 10px;margin-bottom:10px;line-height:1.5">'+(itensStr)+'</div>' : ''}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:1rem;font-weight:800;color:var(--red)">${totalFmt}</span>
          ${pgto ? '<span style="background:#f0e9e0;padding:2px 8px;border-radius:50px;font-size:.65rem;font-weight:700;color:#888">'+(pgto)+'</span>' : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${p.status==='novo'?'<button class="btn-ped-aceitar" onclick="aceitarPedido(\''+p.id+'\')">✓ Aceitar</button><button class="btn-ped-recusar" onclick="recusarPedido(\''+p.id+'\')">✕ Recusar</button>':''}
          ${p.status==='preparo'?'<button class="btn-ped-aceitar" onclick="marcarPronto(\''+p.id+'\')">✅ Pronto</button>':''}
          <button class="btn-ped-imprimir" onclick="verPedido('${p.id}')">🖨️ Ver</button>
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
  pararNotif();
  // Busca o pedido para saber o tipo antes de aceitar
  const { data: ped } = await getSupa().from('pedidos').select('endereco').eq('id', id).maybeSingle();
  const isMesa = ped && (ped.endereco||'').startsWith('No local');

  const { error } = await getSupa().from('pedidos').update({ status:'preparo' }).eq('id', id);
  if (error) return showToast('Erro ao aceitar.','error');
  removerCardNovo(id);

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
  await carregarPedidosMesas(); renderMesas();
  await renderPedidos();
};

window.marcarPronto = async function(id) {
  await getSupa().from('pedidos').update({ status:'pronto' }).eq('id', id);
  fecharModalPedido(); showToast('Pedido pronto!');
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
        ${p.status==='novo'?'<button class="btn-ped-aceitar" onclick="aceitarPedido('+p.id+');fecharModalPedido()">Aceitar</button><button class="btn-ped-recusar" onclick="recusarPedido('+p.id+');fecharModalPedido()">Recusar</button>':''}
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
          if (parts.length >= 2) {
            const key = parts[1].trim();
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
          await renderPedidos();
          if (document.querySelector('#tab-financeiro.active') ||
              document.querySelector('[data-tab="financeiro"].active')) {
            await carregarFinanceiro();
          }
          return;
        }
        // ── Atualiza caixa em tempo real ao receber pedido ──────────────
        if (_caixaAberto) { atualizarResumoCaixa(); }

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
        const p = payload.new;
        if (!p || p.estabelecimento_id !== estab.id) return;
        await renderPedidos(); // atualiza visão geral (stat-pedidos, stat-faturamento)
        if (_caixaAberto) { atualizarResumoCaixa(); }
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
    if (_finPeriodo === 'semana') { const s=new Date(now); s.setDate(s.getDate()-7); return d>=s; }
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

window.buscarPeriodoFinanceiro = function() {
  _finPeriodo = 'custom';
  renderFinanceiro();
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

  if (idx >= 0) {
    // Deseleciona
    sel.splice(idx, 1);
    document.getElementById('aopt-'+gi+'-'+oi)?.classList.remove('sel');
  } else {
    if (sel.length >= max) {
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

  if (!mesaKey || !pid) return;
  addItemComanda(mesaKey, pid, nome, preco, emoji);
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

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const { data } = await getSupa().from('pedidos').select('*')
    .eq('estabelecimento_id', estab.id)
    .ilike('endereco', 'No local%')
    .neq('status', 'recusado')
    .gte('created_at', hoje.toISOString())
    .order('created_at', { ascending: false });

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
    const mesa  = parts.length >= 2 ? parts[1].trim() : 'Mesa';
    if (!porMesa[mesa]) porMesa[mesa] = [];
    porMesa[mesa].push(p);
  });

  lista.innerHTML = Object.entries(porMesa).map(([mesa, peds]) => {
    const num       = mesa.replace('Mesa ','');
    const ativos    = peds.filter(p => ['novo','preparo'].includes(p.status));
    const prontos   = peds.filter(p => p.status === 'pronto');
    const temAtivo  = ativos.length > 0;
    // Total = só pedidos ativos (mesa aberta). Histórico tem o total completo separado.
    const totalMesa = ativos.reduce((s,p) => s+Number(p.total||0), 0);
    const mesaId    = 'hmesa-' + mesa.replace(/\s/g,'');

    // Cards de pedidos ativos
    const ativosHtml = ativos.map(p => _cardPedidoMesa(p, mesa, fmtR, stCor, stLbl)).join('');

    // Cards de pedidos histórico (prontos)
    const histHtml = prontos.length ? `
      <div style="margin-top:10px">
        <button onclick="toggleHistMesa('${mesaId}-hist')" style="width:100%;display:flex;align-items:center;justify-content:between;gap:8px;background:#f5f0eb;border:1.5px dashed #d4c4b0;border-radius:8px;padding:8px 12px;font-family:'Poppins',sans-serif;font-size:.75rem;font-weight:700;color:#888;cursor:pointer">
          <span style="flex:1;text-align:left">📋 Histórico de pedidos (${prontos.length})</span>
          <span id="${mesaId}-hist-arrow">▼</span>
        </button>
        <div id="${mesaId}-hist" style="display:none;margin-top:8px">
          ${prontos.map(p => _cardPedidoMesa(p, mesa, fmtR, stCor, stLbl)).join('')}
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
  const enviado = getEnviadosCozinha().has(p.id);

  // Cor da borda: vermelho = não foi pra cozinha, verde = foi pra cozinha, cinza = pronto/outro
  const bordaCor = p.status === 'pronto' ? '#aaa'
    : enviado ? '#16a34a'
    : '#C0392B';

  // Badge de status — destaque visual forte
  const stBadge = {
    novo:    { bg:'#fef3c7', cor:'#92400e', icon:'🔔', txt:'Aguardando' },
    preparo: { bg:'#f0fdf4', cor:'#16a34a', icon:'✅', txt:'Na cozinha' },
    pronto:  { bg:'#dcfce7', cor:'#15803d', icon:'✅', txt:'Pronto'     },
  }[p.status] || { bg:'#f3f4f6', cor:'#555', icon:'', txt: p.status };

  return `<div style="background:#fff;border:1.5px solid #f0e9e0;border-left:5px solid ${bordaCor};border-radius:10px;padding:12px;margin-bottom:8px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px">
      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
        ${nome ? '<span style="background:#f0e9e0;padding:3px 10px;border-radius:50px;font-size:.78rem;font-weight:700;color:#555">'+(nome)+'</span>' : ''}
        <span style="font-size:.68rem;color:#aaa">#${p.id.slice(-4).toUpperCase()} · ${dt}</span>
      </div>
      <!-- Status badge bem destacado -->
      <span style="display:inline-flex;align-items:center;gap:4px;background:${stBadge.bg};color:${stBadge.cor};padding:5px 12px;border-radius:50px;font-size:.75rem;font-weight:800;flex-shrink:0;white-space:nowrap;letter-spacing:.01em">
        ${stBadge.icon} ${stBadge.txt}
      </span>
    </div>

    <!-- Indicador cozinha inline -->
    ${p.status !== 'pronto' ? '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:5px 10px;border-radius:8px;background:'+(enviado?'#f0fdf4':'#fff5f5')+';border:1px solid '+(enviado?'#bbf7d0':'#fecaca')+'">       <span style="font-size:.75rem">'+(enviado ? '✅' : '⏳')+'</span>       <span style="font-size:.72rem;font-weight:700;color:'+(enviado?'#15803d':'#C0392B')+'">'+(enviado ? 'Enviado para a cozinha' : 'Aguardando envio para cozinha')+'</span>     </div>' : ''}

    <!-- Itens -->
    <div style="background:#faf8f5;border-radius:8px;padding:8px 10px;margin-bottom:10px">
      ${itens.map(i=>'<div style="display:flex;justify-content:space-between;font-size:.83rem;padding:2px 0"><span style="font-weight:600">'+(i.qtd||1)+'x '+(i.nome)+'</span><span style="color:#888">R$ '+(((i.preco||0)*(i.qtd||1)).toFixed(2).replace('.',','))+'</span></div>').join('')}
      <div style="text-align:right;font-size:.9rem;font-weight:800;color:var(--red);margin-top:6px;border-top:1px solid #f0e9e0;padding-top:6px">${fmtR(p.total)}</div>
    </div>

    <!-- Ações -->
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${p.status==='novo' ? '<button class="btn-ped-aceitar" style="padding:7px 12px;font-size:.75rem" onclick="aceitarPedido('+p.id+')">Aceitar</button>       <button class="btn-ped-recusar" style="padding:7px 10px;font-size:.75rem" onclick="recusarPedido('+p.id+')">Recusar</button>' : ''}
      ${p.status !== 'pronto' ? '<button class="btn-ped-imprimir" style="font-size:.75rem;background:'+(enviado?'#f0fdf4':'#fff5f5')+';border:1.5px solid '+(enviado?'#16a34a':'#C0392B')+';color:'+(enviado?'#16a34a':'#C0392B')+';font-weight:700" onclick="imprimirCozinha('+p.id+')">         '+(enviado ? '✓ Reenviado' : '🖨️ Enviar cozinha')+'       </button>' : ''}
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
window.imprimirCozinha = function(pedidoId) {
  getSupa().from('pedidos').select('*').eq('id', pedidoId).maybeSingle().then(({ data: p }) => {
    if (!p) return;
    const itens   = Array.isArray(p.itens) ? p.itens : [];
    const parts   = (p.endereco||'').split('—');
    const mesa    = parts.length >= 2 ? parts[1].trim() : p.endereco || '—';
    const isMesa  = (p.endereco||'').startsWith('No local');
    const nome    = (p.cliente_nome && p.cliente_nome !== mesa) ? p.cliente_nome : '';
    const dt      = new Date(p.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const loja    = getEstab()?.nome || 'Estabelecimento';
    const numPed  = '#' + p.id.slice(-6).toUpperCase();

    const html = `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<title>Cozinha ${numPed}</title>
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
  .tag     { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #888; margin-top: 2px; }
  .sep-dash  { border: none; border-top: 1px dashed #888; margin: 8px 0; }
  .sep-thick { border: none; border-top: 3px solid #000; margin: 8px 0; }
  .mesa-bloco {
    background: #000;
    color: #fff;
    border-radius: 6px;
    padding: 10px 8px 8px;
    text-align: center;
    margin: 6px 0;
  }
  .mesa-lbl { font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #aaa; }
  .mesa-num { font-size: 42px; font-weight: 900; line-height: 1.1; }
  .mesa-nome { font-size: 13px; font-weight: 700; color: #ddd; margin-top: 2px; }
  .delivery-bloco {
    border: 2px solid #000;
    border-radius: 6px;
    padding: 8px;
    text-align: center;
    margin: 6px 0;
  }
  .delivery-badge { font-size: 14px; font-weight: 900; letter-spacing: .06em; }
  .delivery-cliente { font-size: 14px; font-weight: 700; margin-top: 3px; }
  .delivery-end { font-size: 11px; font-weight: 400; color: #444; margin-top: 2px; }
  .hora { font-size: 11px; font-weight: 400; color: #888; text-align: center; margin-bottom: 4px; }
  .sec { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #555; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin: 6px 0 5px; }
  .item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px dotted #ddd;
  }
  .item:last-child { border-bottom: none; }
  .item-qtd  { font-size: 16px; font-weight: 900; color: #C0392B; flex-shrink: 0; min-width: 24px; }
  .item-nome { font-size: 14px; font-weight: 700; flex: 1; line-height: 1.3; }
  .adicional { font-size: 11px; font-weight: 400; color: #555; padding: 1px 0 1px 32px; }
  .obs {
    border: 2px solid #C0392B;
    border-radius: 4px;
    padding: 6px 8px;
    margin: 6px 0;
  }
  .obs-titulo { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; color: #C0392B; }
  .obs-texto  { font-size: 12px; font-weight: 700; }
  .rodape { font-size: 9px; font-weight: 400; color: #bbb; text-align: center; margin-top: 8px; letter-spacing: .04em; }
  @media print {
    body { padding: 4px 6px; }
    @page { margin: 0; size: 80mm auto; }
  }
</style></head><body>

<!-- CABEÇALHO -->
<div class="center">
  <div class="logo">PEDI<span class="logo-red">WAY</span></div>
  <div class="empresa">${loja}</div>
  <div class="tag">Ticket de Cozinha</div>
</div>

<hr class="sep-thick">

<!-- IDENTIFICAÇÃO: MESA ou DELIVERY -->
${isMesa ? ' <div class="mesa-bloco">   <div class="mesa-lbl">Mesa</div>   <div class="mesa-num">'+(mesa.replace('Mesa ',''))+'</div>   '+(nome ? '<div class="mesa-nome">'+(nome)+'</div>' : '')+' </div>' : ' <div class="delivery-bloco">   <div class="delivery-badge">DELIVERY / RETIRADA</div>   '+(p.cliente_nome ? '<div class="delivery-cliente">'+(p.cliente_nome)+'</div>' : '')+'   '+(p.endereco ? '<div class="delivery-end">'+(p.endereco)+'</div>' : '')+' </div>'}

<div class="hora">${numPed} &nbsp;·&nbsp; ${dt}</div>

<hr class="sep-dash">

<!-- ITENS -->
<div class="sec">Itens</div>
${itens.map(i => {   const adds = Array.isArray(i.adicionais) && i.adicionais.length     ? i.adicionais.map(a => '<div class="adicional">+ '+(a.nome)+'</div>').join('')     : '';   return '<div class="item">     <span class="item-qtd">'+(i.qtd||1)+'x</span>     <span class="item-nome">'+(i.nome)+'</span>   </div>'+(adds)+''; }).join('')}

${p.observacao ? ' <hr class="sep-dash"> <div class="obs">   <div class="obs-titulo">Observacao</div>   <div class="obs-texto">'+(p.observacao)+'</div> </div>' : ''}

<hr class="sep-dash">
<div class="rodape">PEDIWAY &mdash; Sistema de Gestao</div>

</body></html>`;

    const w = window.open('','_blank','width=340,height=680');
    if (!w) { alert('Permita pop-ups.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);

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
    .in('status', ['novo', 'preparo'])   // só pedidos ativos
    .order('created_at', { ascending: true });

  _pedidosMesas = {};
  (data || []).forEach(p => {
    const raw   = (p.endereco || '');
    const parts = raw.split('—');
    if (parts.length < 2) return;
    const mesa  = parts[1].trim();
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
      const mesa  = parts.length >= 2 ? parts[1].trim() : p.endereco || 'Mesa';
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
  document.querySelectorAll('.ctab').forEach(b => b.classList.remove('ativo'));
  document.getElementById('ctab-' + tab)?.classList.add('ativo');
  document.getElementById('cpanel-pedido').style.display = tab === 'pedido' ? 'flex' : 'none';
  document.getElementById('cpanel-hist').style.display   = tab === 'hist'   ? 'flex' : 'none';
};

// ── Adiciona item ao carrinho da mesa ──────────────────────────────────────────
function addItemComanda(mesaKey, id, nome, preco, emoji) {
  if (!_carrinhoComanda[mesaKey]) _carrinhoComanda[mesaKey] = [];
  const ex = _carrinhoComanda[mesaKey].find(x => x.id === id);
  if (ex) { ex.qtd++; } else { _carrinhoComanda[mesaKey].push({ id, nome, preco, emoji, qtd: 1 }); }
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
    const { error } = await getSupa().from('pedidos').insert({
      estabelecimento_id: estab.id,
      cliente_nome:       nomeCliente,
      cliente_whats:      '',
      endereco:           'No local — ' + _mesaAtual,
      itens:              carr.map(i=>({nome:i.nome,preco:i.preco,qtd:i.qtd,emoji:i.emoji})),
      total,
      status:             'novo',
      pagamento:          'No local',
    });
    if (error) throw error;
    _carrinhoComanda[_mesaAtual] = [];
    showToast('Pedido enviado para a cozinha! 🍽️');
    renderCarrinhoComanda(_mesaAtual);
    await carregarPedidosMesas();
    renderPedidosComanda(_mesaAtual);
  } catch(e) {
    showToast('Erro ao enviar: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled=false; btn.textContent='Enviar para cozinha 🍳'; }
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
  // Esconde submenu crédito/débito se selecionou PIX ou DINHEIRO
  if (metodo === 'PIX' || metodo === 'DINHEIRO') {
    const sub = document.getElementById('pgto-cartao-submenu');
    if (sub) sub.style.display = 'none';
    const btnC = document.getElementById('pgto-btn-CARTÃO');
    if (btnC) { btnC.style.borderColor='#e0dbd5'; btnC.style.background='#fff'; btnC.style.color='#555'; }
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
    await getSupa().from('pedidos').update({
      status: 'pronto',
      pagamento: _pagamentoComanda,
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
let _quenteHoras = 2; // duração padrão: 2h

window.abrirModalQuente = async function() {
  const modal = document.getElementById('modal-quente');
  if (!modal) return;

  // Gera pills de percentual (5 a 50, step 5)
  const pctWrap = document.getElementById('quente-percentuais');
  if (pctWrap) {
    pctWrap.innerHTML = [5,10,15,20,25,30,35,40,45,50].map(p => `
      <button onclick="selecionarPctQuente(${p})" id="qpct-${p}"
        style="padding:8px 16px;border-radius:100px;border:2px solid ${p===_quentePct?'#e65e32':'#e0dbd5'};
               background:${p===_quentePct?'#e65e32':'#fff'};
               color:${p===_quentePct?'#fff':'#555'};
               font-family:'Poppins',sans-serif;font-weight:800;font-size:.82rem;cursor:pointer;transition:all .15s">
        ${p}% OFF
      </button>`).join('');
  }

  // Duração da promoção
  const durWrap = document.getElementById('quente-duracao-wrap');
  if (durWrap) {
    durWrap.innerHTML = `
      <div style="margin-top:14px;">
        <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:8px;">⏱️ Duração da promoção</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${[
            {h:1,  l:'1h'},
            {h:2,  l:'2h'},
            {h:4,  l:'4h'},
            {h:8,  l:'8h'},
            {h:24, l:'1 dia'},
            {h:0,  l:'Sem limite'}
          ].map(o => `<button onclick="selecionarDuracaoQuente(${o.h})" id="qdur-${o.h}"
            style="padding:7px 14px;border-radius:30px;border:2px solid ${o.h===_quenteHoras?'#e65e32':'#e0dbd5'};
                   background:${o.h===_quenteHoras?'#e65e32':'#fff'};
                   color:${o.h===_quenteHoras?'#fff':'#555'};
                   font-family:'Poppins',sans-serif;font-weight:700;font-size:.78rem;cursor:pointer;transition:all .15s">
            ${o.l}
          </button>`).join('')}
        </div>
        <div id="quente-expira-info" style="font-size:11px;color:#aaa;margin-top:8px;"></div>
      </div>`;
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
    btn.style.background     = p === pct ? '#e65e32' : '#fff';
    btn.style.borderColor    = p === pct ? '#e65e32' : '#e0dbd5';
    btn.style.color          = p === pct ? '#fff'    : '#555';
  });
  atualizarPreviewQuente();
  // Recalcula preços nos cards de produto usando o preço BASE (nunca o descontado)
  document.querySelectorAll('[data-preco-orig]').forEach(el => {
    const base = parseFloat(el.dataset.precoOrig);
    const desc = base * (1 - _quentePct / 100);
    el.textContent = 'R$ ' + desc.toFixed(2).replace('.', ',');
  });
};

window.selecionarDuracaoQuente = function(horas) {
  _quenteHoras = horas;
  [0,1,2,4,8,24].forEach(h => {
    const b = document.getElementById('qdur-'+h);
    if (!b) return;
    b.style.background  = h === horas ? '#e65e32' : '#fff';
    b.style.borderColor = h === horas ? '#e65e32' : '#e0dbd5';
    b.style.color       = h === horas ? '#fff'    : '#555';
  });
  const info = document.getElementById('quente-expira-info');
  if (info) {
    if (horas === 0) {
      info.textContent = 'Promoção fica ativa até você remover manualmente.';
    } else {
      const exp = new Date(Date.now() + horas * 3600000);
      info.textContent = 'Expira hoje às ' + exp.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) + '.';
    }
  }
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

  // Atualiza flag da loja com expiração
  if (estab?.id) {
    const expiraEm = (_quenteHoras > 0 && marcados.length > 0)
      ? new Date(Date.now() + _quenteHoras * 3600000).toISOString()
      : null;
    await getSupa().from('estabelecimentos').update({
      promocao_ativa:   marcados.length > 0,
      desconto_percent: marcados.length > 0 ? pct : 0,
      promo_expira_em:  expiraEm,
    }).eq('id', estab.id);

    // Agenda expiração local (para o dono ver o aviso sem recarregar)
    if (_quenteHoras > 0 && marcados.length > 0) {
      clearTimeout(window._quenteExpiraTimer);
      window._quenteExpiraTimer = setTimeout(async function() {
        showToast('⏰ Promoção QUENTE expirou! Renovar?', '#e65e32', 5000);
        atualizarFireDash();
      }, _quenteHoras * 3600000);
    }
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
window.initCfgAccordion = function() {
  document.querySelectorAll('.cfg-topic-header').forEach(header => {
    if (header.dataset.accordion) return;
    header.dataset.accordion = '1';
    header.addEventListener('click', function(e) {
      if (e.target.closest('input,button,label,select,a')) return;
      const card = this.closest('.cfg-topic-card');
      const body = card?.querySelector('.cfg-topic-body');
      if (!body) return;
      const isOpen = body.classList.contains('open');
      // Fecha todos
      document.querySelectorAll('.cfg-topic-body.open').forEach(b => {
        b.classList.remove('open');
        b.closest('.cfg-topic-card')?.querySelector('.cfg-topic-header')?.classList.remove('open');
      });
      // Abre o clicado se estava fechado
      if (!isOpen) {
        body.classList.add('open');
        this.classList.add('open');
      }
    });
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// FILTRO DE PEDIDOS POR DATA
// ═══════════════════════════════════════════════════════════════════════════
window.filtrarPedidosData = function() {
  const deVal  = document.getElementById('ped-data-de')?.value;
  const ateVal = document.getElementById('ped-data-ate')?.value;
  document.querySelectorAll('#todos-pedidos .pedido-card').forEach(function(card) {
    const dataStr = card.dataset.criado || card.dataset.createdAt || '';
    if (!dataStr) { card.style.display = ''; return; }
    const d = new Date(dataStr);
    var mostrar = true;
    if (deVal && d < new Date(deVal + 'T00:00:00')) mostrar = false;
    if (ateVal && d > new Date(ateVal + 'T23:59:59')) mostrar = false;
    card.style.display = mostrar ? '' : 'none';
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// QUENTE — DESATIVA PROMOÇÕES AUTOMATICAMENTE AO VIRAR O DIA
// ═══════════════════════════════════════════════════════════════════════════
async function verificarExpiracaoQuente() {
  const estab = getEstab();
  if (!estab || estab.id === 'demo') return;
  const hoje    = new Date().toDateString();
  const chave   = 'pw_quente_dia_' + estab.id;
  if (localStorage.getItem(chave) === hoje) return;
  try {
    const { data: promos } = await getSupa()
      .from('produtos').select('id,preco_original')
      .eq('estabelecimento_id', estab.id).eq('em_promocao', true);
    if (promos && promos.length) {
      for (var p of promos) {
        await getSupa().from('produtos').update({ em_promocao: false, desconto_percent: 0 }).eq('id', p.id);
      }
      showToast('Promoções QUENTE do dia anterior foram desativadas.');
      await renderCardapio();
    }
  } catch(e) {}
  localStorage.setItem(chave, hoje);
}
setInterval(function() { verificarExpiracaoQuente(); }, 60 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════════
// CAIXA — PERSISTENTE (localStorage primário, Supabase secundário)
// ═══════════════════════════════════════════════════════════════════════════
var _caixaAberto   = false;
var _caixaAbertura = null;
var _caixaId       = null;
var _caixaTimer    = null;

function iniciarAutoRefreshCaixa() {
  if (_caixaTimer) clearInterval(_caixaTimer);
  _caixaTimer = setInterval(function() { if (_caixaAberto) atualizarResumoCaixa(); }, 30000);
}
function pararAutoRefreshCaixa() {
  if (_caixaTimer) { clearInterval(_caixaTimer); _caixaTimer = null; }
}

async function atualizarResumoCaixa() {
  var estab = getEstab();
  if (!estab || !_caixaAberto || !_caixaAbertura) return;
  var fmt = function(v) { return 'R$ ' + Number(v||0).toFixed(2).replace('.',','); };
  try {
    var res = await getSupa().from('pedidos').select('total,pagamento')
      .eq('estabelecimento_id', estab.id).gte('created_at', _caixaAbertura.hora);
    var todos = res.data || [];
    var totalPix      = todos.filter(function(p){return p.pagamento==='PIX';}).reduce(function(s,p){return s+Number(p.total||0);},0);
    var totalCartao   = todos.filter(function(p){return ['CRÉDITO','DÉBITO','CARTÃO'].includes(p.pagamento);}).reduce(function(s,p){return s+Number(p.total||0);},0);
    var totalDinheiro = todos.filter(function(p){return p.pagamento==='DINHEIRO';}).reduce(function(s,p){return s+Number(p.total||0);},0);
    var totalGeral    = totalPix + totalCartao + totalDinheiro + Number(_caixaAbertura.valorAbertura||0);
    var el = function(id){return document.getElementById(id);};
    if (el('caixa-total-pix'))      el('caixa-total-pix').textContent      = fmt(totalPix);
    if (el('caixa-total-cartao'))   el('caixa-total-cartao').textContent   = fmt(totalCartao);
    if (el('caixa-total-dinheiro')) el('caixa-total-dinheiro').textContent = fmt(totalDinheiro);
    if (el('caixa-total-geral'))    el('caixa-total-geral').textContent    = fmt(totalGeral);
    if (el('caixa-num-pedidos'))    el('caixa-num-pedidos').textContent    = todos.length + ' pedido(s)';
  } catch(e) {}
}
window.atualizarResumoCaixa = atualizarResumoCaixa;

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
  _caixaAbertura = { valorAbertura: valorAbertura, operador: operador, obs: obs, hora: agora.toISOString(), aberto: true };
  try { localStorage.setItem('pw_caixa_' + estab.id, JSON.stringify(_caixaAbertura)); } catch(e) {}
  aplicarUICaixaAberto(operador, agora.toISOString());
  await atualizarResumoCaixa();
  iniciarAutoRefreshCaixa();
  showToast('✅ Caixa aberto!');
};

window.fecharCaixa = async function() {
  if (!confirm('Confirma o fechamento do caixa? Um comprovante será gerado.')) return;
  var estab = getEstab();
  if (!estab) return;
  var agora = new Date();
  var fmt   = function(v){return 'R$ ' + Number(v||0).toFixed(2).replace('.',',');};
  var totalPix = 0, totalCartao = 0, totalDinheiro = 0, numPedidos = 0;
  try {
    var res = await getSupa().from('pedidos').select('total,pagamento,cliente_nome,created_at')
      .eq('estabelecimento_id', estab.id)
      .gte('created_at', _caixaAbertura?.hora || agora.toISOString())
      .order('created_at', {ascending: true});
    var todos = res.data || [];
    numPedidos    = todos.length;
    totalPix      = todos.filter(function(p){return p.pagamento==='PIX';}).reduce(function(s,p){return s+Number(p.total||0);},0);
    totalCartao   = todos.filter(function(p){return ['CRÉDITO','DÉBITO','CARTÃO'].includes(p.pagamento);}).reduce(function(s,p){return s+Number(p.total||0);},0);
    totalDinheiro = todos.filter(function(p){return p.pagamento==='DINHEIRO';}).reduce(function(s,p){return s+Number(p.total||0);},0);
  } catch(e) {}
  var totalGeral    = totalPix + totalCartao + totalDinheiro + Number(_caixaAbertura?.valorAbertura||0);
  try { localStorage.removeItem('pw_caixa_' + estab?.id); } catch(e) {}
  pararAutoRefreshCaixa();
  _caixaAberto = false; _caixaAbertura = null; _caixaId = null;
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
    hist.unshift({
      fechadoEm:      agora.toISOString(),
      operador:       _caixaAbertura?.operador || 'Operador',
      aberturaEm:     _caixaAbertura?.hora || agora.toISOString(),
      valorAbertura:  Number(_caixaAbertura?.valorAbertura || 0),
      totalPix:       totalPix,
      totalCartao:    totalCartao,
      totalDinheiro:  totalDinheiro,
      totalGeral:     totalGeral,
      numPedidos:     numPedidos,
    });
    if (hist.length > 20) hist = hist.slice(0, 20);
    localStorage.setItem('pw_caixa_hist_' + estab?.id, JSON.stringify(hist));
    renderHistoricoCaixa();
  } catch(e) {}

  showToast('🔒 Caixa fechado!');
  // Comprovante completo de fechamento
  var nl  = '\n';
  var sep = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  var cnpj = estab.cpf_cnpj ? 'CNPJ: ' + estab.cpf_cnpj : '';
  var tel  = estab.telefone_contato || estab.whatsapp || '';
  var end_ = estab.endereco || '';
  var inst = estab.instagram ? '@' + estab.instagram.replace('@','') : '';
  var corpo = [
    '██████████████████████████████████',
    '     FECHAMENTO DE CAIXA',
    '██████████████████████████████████',
    (estab.nome || 'Estabelecimento').toUpperCase(),
    end_,
    tel  ? 'Tel: ' + tel : '',
    cnpj,
    inst ? 'Instagram: ' + inst : '',
    sep,
    'Operador:   ' + (_caixaAbertura?.operador || 'Operador'),
    'Abertura:   ' + new Date(_caixaAbertura?.hora || agora).toLocaleString('pt-BR'),
    'Fechamento: ' + agora.toLocaleString('pt-BR'),
    sep,
    'FUNDO DE CAIXA INICIAL:   ' + fmt(_caixaAbertura?.valorAbertura || 0),
    sep,
    '  RECEBIMENTOS DO PERÍODO',
    sep,
    '  PIX:               ' + fmt(totalPix),
    '  CARTÃO:            ' + fmt(totalCartao),
    '  DINHEIRO:          ' + fmt(totalDinheiro),
    sep,
    '  SUBTOTAL VENDAS:   ' + fmt(totalPix + totalCartao + totalDinheiro),
    '  FUNDO INICIAL:   + ' + fmt(_caixaAbertura?.valorAbertura || 0),
    sep,
    '  TOTAL EM CAIXA:    ' + fmt(totalGeral),
    sep,
    '  Nº DE PEDIDOS: ' + numPedidos,
    sep,
    'Gerado em: ' + agora.toLocaleString('pt-BR'),
    sep,
    '     Obrigado pela preferência!',
  ].filter(function(l){return l !== '';}).join(nl);
  var estabNome = (estab && estab.nome ? estab.nome : 'Estabelecimento').toUpperCase();
  var estabEnd  = estab && estab.endereco ? estab.endereco : '';
  var estabTel  = estab && (estab.telefone_contato || estab.whatsapp) ? (estab.telefone_contato || estab.whatsapp) : '';
  var estabCnpj = estab && estab.cpf_cnpj ? estab.cpf_cnpj : '';
  var htmlComp = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fechamento de Caixa</title>'
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
    + '<div class="emp">' + estabNome + '</div>'
    + '<div class="info">'
    + (estabEnd  ? estabEnd  + '<br>' : '')
    + (estabTel  ? 'Tel: ' + estabTel + '<br>' : '')
    + (estabCnpj ? 'CNPJ: ' + estabCnpj : '')
    + '</div>'
    + '</div>'
    + '<hr class="sep-thick">'
    + '<div class="center" style="font-size:13px;font-weight:900;letter-spacing:.05em">FECHAMENTO DE CAIXA</div>'
    + '<hr class="sep-dash">'
    + '<div class="sec">Período</div>'
    + '<div class="row"><span class="lbl">Operador</span><span class="val">' + (_caixaAbertura && _caixaAbertura.operador ? _caixaAbertura.operador : 'Operador') + '</span></div>'
    + '<div class="row"><span class="lbl">Abertura</span><span class="val">' + new Date(_caixaAbertura && _caixaAbertura.hora ? _caixaAbertura.hora : agora).toLocaleString('pt-BR') + '</span></div>'
    + '<div class="row"><span class="lbl">Fechamento</span><span class="val">' + agora.toLocaleString('pt-BR') + '</span></div>'
    + '<hr class="sep-dash">'
    + '<div class="sec">Fundo de Caixa</div>'
    + '<div class="row"><span class="lbl">Valor inicial</span><span class="val">' + fmt(_caixaAbertura && _caixaAbertura.valorAbertura ? _caixaAbertura.valorAbertura : 0) + '</span></div>'
    + '<hr class="sep-dash">'
    + '<div class="sec">Recebimentos</div>'
    + '<div class="row"><span class="lbl">PIX</span><span class="val">' + fmt(totalPix) + '</span></div>'
    + '<div class="row"><span class="lbl">Cartão</span><span class="val">' + fmt(totalCartao) + '</span></div>'
    + '<div class="row"><span class="lbl">Dinheiro</span><span class="val">' + fmt(totalDinheiro) + '</span></div>'
    + '<div class="row" style="margin-top:3px"><span class="lbl">Nº de pedidos</span><span class="val">' + numPedidos + '</span></div>'
    + '<div class="total-bloco"><span class="total-lbl">TOTAL EM CAIXA</span><span class="total-val">' + fmt(totalGeral) + '</span></div>'
    + '<div class="center rodape">Gerado em: ' + agora.toLocaleString('pt-BR') + '<br>PEDIWAY · Plataforma de delivery independente</div>'
    + '</body></html>';
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
function renderHistoricoCaixa() {
  var estab = getEstab();
  var el    = document.getElementById('caixa-historico');
  if (!el) return;
  if (!estab || estab.id === 'demo') { el.innerHTML = '<div style="text-align:center;color:#aaa;font-size:.82rem;padding:24px">Nenhum registro ainda</div>'; return; }
  try {
    var hist = JSON.parse(localStorage.getItem('pw_caixa_hist_' + estab.id) || '[]');
    if (!hist.length) { el.innerHTML = '<div style="text-align:center;color:#aaa;font-size:.82rem;padding:24px">Nenhum fechamento registrado ainda</div>'; return; }
    var fmt = function(v){return 'R$ ' + Number(v||0).toFixed(2).replace('.',',');};
    el.innerHTML = hist.map(function(h, idx) {
      var dt = new Date(h.fechadoEm).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
      var ab = new Date(h.aberturaEm).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      return '<div style="border:1.5px solid #f0ebe4;border-radius:12px;padding:12px;margin-bottom:8px;background:#fff">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
        + '<div><div style="font-size:.78rem;font-weight:800;color:#1a1a1a">' + dt + '</div>'
        + '<div style="font-size:.68rem;color:#aaa;margin-top:1px">Operador: ' + (h.operador||'—') + '</div></div>'
        + '<button onclick="reimprirCaixa(' + idx + ')" style="background:#f5f2ef;border:none;border-radius:8px;padding:6px 10px;font-size:.68rem;font-weight:700;color:#555;cursor:pointer">🖨️ Reimprimir</button>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:.75rem">'
        + '<span style="color:#888">Abertura:</span><span style="font-weight:700;text-align:right">' + ab + '</span>'
        + '<span style="color:#888">PIX:</span><span style="font-weight:700;text-align:right">' + fmt(h.totalPix) + '</span>'
        + '<span style="color:#888">Cartão:</span><span style="font-weight:700;text-align:right">' + fmt(h.totalCartao) + '</span>'
        + '<span style="color:#888">Dinheiro:</span><span style="font-weight:700;text-align:right">' + fmt(h.totalDinheiro) + '</span>'
        + '<span style="color:#888">Pedidos:</span><span style="font-weight:700;text-align:right">' + (h.numPedidos||0) + '</span>'
        + '</div>'
        + '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #f0ebe4;display:flex;justify-content:space-between;align-items:center">'
        + '<span style="font-size:.8rem;font-weight:800;color:#555">TOTAL EM CAIXA</span>'
        + '<span style="font-size:.9rem;font-weight:900;color:#16a34a">' + fmt(h.totalGeral) + '</span>'
        + '</div>'
        + '</div>';
    }).join('');
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;color:#aaa;font-size:.82rem;padding:24px">Erro ao carregar histórico</div>';
  }
}
window.renderHistoricoCaixa = renderHistoricoCaixa;

// ═══════════════════════════════════════════════════════════════════════════
// REIMPRIMIR CAIXA DO HISTÓRICO
// ═══════════════════════════════════════════════════════════════════════════
window.reimprirCaixa = function(idx) {
  var estab = getEstab();
  if (!estab) return;
  try {
    var hist = JSON.parse(localStorage.getItem('pw_caixa_hist_' + estab.id) || '[]');
    var h = hist[idx];
    if (!h) return;
    var fmt = function(v){return 'R$ ' + Number(v||0).toFixed(2).replace('.',',');};
    var estabNome = (estab.nome||'Estabelecimento').toUpperCase();
    var estabEnd  = estab.endereco||'';
    var estabTel  = estab.telefone_contato||estab.whatsapp||'';
    var estabCnpj = estab.cpf_cnpj||'';

    var htmlComp = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reimpressão · Fechamento de Caixa</title>'
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
      + '.reimp{background:#f5f2ef;border-radius:6px;padding:4px 10px;font-size:9px;font-weight:700;color:#888;text-align:center;margin-bottom:6px;letter-spacing:.06em}'
      + '.rodape{font-size:9px;text-align:center;color:#888;margin-top:8px;letter-spacing:.04em}'
      + '@media print{body{padding:4px}@page{margin:0;size:80mm auto}}'
      + '</style></head><body>'
      + '<div class="reimp">⟳ REIMPRESSÃO</div>'
      + '<div class="center">'
      + '<div class="logo">PEDI<span class="logo-red">WAY</span></div>'
      + '<div class="emp">' + estabNome + '</div>'
      + '<div class="info">'
      + (estabEnd  ? estabEnd  + '<br>' : '')
      + (estabTel  ? 'Tel: ' + estabTel + '<br>' : '')
      + (estabCnpj ? 'CNPJ: ' + estabCnpj : '')
      + '</div>'
      + '</div>'
      + '<hr class="sep-thick">'
      + '<div class="center" style="font-size:13px;font-weight:900;letter-spacing:.05em">FECHAMENTO DE CAIXA</div>'
      + '<hr class="sep-dash">'
      + '<div class="sec">Período</div>'
      + '<div class="row"><span class="lbl">Operador</span><span class="val">' + (h.operador||'Operador') + '</span></div>'
      + '<div class="row"><span class="lbl">Abertura</span><span class="val">' + new Date(h.aberturaEm).toLocaleString('pt-BR') + '</span></div>'
      + '<div class="row"><span class="lbl">Fechamento</span><span class="val">' + new Date(h.fechadoEm).toLocaleString('pt-BR') + '</span></div>'
      + '<hr class="sep-dash">'
      + '<div class="sec">Fundo de Caixa</div>'
      + '<div class="row"><span class="lbl">Valor inicial</span><span class="val">' + fmt(h.valorAbertura||0) + '</span></div>'
      + '<hr class="sep-dash">'
      + '<div class="sec">Recebimentos</div>'
      + '<div class="row"><span class="lbl">PIX</span><span class="val">' + fmt(h.totalPix) + '</span></div>'
      + '<div class="row"><span class="lbl">Cartão</span><span class="val">' + fmt(h.totalCartao) + '</span></div>'
      + '<div class="row"><span class="lbl">Dinheiro</span><span class="val">' + fmt(h.totalDinheiro) + '</span></div>'
      + '<div class="row" style="margin-top:3px"><span class="lbl">Nº de pedidos</span><span class="val">' + (h.numPedidos||0) + '</span></div>'
      + '<div class="total-bloco"><span class="total-lbl">TOTAL EM CAIXA</span><span class="total-val">' + fmt(h.totalGeral) + '</span></div>'
      + '<div class="center rodape">Gerado em: ' + new Date().toLocaleString('pt-BR') + '<br>PEDIWAY · Plataforma de delivery independente</div>'
      + '</body></html>';

    var w = window.open('','_blank','width=400,height=620');
    if (w) { w.document.write(htmlComp); w.document.close(); setTimeout(function(){w.print();},600); }
  } catch(e) { showToast('Erro ao reimprimir.', 'error'); }
};
