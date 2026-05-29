// api/push-send.js
// Envia notificação push para o celular do cliente
// Chamado pelo dashboard quando o status do pedido muda
//
// Variáveis de ambiente no Vercel:
//   VAPID_PUBLIC_KEY   → chave pública VAPID
//   VAPID_PRIVATE_KEY  → chave privada VAPID
//   VAPID_EMAIL        → mailto:seuemail@gmail.com
//   SUPABASE_URL       → URL do seu Supabase
//   SUPABASE_SERVICE_KEY → service_role key do Supabase

export const maxDuration = 15;

const MSGS = {
  preparo: {
    title: '🍳 Pedido aceito!',
    body:  'Seu pedido #{id} foi aceito e está sendo preparado. Ficará pronto em breve!'
  },
  pronto_retirada: {
    title: '✅ Pedido pronto!',
    body:  'Seu pedido #{id} está PRONTO! Pode vir buscar. 🎉'
  },
  pronto_entrega: {
    title: '🛵 Saiu para entrega!',
    body:  'Seu pedido #{id} saiu para entrega! Aguarde em breve. 🙌'
  },
  recusado: {
    title: '❌ Pedido não confirmado',
    body:  'Infelizmente seu pedido #{id} não pôde ser confirmado. Entre em contato com o restaurante.'
  },
  finalizado: {
    title: '⭐ Pedido entregue!',
    body:  'Seu pedido #{id} foi entregue! Que tal deixar uma avaliação?'
  }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pedidoId, status, isDelivery } = req.body || {};
  if (!pedidoId || !status) return res.status(400).json({ error: 'pedidoId e status são obrigatórios' });

  const VAPID_PUB  = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIV = process.env.VAPID_PRIVATE_KEY;
  const VAPID_MAIL = process.env.VAPID_EMAIL;
  const SUPA_URL   = process.env.SUPABASE_URL;
  const SUPA_KEY   = process.env.SUPABASE_SERVICE_KEY;

  if (!VAPID_PUB || !VAPID_PRIV) {
    return res.status(500).json({ error: 'VAPID keys não configuradas. Rode: npx web-push generate-vapid-keys' });
  }

  try {
    // 1. Busca subscriptions do pedido no Supabase
    const dbRes = await fetch(
      `${SUPA_URL}/rest/v1/push_subscriptions?pedido_id=eq.${pedidoId}&select=subscription`,
      {
        headers: {
          apikey: SUPA_KEY,
          Authorization: `Bearer ${SUPA_KEY}`,
        }
      }
    );
    const subs = await dbRes.json();
    if (!subs?.length) {
      return res.status(200).json({ sent: 0, message: 'Nenhuma subscription para este pedido' });
    }

    // 2. Monta a mensagem
    const msgKey = status === 'pronto'
      ? (isDelivery ? 'pronto_entrega' : 'pronto_retirada')
      : status;

    const tpl = MSGS[msgKey];
    if (!tpl) return res.status(200).json({ sent: 0, message: 'Status sem mensagem configurada' });

    const numId = String(pedidoId).slice(-4).toUpperCase();
    const payload = JSON.stringify({
      title: tpl.title,
      body:  tpl.body.replace('{id}', '#' + numId),
      tag:   'pedido-' + pedidoId,
      url:   '/meu-pedido?id=' + pedidoId,
      data:  { pedidoId, status }
    });

    // 3. Importa web-push e envia para cada subscription
    const webpush = await import('web-push');
    webpush.default.setVapidDetails(VAPID_MAIL, VAPID_PUB, VAPID_PRIV);

    let sent = 0, failed = 0;
    await Promise.all(subs.map(async ({ subscription }) => {
      try {
        await webpush.default.sendNotification(subscription, payload);
        sent++;
      } catch (e) {
        failed++;
        // Se subscription expirou (410 Gone), remove do banco
        if (e.statusCode === 410) {
          await fetch(
            `${SUPA_URL}/rest/v1/push_subscriptions?pedido_id=eq.${pedidoId}`,
            {
              method: 'DELETE',
              headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
            }
          );
        }
        console.warn('[Push] Falhou:', e.statusCode, e.message);
      }
    }));

    return res.status(200).json({ sent, failed });

  } catch (e) {
    console.error('[Push] Erro:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
