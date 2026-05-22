// api/scan-menu.js — ES Module com detecção inteligente itens + adicionais
import https from 'node:https';
import { Buffer } from 'node:buffer';

function openaiPost(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    });
    req.setTimeout(55000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY não configurada.' });

  const { image, mimeType = 'image/jpeg' } = req.body || {};
  if (!image) return res.status(400).json({ error: 'Imagem não enviada.' });
  if (image.length > 5000000) return res.status(413).json({ error: 'Imagem muito grande.' });

  const prompt = `Você é especialista em cardápios de restaurantes brasileiros. Analise TODO o cardápio na imagem com muita atenção e extraia ABSOLUTAMENTE TODOS os itens e grupos de adicionais.

REGRAS FUNDAMENTAIS:
- ITENS = produtos principais que o cliente compra (tamanhos de açaí, pratos, bebidas, etc.)
- ADICIONAIS = complementos/extras que acompanham os itens (coberturas, frutas, cremes, etc.)
- Leia TODOS os textos da imagem, mesmo os pequenos
- Se tiver seções como "COMPLEMENTOS", "FRUTAS", "COBERTURAS" → são grupos de adicionais
- Se tiver tamanhos diferentes do mesmo produto → cada tamanho é um ITEM separado
- Coloque preço 0 apenas se realmente não estiver visível

EXEMPLOS:
✅ Açaí 300ml, 500ml, 700ml → itens separados
✅ Complementos (Granola R$2, Amendoim R$3) → grupo de adicional "Complementos"
✅ Frutas (Morango R$2, Banana R$2) → grupo de adicional "Frutas"
✅ X-Burguer, X-Salada → itens
✅ Bacon extra, Ovo → grupo de adicional "Extras"

Retorne SOMENTE este JSON sem markdown:
{
  "itens": [
    {"nome":"Nome exato","categoria":"CATEGORIA","preco":0.00,"descricao":"desc","emoji":"🍔"}
  ],
  "adicionais": [
    {
      "grupo": "Nome exato do grupo",
      "itens": [
        {"nome":"Nome do adicional","preco":0.00}
      ]
    }
  ]
}

Categorias para itens: LANCHES, PIZZAS, BEBIDAS, SOBREMESAS, PORÇÕES, PRATOS, MASSAS, SALADAS, AÇAÍ, OUTROS
Se não houver adicionais: "adicionais": []`;

  try {
    const result = await openaiPost(apiKey, {
      model: 'gpt-4o-mini',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${image}`,
              detail: 'high'   // high = lê texto pequeno — necessário para adicionais
            }
          }
        ]
      }]
    });

    let parsed;
    try { parsed = JSON.parse(result.text); }
    catch(e) { return res.status(502).json({ error: 'Resposta inválida da OpenAI.' }); }

    if (result.status !== 200) {
      return res.status(502).json({ error: parsed?.error?.message || 'Erro OpenAI ' + result.status });
    }

    const content = parsed.choices?.[0]?.message?.content || '';
    const clean   = content.replace(/```json|```/g, '').trim();

    let data;
    try { data = JSON.parse(clean); }
    catch(e) { return res.status(502).json({ error: 'IA retornou formato inválido: ' + clean.slice(0,100) }); }

    if (!data.itens)      data.itens = [];
    if (!data.adicionais) data.adicionais = [];

    return res.status(200).json(data);

  } catch(e) {
    return res.status(500).json({
      error: e.message === 'Timeout'
        ? 'Análise demorou demais. Tente com foto menor ou melhor iluminada.'
        : 'Erro: ' + e.message
    });
  }
}
