// api/webhook-mp.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET; // configure no painel do MP
const SUPA_URL   = process.env.SUPA_URL;
const SUPA_SVC   = process.env.SUPA_SERVICE_KEY;

// ─── Verificação de assinatura do Mercado Pago ────────────────────────────────
// Documentação: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
function verificarAssinaturaMP(req) {
  // Se não há secret configurado, bloqueia em produção
  if (!MP_WEBHOOK_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[webhook] MP_WEBHOOK_SECRET não configurado — bloqueando em produção');
      return false;
    }
    // Em dev, avisa mas permite
    console.warn('[webhook] MP_WEBHOOK_SECRET não configurado — verificação ignorada em dev');
    return true;
  }

  try {
    // O MP envia: x-signature: ts=<timestamp>,v1=<hash>
    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];

    if (!xSignature) return false;

    // Extrai timestamp e hash da assinatura
    const parts = Object.fromEntries(
      xSignature.split(',').map(p => p.split('='))
    );
    const ts   = parts['ts'];
    const hash = parts['v1'];
    if (!ts || !hash) return false;

    // Monta a string que o MP assinou
    const dataId   = req.body?.data?.id ?? '';
    const manifest = `id:${dataId};request-id:${xRequestId ?? ''};ts:${ts};`;

    // Recalcula o HMAC
    const expected = crypto
      .createHmac('sha256', MP_WEBHOOK_SECRET)
      .update(manifest)
      .digest('hex');

    // Comparação segura (evita timing attack)
    return crypto.timingSafeEqual(
      Buffer.from(hash,     'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch (e) {
    console.error('[webhook] Erro na verificação de assinatura:', e.message);
    return false;
  }
}

export default async function handler(req, res) {
  // MP faz GET para validar a URL ao configurar
  if (req.method === 'GET') return res.status(200).send('OK');
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  // ── Verifica assinatura ANTES de qualquer processamento ──────────────────────
  if (!verificarAssinaturaMP(req)) {
    console.warn('[webhook] Assinatura inválida — requisição rejeitada');
    return res.status(401).send('Unauthorized');
  }

  // Verifica variáveis críticas
  if (!MP_ACCESS_TOKEN || !SUPA_URL || !SUPA_SVC) {
    console.error('[webhook] Variáveis de ambiente faltando');
    return res.status(200).send('config error'); // 200 para MP não retentar
  }

  const { type, data } = req.body || {};

  if (type !== 'payment' || !data?.id) return res.status(200).send('ignored');

  // Valida que o ID é numérico (evita SSRF com IDs malformados)
  if (!/^\d+$/.test(String(data.id))) {
    console.warn('[webhook] ID inválido recebido:', data.id);
    return res.status(200).send('invalid id');
  }

  try {
    // Busca o pagamento no MP para confirmar status real
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
    });

    if (!mpRes.ok) {
      console.error('[webhook] Erro ao buscar pagamento:', mpRes.status);
      return res.status(200).send('mp fetch error');
    }

    const pag = await mpRes.json();
    const { status, metadata, external_reference } = pag;

    // ── Extrai e valida estabId e plano ──────────────────────────────────────
    let estabId = metadata?.estab_id;
    let plano   = metadata?.plano;

    if (!estabId && external_reference) {
      const parts = external_reference.split('__');
      estabId = parts[0];
      plano   = parts[1];
    }

    // Valida formato: estabId deve ser UUID, plano deve ser conhecido
    const PLANOS_VALIDOS = ['pro', 'premium', 'basico'];
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!estabId || !UUID_REGEX.test(estabId)) {
      console.warn('[webhook] estabId inválido:', estabId);
      return res.status(200).send('invalid estabId');
    }

    if (!plano || !PLANOS_VALIDOS.includes(plano)) {
      console.warn('[webhook] plano inválido:', plano);
      return res.status(200).send('invalid plano');
    }

    // ── Verifica se o valor pago corresponde ao plano (evita pagamento parcial) ──
    const PRECOS = { pro: 49, premium: 99, basico: 0 };
    const valorPago = Number(pag.transaction_amount || 0);
    if (status === 'approved' && valorPago < PRECOS[plano]) {
      console.error(`[webhook] Valor pago R$${valorPago} menor que plano ${plano} (R$${PRECOS[plano]})`);
      return res.status(200).send('valor insuficiente');
    }

    const supa = createClient(SUPA_URL, SUPA_SVC);

    if (status === 'approved') {
      const venc = new Date();
      venc.setDate(venc.getDate() + 30);
      const { error } = await supa.from('estabelecimentos').update({
        plano,
        pagamento_status:      'pago',
        assinatura_vencimento: venc.toISOString().slice(0, 10),
        aberto:                true,
      }).eq('id', estabId);

      if (error) console.error('[webhook] Erro ao ativar plano:', error.message);
      else console.log(`[webhook] Plano ${plano} ativado para ${estabId}`);

    } else if (['cancelled', 'rejected', 'refunded', 'charged_back'].includes(status)) {
      await supa.from('estabelecimentos').update({
        pagamento_status: 'cancelado',
      }).eq('id', estabId);
      console.log(`[webhook] Pagamento ${status} para ${estabId}`);

    } else if (status === 'pending' || status === 'in_process') {
      await supa.from('estabelecimentos').update({
        pagamento_status: 'pendente',
      }).eq('id', estabId);
      console.log(`[webhook] Pagamento pendente para ${estabId}`);
    }

    return res.status(200).send('ok');

  } catch (e) {
    // Não expõe detalhes do erro — loga internamente
    console.error('[webhook] Erro interno:', e.message);
    return res.status(200).send('error'); // 200 para o MP não retentar em loop
  }
}
