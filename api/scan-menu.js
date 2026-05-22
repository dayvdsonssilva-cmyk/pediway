// api/scan-menu.js — otimizado para evitar timeout
const https = require('https');

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
    req.on('error', reject);
    // Timeout de 25s na requisição HTTP
    req.setTimeout(25000, () => { req.destroy(); reject(new Error('Timeout na OpenAI')); });
    req.write(body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY não configurada.' });

  const body = typeof req.body === 'object' && req.body !== null
    ? req.body
    : (() => { try { return JSON.parse(req.body || '{}'); } catch(e) { return {}; } })();

  const { image, mimeType = 'image/jpeg' } = body;
  if (!image) return res.status(400).json({ error: 'Imagem não enviada.' });

  // Limite de tamanho: ~3MB base64
  if (image.length > 4000000) {
    return res.status(413).json({ error: 'Imagem muito grande. Comprima mais antes de enviar.' });
  }

  const prompt = `Analise este cardápio e extraia TODOS os itens visíveis.
Retorne SOMENTE JSON válido sem markdown:
{"itens":[{"nome":"Nome","categoria":"CATEGORIA","preco":0.00,"descricao":"desc","emoji":"🍔"}]}
Categorias: LANCHES, PIZZAS, BEBIDAS, SOBREMESAS, PORÇÕES, PRATOS, MASSAS, SALADAS, OUTROS
Preco: número. Descricao: max 60 chars. Emoji: adequado ao item.`;

  try {
    const result = await openaiPost(apiKey, {
      model: 'gpt-4o-mini',
      max_tokens: 2000,       // reduzido de 4000
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: {
            url: `data:${mimeType};base64,${image}`,
            detail: 'low'    // 'low' em vez de 'high' — muito mais rápido
          }}
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

    let items;
    try { items = JSON.parse(clean); }
    catch(e) { return res.status(502).json({ error: 'IA retornou formato inválido.' }); }

    return res.status(200).json(items);

  } catch(e) {
    const msg = e.message === 'Timeout na OpenAI'
      ? 'A análise demorou demais. Tente com uma foto menor ou melhor iluminação.'
      : 'Erro interno: ' + e.message;
    return res.status(500).json({ error: msg });
  }
};
