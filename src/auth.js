// src/auth.js
import { getSupa } from './supabase.js';
import { goTo, showToast, gerarSlug } from './utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITING LOCAL (proteção contra brute force no frontend)
// Não substitui o rate limit do Supabase, mas adiciona uma camada extra
// ─────────────────────────────────────────────────────────────────────────────
const _tentativas = {};

function registrarTentativa(chave) {
  const agora = Date.now();
  if (!_tentativas[chave]) _tentativas[chave] = [];
  // Mantém só tentativas dos últimos 5 minutos
  _tentativas[chave] = _tentativas[chave].filter(t => agora - t < 5 * 60 * 1000);
  _tentativas[chave].push(agora);
}

function bloqueado(chave, max = 5) {
  const agora = Date.now();
  const recentes = (_tentativas[chave] || []).filter(t => agora - t < 5 * 60 * 1000);
  return recentes.length >= max;
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDAÇÕES
// ─────────────────────────────────────────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LIMITES = { nome: 120, cidade: 80, email: 200, telefone: 15 };

function validarEmail(e) {
  return EMAIL_REGEX.test(String(e).trim().toLowerCase());
}

function validarTamanho(valor, campo) {
  return String(valor || '').length <= (LIMITES[campo] || 255);
}

function validarCPF(c) {
  c = c.replace(/\D/g,'');
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
  let r = (s * 10) % 11; if (r === 10 || r === 11) r = 0;
  if (r !== +c[9]) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
  r = (s * 10) % 11; if (r === 10 || r === 11) r = 0;
  return r === +c[10];
}

function validarCNPJ(c) {
  c = c.replace(/\D/g,'');
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = n => {
    let s = 0, p = n - 7;
    for (let i = 0; i < n; i++) { s += +c[i] * p--; if (p < 2) p = 9; }
    const r = s % 11; return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === +c[12] && calc(13) === +c[13];
}

function docValido(d) {
  const n = d.replace(/\D/g,'');
  return n.length === 11 ? validarCPF(n) : n.length === 14 ? validarCNPJ(n) : false;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────
window.mascaraTel = function(inp) {
  let v = inp.value.replace(/\D/g,'').slice(0,11);
  if (v.length > 10)     v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  else if (v.length > 6) v = v.replace(/^(\d{2})(\d{4})(\d*)$/, '($1) $2-$3');
  else if (v.length > 2) v = v.replace(/^(\d{2})(\d*)$/, '($1) $2');
  else if (v.length > 0) v = '(' + v;
  inp.value = v;
};

window.toggleSenha = function(inputId, btnId) {
  const inp = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!inp) return;
  const mostrando = inp.type === 'text';
  inp.type = mostrando ? 'password' : 'text';
  if (btn) btn.textContent = mostrando ? '\u{1F441}' : '\u{1F648}';
};

// ─────────────────────────────────────────────────────────────────────────────
// CAMPOS SALVOS NO LOCALSTORAGE — apenas o necessário, sem dados sensíveis
// ─────────────────────────────────────────────────────────────────────────────
const CAMPOS_PUBLICOS_ESTAB = [
  'id', 'nome', 'slug', 'cidade', 'status', 'plano',
  'cor_primaria', 'logo_url', 'descricao', 'faz_entrega',
  'faz_retirada', 'taxa_entrega', 'tempo_entrega', 'aberto',
  'assinatura_vencimento', 'num_mesas', 'aceita_pix',
  'aceita_cartao', 'aceita_dinheiro', 'instagram', 'tiktok',
  'site', 'msg_nota', 'taxa_servico', 'perc_servico',
  'created_at',        // necessário para calcular os 15 dias de trial
  'pagamento_status',  // necessário para exibir status do plano no dashboard
];

function filtrarEstabParaStorage(estab) {
  // Remove campos sensíveis: cpf_cnpj, telefone, nome_responsavel, user_id
  return Object.fromEntries(
    CAMPOS_PUBLICOS_ESTAB
      .filter(k => k in estab)
      .map(k => [k, estab[k]])
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLUG
// ─────────────────────────────────────────────────────────────────────────────
async function slugLivre(slug) {
  // Valida formato antes de consultar o banco
  if (!slug || slug.length < 2 || !/^[a-z0-9-]+$/.test(slug)) return false;
  const { data } = await getSupa()
    .from('estabelecimentos').select('id').eq('slug', slug).maybeSingle();
  return !data;
}

// ─────────────────────────────────────────────────────────────────────────────
// CADASTRO
// ─────────────────────────────────────────────────────────────────────────────
export async function doRegister() {
  const nomeP  = document.getElementById('rnome')?.value.trim();
  const tel    = document.getElementById('rtel')?.value.trim();
  const nome   = document.getElementById('rn')?.value.trim();
  const cidade = document.getElementById('rcidade')?.value.trim() || null;
  const doc    = document.getElementById('rdoc')?.value.trim();
  const email  = document.getElementById('re')?.value.trim().toLowerCase();
  const pass   = document.getElementById('rp')?.value;

  // ── Validações de presença ─────────────────────────────
  if (!nomeP)          return showToast('Digite seu nome completo.', 'error');
  if (!tel || tel.replace(/\D/g,'').length < 10) return showToast('Digite um WhatsApp válido com DDD.', 'error');
  if (!nome)           return showToast('Digite o nome do estabelecimento.', 'error');
  if (!cidade)         return showToast('Digite a cidade do estabelecimento.', 'error');
  if (!doc)            return showToast('Digite o CPF ou CNPJ.', 'error');
  if (!email)          return showToast('Digite o e-mail.', 'error');
  if (!pass)           return showToast('Digite uma senha.', 'error');

  // ── Validações de formato ──────────────────────────────
  if (!validarEmail(email))   return showToast('E-mail com formato inválido.', 'error');
  if (!docValido(doc))        return showToast('CPF ou CNPJ inválido.', 'error');
  if (pass.length < 8)        return showToast('Senha mínima: 8 caracteres.', 'error');

  // ── Validações de tamanho (evita payloads gigantes) ────
  if (!validarTamanho(nomeP,  'nome'))   return showToast('Nome muito longo.', 'error');
  if (!validarTamanho(nome,   'nome'))   return showToast('Nome do estabelecimento muito longo.', 'error');
  if (!validarTamanho(cidade, 'cidade')) return showToast('Cidade muito longa.', 'error');
  if (!validarTamanho(email,  'email'))  return showToast('E-mail muito longo.', 'error');

  // ── Rate limiting: máx 3 cadastros por sessão ──────────
  if (bloqueado('register', 3)) {
    return showToast('Muitas tentativas de cadastro. Aguarde alguns minutos.', 'error');
  }
  registrarTentativa('register');

  const btn = document.querySelector('[onclick="doRegister()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Criando...'; }

  try {
    const { data: authData, error: authErr } = await getSupa().auth.signUp({ email, password: pass });
    if (authErr) throw new Error(authErr.message);

    let userId = authData?.user?.id || authData?.session?.user?.id;

    if (!userId) {
      const { data: loginData, error: loginErr } = await getSupa().auth.signInWithPassword({ email, password: pass });
      if (loginErr) throw new Error('Conta criada! Verifique seu e-mail e faça login.');
      userId = loginData?.user?.id;
    }

    if (!userId) throw new Error('Sessão inválida. Tente fazer login.');

    // ── Slug seguro ────────────────────────────────────────
    let slug = gerarSlug(nome);
    if (!slug || slug.length < 2) slug = 'loja';
    // Garante que o slug é alfanumérico com hífens
    slug = slug.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 60);

    let t = 0;
    while (!(await slugLivre(slug))) {
      t++;
      slug = gerarSlug(nome).slice(0, 55) + '-' + t;
      if (t > 99) { slug = gerarSlug(nome).slice(0, 45) + '-' + Date.now(); break; }
    }

    const telSoNumeros = tel.replace(/\D/g,'');
    const { error: dbErr } = await getSupa().from('estabelecimentos').insert({
      user_id:          userId,
      nome:             nome.slice(0, 120),
      slug,
      cidade:           cidade.slice(0, 80),
      cpf_cnpj:         doc.replace(/\D/g,''),
      nome_responsavel: nomeP.slice(0, 120),
      telefone:         telSoNumeros,
      status:           'ativo',
      plano:            'basico',
    });

    if (dbErr) {
      if (dbErr.message?.includes('duplicate') || dbErr.code === '23505') {
        throw new Error('Este link de loja já está em uso. Tente um nome diferente.');
      }
      throw new Error('Erro ao salvar. Tente novamente.');
      // Não expõe dbErr.message em produção — pode conter info interna
    }

    goTo('s-sucesso');

  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Criar conta grátis'; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────────────────
export async function doLogin() {
  const email = document.getElementById('le')?.value.trim().toLowerCase();
  const pass  = document.getElementById('lp')?.value;

  if (!email) return showToast('Digite o e-mail.', 'error');
  if (!pass)  return showToast('Digite a senha.', 'error');

  // ── Validação de formato ───────────────────────────────
  if (!validarEmail(email)) return showToast('E-mail com formato inválido.', 'error');

  // ── Rate limiting: máx 5 tentativas em 5 minutos ───────
  const chave = 'login_' + email;
  if (bloqueado(chave, 5)) {
    return showToast('Muitas tentativas. Aguarde alguns minutos e tente novamente.', 'error');
  }

  const btn = document.querySelector('[onclick="doLogin()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }

  try {
    const { data: authData, error: authErr } = await getSupa().auth.signInWithPassword({ email, password: pass });

    if (authErr) {
      registrarTentativa(chave); // conta tentativas só em caso de falha
      const msg = authErr.message || '';
      if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
        throw new Error('E-mail ou senha incorretos. Verifique e tente novamente.');
      }
      if (msg.includes('Email not confirmed')) {
        throw new Error('Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.');
      }
      if (msg.includes('Too many requests')) {
        throw new Error('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      }
      // Mensagem genérica — não expõe detalhes internos
      throw new Error('Não foi possível entrar. Verifique seus dados e tente novamente.');
    }

    const userId = authData?.user?.id;
    if (!userId) throw new Error('Sessão inválida. Tente novamente.');

    // ── Busca só os campos necessários (sem CPF, telefone, etc.) ──
    const { data: estab, error: dbErr } = await getSupa()
      .from('estabelecimentos')
      .select(CAMPOS_PUBLICOS_ESTAB.join(','))
      .eq('user_id', userId)
      .maybeSingle();

    if (dbErr) throw new Error('Erro ao carregar dados da loja.');
    // Não expõe dbErr.message — pode conter info interna do banco

    if (!estab) {
      showToast('Conta encontrada! Complete o cadastro da sua loja.', 'info');
      goTo('s-register');
      return;
    }

    // ── Salva no estado global e storage sem dados sensíveis ──
    const estabSeguro = filtrarEstabParaStorage(estab);
    window._estab = estabSeguro;
    localStorage.setItem('pw_estab', JSON.stringify(estabSeguro));
    localStorage.setItem('pw_tela_atual', 's-dash');
    goTo('s-dash');
    if (window.initDashboard) await window.initDashboard();

  } catch (e) {
    // Nunca loga no console em produção — use apenas showToast
    if (import.meta.env.DEV) console.error('[doLogin]', e);
    showToast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RECUPERAÇÃO DE SENHA
// ─────────────────────────────────────────────────────────────────────────────
let _recEmailVerificado = null;

function recAtivarStep(n) {
  [1,2,3].forEach(i => {
    const d   = document.getElementById('rec-passo' + i);
    const dot = document.getElementById('step-dot-' + i);
    if (d) d.style.display = i === n ? 'block' : 'none';
    if (dot) {
      dot.style.background = i < n ? '#16a34a' : i === n ? 'var(--red)' : '#2a2a2a';
      dot.style.color      = i <= n ? '#fff' : '#555';
      dot.textContent      = i < n ? '✓' : String(i);
    }
    if (i < 3) {
      const line = document.getElementById('step-line-' + i);
      if (line) line.style.background = i < n ? '#16a34a' : '#2a2a2a';
    }
  });
}

window.recVoltar = function(passo) { recAtivarStep(passo); };

window.recPasso1 = function() {
  const email = document.getElementById('rec-email')?.value.trim().toLowerCase();
  if (!email || !validarEmail(email)) return showToast('Digite um e-mail válido.', 'error');
  _recEmailVerificado = email;
  recAtivarStep(2);
};

window.recPasso2 = async function() {
  const tel  = document.getElementById('rec-tel')?.value.trim();
  const tel9 = tel.replace(/\D/g,'');

  if (!tel9 || tel9.length < 10) return showToast('Digite o WhatsApp completo com DDD.', 'error');

  // ── Rate limiting: máx 3 tentativas de recuperação ─────
  if (bloqueado('recovery', 3)) {
    return showToast('Muitas tentativas. Aguarde alguns minutos.', 'error');
  }
  registrarTentativa('recovery');

  const btn = document.querySelector('[onclick="recPasso2()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando...'; }

  try {
    const { data: estabs, error: dbErr } = await getSupa()
      .from('estabelecimentos')
      .select('id')          // só confirma existência — sem expor user_id ou telefone
      .eq('telefone', tel9)
      .limit(1);

    if (dbErr) throw new Error('Erro ao verificar. Tente novamente.');

    // ── IMPORTANTE: resposta igual independente de encontrar ou não ──
    // Isso evita enumeração: atacante não sabe se o telefone existe
    const { error: resetErr } = await getSupa().auth.resetPasswordForEmail(
      _recEmailVerificado,
      { redirectTo: window.location.origin }
    );

    // Não lança erro mesmo se resetErr existir — evita confirmar se e-mail está cadastrado
    if (resetErr && import.meta.env.DEV) {
      console.warn('[recPasso2] resetPasswordForEmail:', resetErr.message);
    }

    // Avança sempre — se o telefone/e-mail não existir, o usuário simplesmente não recebe e-mail
    if (!estabs || estabs.length === 0) {
      // Simula delay para não revelar por timing que o telefone não existe
      await new Promise(r => setTimeout(r, 800));
    }

    recAtivarStep(3);

  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar identidade →'; }
  }
};

window.salvarNovaSenha = async function() {
  const nova = document.getElementById('rec-nova')?.value;
  const conf = document.getElementById('rec-conf')?.value;

  if (!nova || nova.length < 8) return showToast('Senha mínima: 8 caracteres.', 'error');
  if (nova !== conf)            return showToast('As senhas não coincidem.', 'error');

  const btn = document.querySelector('[onclick="salvarNovaSenha()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  try {
    const { error } = await getSupa().auth.updateUser({ password: nova });
    if (error) throw new Error('Não foi possível atualizar a senha. O link pode ter expirado.');

    showToast('✅ Senha atualizada! Faça login.', 'info');
    setTimeout(() => goTo('s-login'), 1800);

  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔐 Salvar nova senha'; }
  }
};
