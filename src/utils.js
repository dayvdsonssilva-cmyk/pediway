// src/utils.js
const BASE = 'https://pediway.vercel.app';

export function goTo(id) {
  document.querySelectorAll('[data-screen]').forEach(s => s.classList.remove('active'));
  const t = document.querySelector(`[data-screen="${id}"]`);
  if (t) { t.classList.add('active'); window.scrollTo(0, 0); }
  // Salva a tela atual (exceto landing/login/register)
  if (['s-dash'].includes(id)) {
    localStorage.setItem('pw_tela_atual', id);
  } else if (['s-landing','s-login','s-register','s-sucesso'].includes(id)) {
    localStorage.removeItem('pw_tela_atual');
  }
}

export function showTab(tabId, btn) {
  // Bloqueia scroll temporariamente durante a troca de aba
  const html = document.documentElement;
  const body = document.body;
  const scrollY = window.scrollY;

  // Fixa posição para evitar qualquer salto de layout
  const prevOverflow = body.style.overflow;
  body.style.overflow = 'hidden';

  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tabId}`)?.classList.add('active');
  btn?.classList.add('active');
  localStorage.setItem('pw_aba_ativa', tabId);

  // Restaura em dois frames para garantir que o layout foi recalculado
  requestAnimationFrame(() => {
    window.scrollTo(0, scrollY);
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
      body.style.overflow = prevOverflow;
    });
  });
}

export function gerarSlug(nome) {
  return nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

export function copiarLink() {
  const slug = window._estab?.slug || 'meu-estabelecimento';
  navigator.clipboard.writeText(`${BASE}/${slug}`).then(() => showToast('Link copiado!'));
}

export function openDemo() {
  const demoEstab = {
    id: 'demo',
    nome: 'Burguer do Zé',
    slug: 'demo',
    whatsapp: '11999999999',
    descricao: 'Os melhores burguers da cidade!',
    logo_url: null,
    cor_primaria: '#C0392B',
    endereco: 'Rua das Flores, 123 — Centro',
    tempo_entrega: '30-45 min',
    taxa_entrega: 5,
    faz_entrega: true,
    faz_retirada: true,
    aceita_pix: true,
    aceita_cartao: true,
    aceita_dinheiro: true,
    aberto: true,
    plano: 'premium',           // acesso total sem restrição
    assinatura_vencimento: null, // sem vencimento
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(), // 5 dias atrás
    num_mesas: 10,
    telefone_contato: '(11) 3333-4444',
    cnpj: '00000000000100',
    instagram: 'burguerdoze',
    tiktok: 'burguerdoze',
    msg_nota: 'Obrigado pela preferencia! Volte sempre 😊',
  };
  window._estab = demoEstab;
  window._isDemo = true;
  localStorage.setItem('pw_estab', JSON.stringify(demoEstab));
  goTo('s-dash');
  if (window.initDashboard) window.initDashboard();
}

export function openDemoCliente() {
  window.open(`${BASE}/demo`, '_blank');
}

export function showToast(msg, type = 'success') {
  document.querySelector('.pw-toast')?.remove();
  const t = document.createElement('div');
  t.className = 'pw-toast';
  t.style.cssText = `position:fixed;bottom:28px;left:50%;transform:translateX(-50%);
    background:${type === 'error' ? '#dc2626' : 'var(--red)'};color:#fff;padding:13px 28px;
    border-radius:50px;font-family:'Poppins',sans-serif;font-weight:600;font-size:0.88rem;
    z-index:9999;box-shadow:0 6px 24px rgba(0,0,0,0.2);white-space:nowrap;
    animation:toastIn 0.25s ease;`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

window.showTab    = showTab;
window.copiarLink = copiarLink;
window.openDemoCliente = openDemoCliente;
