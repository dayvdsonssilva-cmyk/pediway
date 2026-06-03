// src/supabase.js
import { createClient } from '@supabase/supabase-js';

// ─── Variáveis de ambiente ────────────────────────────────────────────────────
const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isProd          = import.meta.env.PROD; // true em produção (Vercel)

// ─── Validação de formato das variáveis ──────────────────────────────────────
function validarEnvs() {
  const erros = [];

  if (!supabaseUrl)
    erros.push('VITE_SUPABASE_URL não definida');
  else if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co'))
    erros.push('VITE_SUPABASE_URL com formato inválido');

  if (!supabaseAnonKey)
    erros.push('VITE_SUPABASE_ANON_KEY não definida');
  else if (!supabaseAnonKey.startsWith('eyJ'))
    erros.push('VITE_SUPABASE_ANON_KEY com formato inválido (não é JWT)');

  return erros;
}

// ─── Singleton com proteção contra race condition ─────────────────────────────
let _client    = null;
let _initLock  = false;
let _initError = null;

export function getSupa() {
  if (_client) return _client;
  if (_initError) return null;
  if (_initLock) return null;
  _initLock = true;

  try {
    const erros = validarEnvs();
    if (erros.length > 0) {
      if (!isProd) console.error('[Supabase] Erro de configuração:', erros.join(' | '));
      _initError = erros.join(', ');
      return null;
    }

    _client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession:     true,   // mantém sessão no localStorage
        detectSessionInUrl: true,   // captura token de reset de senha na URL
        autoRefreshToken:   true,   // renova JWT antes de expirar
      },
      global: {
        headers: { 'x-app-name': 'pediway-web' }, // identifica origem nos logs
      },
    });

    if (!isProd) console.log('[Supabase] Cliente criado em modo desenvolvimento.');
    return _client;

  } catch (e) {
    _initError = e.message;
    if (!isProd) console.error('[Supabase] Falha ao criar cliente:', e.message);
    return null;
  } finally {
    _initLock = false;
  }
}

// ─── Helper: retorna cliente + userId verificados ────────────────────────────
// Use em operações que EXIGEM autenticação (salvar config, acessar pedidos, etc.)
export async function getSupaAuth() {
  const client = getSupa();
  if (!client) return { client: null, userId: null };

  const { data: { session } } = await client.auth.getSession();
  if (!session?.user?.id) return { client: null, userId: null };

  return { client, userId: session.user.id };
}

// ─── Diagnóstico (apenas em desenvolvimento) ─────────────────────────────────
// Para usar: no console do browser, chame window._supabaseDiag?.()
export async function diagnostico() {
  if (isProd) return; // nunca roda em produção

  const erros = validarEnvs();
  if (erros.length) { console.error('[Supabase] Config inválida:', erros); return; }

  const client = getSupa();
  if (!client) { console.error('[Supabase] Cliente não inicializado.'); return; }

  const { data: { session } } = await client.auth.getSession();
  console.table({
    'URL':          '✅ OK',
    'Chave':        '✅ OK',
    'Sessão ativa': session ? '✅ ' + session.user.email : '❌ Não autenticado',
    'Expira em':    session ? new Date(session.expires_at * 1000).toLocaleString('pt-BR') : '—',
  });
}
