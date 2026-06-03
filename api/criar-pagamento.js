// api/criar-pagamento.js — Vercel Serverless Function
import { createClient } from '@supabase/supabase-js';

const MP_TOKEN  = process.env.MP_ACCESS_TOKEN;
const SUPA_URL  = process.env.SUPA_URL;
const SUPA_SVC  = process.env.SUPA_SERVICE_KEY;
const SITE_URL  = process.env.SITE_URL || 'https://pediway.vercel.app';

// Planos válidos — preços são lidos do banco em tempo real
const PLANOS_VALIDOS = ['pro', 'premium'];

// ── CORS restrito ao domínio da aplicação ─────────────────────────────────────
const ORIGENS_PERMITIDAS = [
  'https://pediway.vercel.app',
  'https://www.pediway.vercel.app',
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://localhost:3000'] : []),
];

function setCors(req, res) {
  const origem = req.headers.origin || '';
  if (ORIGENS_PERMITIDAS.includes(origem)) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── Verifica JWT do Supabase e retorna userId ──────────────────────────────────
async function autenticar(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return null;

  try {
    // Usa a anon key para verificar o JWT (não precisa da service key)
    const supa = createClient(SUPA_URL, process.env.SUPA_ANON_KEY);
    const { data: { user }, error } = await supa.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  // ── Verifica variáveis críticas ───────────────────────────────────────────────
  if (!MP_TOKEN || !SUPA_URL || !SUPA_SVC) {
    console.error('[criar-pagamento] Variáveis de ambiente faltando');
    return res.status(500).json({ error: 'Serviço temporariamente indisponível.' });
  }

  // ── Autenticação obrigatória ──────────────────────────────────────────────────
  const userId = await autenticar(req);
  if (!userId) {
    return res.status(401).json({ error: 'Não autorizado. Faça login e tente novamente.' });
  }

  const { type, plano, estabId, doc, email, nome } = req.body || {};

  // ── Validações básicas ────────────────────────────────────────────────────────
  if (!plano || !PLANOS_VALIDOS.includes(plano)) return res.status(400).json({ error: 'Plano inválido.' });
  if (!estabId)                  return res.status(400).json({ error: 'Estabelecimento não identificado.' });

  // Valida formato UUID do estabId
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(estabId)) {
    return res.status(400).json({ error: 'Estabelecimento inválido.' });
  }

  // ── Verifica que o estabId pertence ao userId autenticado ──────────────────
  const supa = createClient(SUPA_URL, SUPA_SVC);
  const { data: estab, error: estabErr } = await supa
    .from('estabelecimentos')
    .select('id, user_id, plano')
    .eq('id', estabId)
    .eq('user_id', userId)  // garante que só o dono pode pagar pelo próprio plano
    .maybeSingle();

  if (estabErr || !estab) {
    console.warn('[criar-pagamento] Tentativa de acesso não autorizado:', { userId, estabId });
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  // ── Preços lidos do banco em tempo real — reflete o que o admin configurou ────
  const { data: cfgPrecos } = await supa
    .from('pediway_config')
    .select('preco_pro, preco_prem')
    .eq('id', 'global')
    .maybeSingle();

  const PRECOS = {
    pro:     Number(cfgPrecos?.preco_pro  || 49),
    premium: Number(cfgPrecos?.preco_prem || 99),
  };

  // ── Valor SEMPRE vem do servidor — ignora qualquer valor do frontend ──────────
  const valor = PRECOS[plano];
  const extRef = `${estabId}__${plano}__${Date.now()}`;
  const notifUrl = `${SITE_URL}/api/webhook-mp`;

  try {
    let body;

    if (type === 'card') {
      const cardData = req.body.cardData || {};
      const token = cardData.token;

      if (!token || typeof token !== 'string' || token.length < 10) {
        return res.status(400).json({
          error: 'Token de cartão inválido. Preencha novamente e clique em "Pagar".'
        });
      }

      body = {
        transaction_amount: valor,
        token,
        installments:       Math.max(1, Math.min(12, Number(cardData.installments) || 1)),
        payment_method_id:  String(cardData.payment_method_id || '').slice(0, 50),
        issuer_id:          cardData.issuer_id || '',
        description:        `PEDIWAY — Plano ${plano} (mensal)`,
        payer: {
          email:          String(cardData.payer?.email || '').slice(0, 200),
          identification: cardData.payer?.identification || {},
        },
        metadata:           { plano, estab_id: estabId },
        external_reference: extRef,
        notification_url:   notifUrl,
      };

    } else if (type === 'pix') {
      if (!doc || !email) return res.status(400).json({ error: 'CPF/CNPJ e e-mail obrigatórios.' });

      const docLimpo = String(doc).replace(/\D/g, '');
      if (docLimpo.length !== 11 && docLimpo.length !== 14) {
        return res.status(400).json({ error: 'CPF/CNPJ inválido.' });
      }

      body = {
        transaction_amount: valor,
        description:        `PEDIWAY — Plano ${plano} (mensal)`,
        payment_method_id:  'pix',
        payer: {
          email:          String(email).slice(0, 200),
          identification: { type: docLimpo.length === 11 ? 'CPF' : 'CNPJ', number: docLimpo },
        },
        metadata:           { plano, estab_id: estabId },
        external_reference: extRef,
        notification_url:   notifUrl,
      };

    } else if (type === 'boleto') {
      if (!doc || !email || !nome) return res.status(400).json({ error: 'Dados incompletos para boleto.' });

      const docLimpo = String(doc).replace(/\D/g, '');
      if (docLimpo.length !== 11 && docLimpo.length !== 14) {
        return res.status(400).json({ error: 'CPF/CNPJ inválido.' });
      }

      const nomeLimpo = String(nome).slice(0, 120).trim();
      body = {
        transaction_amount: valor,
        description:        `PEDIWAY — Plano ${plano} (mensal)`,
        payment_method_id:  'bolbradesco',
        payer: {
          email:      String(email).slice(0, 200),
          first_name: nomeLimpo.split(' ')[0],
          last_name:  nomeLimpo.split(' ').slice(1).join(' ') || '-',
          identification: { type: docLimpo.length === 11 ? 'CPF' : 'CNPJ', number: docLimpo },
        },
        metadata:           { plano, estab_id: estabId },
        external_reference: extRef,
        notification_url:   notifUrl,
      };

    } else {
      return res.status(400).json({ error: 'Tipo de pagamento inválido.' });
    }

    // ── Chama API do Mercado Pago ────────────────────────────────────────────────
    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method:  'POST',
      headers: {
        'Authorization':     `Bearer ${MP_TOKEN}`,
        'Content-Type':      'application/json',
        'X-Idempotency-Key': extRef,
      },
      body: JSON.stringify(body),
    });

    const mpData = await mpRes.json();

    // Log mínimo — sem dados sensíveis
    console.log('[MP] status:', mpData.status, '| id:', mpData.id, '| plano:', plano);

    if (!mpRes.ok) {
      console.error('[MP] Erro código:', mpRes.status);
      const detail = mpData.cause?.[0]?.description || mpData.message || 'Pagamento não processado.';
      return res.status(400).json({ error: detail });
    }

    if (mpData.status === 'rejected') {
      const detail = mpData.status_detail || 'cc_rejected_other_reason';
      return res.status(400).json({ error: detalharRejeicao(detail), status_detail: detail });
    }

    // ── Cartão aprovado imediatamente → ativa plano ──────────────────────────────
    if (mpData.status === 'approved') {
      await ativarPlano(supa, estabId, plano);
    }

    return res.status(200).json({
      id:             mpData.id,
      status:         mpData.status,
      status_detail:  mpData.status_detail,
      qr_code:        mpData.point_of_interaction?.transaction_data?.qr_code,
      qr_code_base64: mpData.point_of_interaction?.transaction_data?.qr_code_base64,
      boleto_url:     mpData.transaction_details?.external_resource_url,
    });

  } catch (e) {
    console.error('[criar-pagamento] Erro interno');
    return res.status(500).json({ error: 'Erro ao processar pagamento. Tente novamente.' });
    // Nunca expõe e.message em produção
  }
}

function detalharRejeicao(detail) {
  const map = {
    'cc_rejected_insufficient_amount':     'Saldo insuficiente no cartão. Tente outro cartão.',
    'cc_rejected_bad_filled_security_code':'Código de segurança (CVV) incorreto.',
    'cc_rejected_bad_filled_date':         'Data de validade incorreta.',
    'cc_rejected_bad_filled_other':        'Dados do cartão incorretos. Confira número, validade e CVV.',
    'cc_rejected_call_for_authorize':      'Seu banco precisa autorizar este pagamento. Ligue para o banco.',
    'cc_rejected_card_disabled':           'Cartão desabilitado. Entre em contato com seu banco.',
    'cc_rejected_duplicated_payment':      'Pagamento duplicado recente. Aguarde alguns minutos.',
    'cc_rejected_high_risk':               'Pagamento recusado por segurança. Tente outro cartão.',
    'cc_rejected_max_attempts':            'Muitas tentativas recusadas. Aguarde e tente novamente.',
    'cc_rejected_other_reason':            'Pagamento recusado pelo banco. Tente outro cartão ou use PIX.',
    'pending_waiting_payment':             'Aguardando confirmação do pagamento.',
    'pending_contingency':                 'Pagamento em análise. Aguarde confirmação por e-mail.',
  };
  return map[detail] || 'Pagamento recusado. Tente outro cartão ou use PIX.';
  // Não inclui o detail code na resposta em produção
}

async function ativarPlano(supa, estabId, plano) {
  try {
    const venc = new Date();
    venc.setDate(venc.getDate() + 30);
    const { error } = await supa.from('estabelecimentos').update({
      plano,
      pagamento_status:      'pago',
      assinatura_vencimento: venc.toISOString().slice(0, 10),
      aberto:                true,
    }).eq('id', estabId);
    if (error) console.error('[ativarPlano] erro:', error.message);
    else console.log('[ativarPlano] plano', plano, 'ativado para', estabId);
  } catch (e) {
    console.error('[ativarPlano] catch');
  }
}
