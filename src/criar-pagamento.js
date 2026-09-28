/**
 * IMPULSO - /api/criar-pagamento
 *
 * Cria uma cobranca no Mercado Pago pro nivel de doacao escolhido e
 * devolve a URL de checkout. Roda no servidor porque o access token
 * do Mercado Pago NUNCA pode ficar no navegador - da acesso a
 * movimentar cobranca em nome da sua conta.
 *
 * Configuracao necessaria no Vercel (Settings > Environment Variables):
 *   MERCADOPAGO_ACCESS_TOKEN = seu access token (producao ou teste),
 *   pego em https://www.mercadopago.com.br/developers/panel
 *
 * O selo NAO e liberado aqui - so quando o webhook confirma o
 * pagamento aprovado (ver api/webhook-mercadopago.js).
 */

const NIVEIS_DOACAO = {
  bronze: { valor: 5, nome: 'Apoiador Bronze' },
  prata: { valor: 10, nome: 'Apoiador Prata' },
  ouro: { valor: 15, nome: 'Apoiador Ouro' },
  diamante: { valor: 25, nome: 'Apoiador Diamante' }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Metodo nao permitido.' });
    return;
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    res.status(500).json({ erro: 'Pagamentos nao configurados no servidor. Adicione MERCADOPAGO_ACCESS_TOKEN nas variaveis de ambiente do Vercel.' });
    return;
  }

  const { chaveSelo, userId } = req.body || {};
  const nivel = NIVEIS_DOACAO[chaveSelo];
  if (!nivel || !userId) {
    res.status(400).json({ erro: 'Dados invalidos.' });
    return;
  }

  const origem = req.headers.origin || `https://${req.headers.host}`;

  try {
    const resposta = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        items: [
          {
            title: `IMPULSO - ${nivel.nome}`,
            quantity: 1,
            unit_price: nivel.valor,
            currency_id: 'BRL'
          }
        ],
        // metadata volta junto na notificacao do webhook - e assim
        // que sabemos qual usuario e qual selo liberar
        metadata: { user_id: userId, chave_selo: chaveSelo },
        back_urls: {
          success: `${origem}/#/perfil`,
          failure: `${origem}/#/perfil`,
          pending: `${origem}/#/perfil`
        },
        auto_return: 'approved',
        notification_url: `${origem}/api/webhook-mercadopago`
      })
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      res.status(502).json({ erro: 'Falha ao criar o pagamento.', detalhes: dados });
      return;
    }

    res.status(200).json({ checkoutUrl: dados.init_point });
  } catch (_erro) {
    res.status(500).json({ erro: 'Erro ao criar o pagamento. Tenta de novo.' });
  }
}
