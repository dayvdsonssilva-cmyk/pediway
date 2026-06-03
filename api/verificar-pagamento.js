// api/verificar-pagamento.js
import { createClient } from '@supabase/supabase-js';

const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
const SUPA_URL = process.env.SUPA_URL;
const SUPA_SVC = process.env.SUPA_SERVICE_KEY;

// ── Rate limiting simples em memória (por IP) ──────────────────────────────────
// Para produção escalável, substitua por Redis/Upstash
const _consultas = new Map();
function rateLimitOk(ip) {
  const agora = Date.now();
  const janela = 60 * 1000; // 1 minuto
  const MAX = 20;
  const lista = (_consultas.get(ip) || []).filter(t => agora - t < janela);
  if (lista.length >= MAX) return false;
  lista.push(agora);
  _consultas.set(ip, lista);
  return true;
}

// ── Verifica JWT do Supabase ───────────────────────────────────────────────────
async function autenticar(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return null;
  try {
    const supa = createClient(SUPA_URL, process.env.SUPA_ANON_KEY);
    const { data: { user }, error } = await supa.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // CORS restrito
  const ORIGENS = ['https://pediway.vercel.app'];
  const origem = req.headers.origin || '';
  if (ORIGENS.includes(origem)) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  // ── Verifica variáveis críticas ───────────────────────────────────────────────
  if (!MP_TOKEN || !SUPA_URL || !SUPA_SVC) {
    return res.status(500).json({ error: 'Serviço indisponível.' });
  }

  // ── Autenticação obrigatória ──────────────────────────────────────────────────
  const userId = await autenticar(req);
  if (!userId) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  // ── Rate limiting por IP ──────────────────────────────────────────────────────
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
  if (!rateLimitOk(ip)) {
    return res.status(429).json({ error: 'Muitas consultas. Aguarde um momento.' });
  }

  const { id } = req.query;
  if (!id || !/^\d+$/.test(String(id))) {
    return res.status(400).json({ error: 'ID inválido.' });
  }

  try {
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
    });

    if (!mpRes.ok) return res.status(400).json({ error: 'Erro ao consultar pagamento.' });

    const data = await mpRes.json();

    // ── Verifica que o pagamento pertence ao usuário autenticado ──────────────
    const extRef   = data.external_reference || '';
    const estabId  = data.metadata?.estab_id || extRef.split('__')[0];
    const plano    = data.metadata?.plano    || extRef.split('__')[1];

    if (estabId) {
      const supa = createClient(SUPA_URL, SUPA_SVC);
      const { data: estab } = await supa
        .from('estabelecimentos')
        .select('id')
        .eq('id', estabId)
        .eq('user_id', userId)
        .maybeSingle();

      // Bloqueia silenciosamente se não for o dono
      if (!estab) {
        console.warn('[verificar-pagamento] Tentativa de consulta não autorizada:', { userId, estabId, id });
        return res.status(403).json({ error: 'Acesso negado.' });
      }
    }

    // ── Se aprovado, garante ativação do plano (idempotente) ─────────────────
    if (data.status === 'approved' && estabId && plano && SUPA_SVC) {
      const supa = createClient(SUPA_URL, SUPA_SVC);
      const venc = new Date();
      venc.setDate(venc.getDate() + 30);
      await supa.from('estabelecimentos').update({
        plano,
        pagamento_status:      'pago',
        assinatura_vencimento: venc.toISOString().slice(0, 10),
      }).eq('id', estabId);
    }

    // Retorna apenas o necessário — sem expor dados internos do MP
    return res.status(200).json({
      status:        data.status,
      status_detail: data.status_detail,
    });

  } catch (e) {
    console.error('[verificar-pagamento] Erro interno');
    return res.status(500).json({ error: 'Erro ao verificar pagamento.' });
  }
}
