// src/main.js
import { goTo, openDemo, openDemoCliente, showToast, showTab, copiarLink, gerarSlug } from './utils.js';
import { getSupa } from './supabase.js';
import { doLogin, doRegister } from './auth.js';
import { initDashboard } from './dashboard.js';

// Expõe goTo globalmente — s-landing removido do index.html
const _goToOriginal = goTo;
window.goTo = function(screen, extra) {
  _goToOriginal(screen, extra);
  // footer só existe no delivery.html, não no index
  const footer = document.getElementById('site-footer');
  if (footer) footer.style.display = 'none';
};
window.openDemo        = openDemo;
window.openDemoCliente = openDemoCliente;
window.showToast       = showToast;
window.showTab         = showTab;
window.copiarLink      = copiarLink;
window.doLogin         = doLogin;
window.doRegister      = doRegister;
window.initDashboard   = initDashboard;

window.mascaraDoc = function(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length <= 11) {
    v = v.replace(/(\d{3})(\d)/, '$1.$2')
         .replace(/(\d{3})(\d)/, '$1.$2')
         .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  } else {
    v = v.replace(/(\d{2})(\d)/, '$1.$2')
         .replace(/(\d{3})(\d)/, '$1.$2')
         .replace(/(\d{3})(\d)/, '$1/$2')
         .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }
  input.value = v;
};

window.mascaraWhatsInput = function(input) {
  let v = input.value.replace(/\D/g,'');
  if (v.length > 11) v = v.slice(0,11);
  if (v.length <= 10) {
    v = v.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  } else {
    v = v.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
  }
  input.value = v;
};

window.togglePromo = function(cb) {
  const g = document.getElementById('preco-orig-group');
  if (g) g.style.display = cb.checked ? 'flex' : 'none';
};

window.atualizarCfgLink = function(val) {
  const slug = val.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const el = document.getElementById('cfg-link-preview');
  if (el) el.textContent = `pediway.vercel.app/${slug || 'meu-link'}`;
};

document.addEventListener('DOMContentLoaded', async () => {
  // Restaura sessão via Supabase Auth (import estático já no topo via main.js)
  try {
    const { data: { session } } = await getSupa().auth.getSession();

    if (session?.user) {
      const { data: estab } = await getSupa()
        .from('estabelecimentos')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (estab) {
        window._estab = estab;
        localStorage.setItem('pw_estab', JSON.stringify(estab));
        localStorage.setItem('pw_tela_atual', 's-dash');
        goTo('s-dash');
        await initDashboard();
        return;
      }
    }
  } catch(e) {
    console.warn('Erro ao restaurar sessão:', e);
  }

  // Fallback: localStorage
  const saved = localStorage.getItem('pw_estab');
  if (saved) {
    try { window._estab = JSON.parse(saved); } catch(e) { localStorage.removeItem('pw_estab'); }
  }

  const telaSalva = localStorage.getItem('pw_tela_atual');
  if (telaSalva === 's-dash' && window._estab) {
    goTo('s-dash');
    await initDashboard();
  } else {
    localStorage.removeItem('pw_tela_atual');
    goTo('s-login');
  }
});
