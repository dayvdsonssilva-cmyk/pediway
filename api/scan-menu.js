// api/scan-menu.js — usa https nativo do Node (sem fetch)
const https = require('https');

function openaiRequest(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY
              || process.env.OPENAI_KEY
              || process.env.OPEN_AI_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY não configurada no Vercel.' });
  }

  const { image, mimeType = 'image/jpeg' } = req.body || {};
  if (!image) return res.status(400).json({ error: 'Imagem não enviada.' });

  const prompt = `Analise este cardápio e extraia TODOS os itens visíveis.
Retorne SOMENTE JSON válido, sem markdown:
{"itens":[{"nome":"Nome","categoria":"CATEGORIA","preco":0.00,"descricao":"desc","emoji":"🍔"}]}

Categorias: LANCHES, PIZZAS, BEBIDAS, SOBREMESAS, PORÇÕES, PRATOS, MASSAS, SALADAS, OUTROS
Preco: número (0 se não visível). Descricao: max 80 chars. Emoji: representativo.`;

  try {
    const result = await openaiRequest(apiKey, {
      model: 'gpt-4o-mini',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${image}`, detail: 'high' } }
        ]
      }]
    });

    const parsed = JSON.parse(result.body);

    if (result.status !== 200) {
      const errMsg = parsed?.error?.message || result.body;
      return res.status(502).json({ error: 'OpenAI: ' + errMsg });
    }

    const text  = parsed.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const items = JSON.parse(clean);
    return res.status(200).json(items);

  } catch (e) {
    console.error('scan-menu error:', e.message);
    return res.status(500).json({ error: 'Erro interno: ' + e.message });
  }
};
