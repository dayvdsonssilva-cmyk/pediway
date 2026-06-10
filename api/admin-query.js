// api/admin-query.js — Proxy seguro para queries de admin (service_role)
// A SRK nunca aparece no frontend — fica só aqui como variável de ambiente do Vercel

const SUPA_URL  = process.env.SUPA_URL;
const SUPA_SVC  = process.env.SUPA_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_QUERY_SECRET; // token extra de segurança

const ORIGENS_PERMITIDAS = [
  'https://pediway.vercel.app',
  'https://www.pediway.com.br',
  'https://pediway.com.br',
];

// Tabelas que o admin pode consultar via este endpoint
const TABELAS_PERMITIDAS = [
  'estabelecimentos',
  'pedidos',
  'produtos',
  'avaliacoes',
  'assinaturas',
  'aceites_termos',
  'pediway_config',
  'clientes',
];

export default async function handler(req, res) {
  // CORS
  const origem = req.headers.origin || '';
  const origemOk = ORIGENS_PERMITIDAS.includes(origem) || origem.includes('localhost');
  res.setHeader('Access-Control-Allow-Origin', origemOk ? origem : ORIGENS_PERMITIDAS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verifica token de segurança
  const secret = req.headers['x-admin-secret'] || '';
  if (ADMIN_SECRET && secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  if (!SUPA_URL || !SUPA_SVC) {
    return res.status(500).json({ error: 'Configuração do servidor incompleta.' });
  }

  const { table, method = 'GET', query = '', body } = req.body || {};

  if (!table) return res.status(400).json({ error: 'Parâmetro "table" obrigatório.' });
  if (!TABELAS_PERMITIDAS.includes(table)) {
    return res.status(403).json({ error: `Tabela "${table}" não permitida.` });
  }

  const url = `${SUPA_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const opts = {
    method,
    headers: {
      'apikey':        SUPA_SVC,
      'Authorization': 'Bearer ' + SUPA_SVC,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    },
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  try {
    const r    = await fetch(url, opts);
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message || data.hint || 'Erro Supabase' });
    return res.status(200).json(Array.isArray(data) ? data : [data]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
