// api/scan-menu.js
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
    req.write(body);
    req.end();
  });
}

// Lê o body completo da request (Vercel às vezes não parseia automaticamente)
function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch(e) { resolve({}); }
    });
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

  const body = await readBody(req);
  const { image, mimeType = 'image/jpeg' } = body;
  if (!image) return res.status(400).json({ error: 'Imagem não enviada.' });

  const prompt = `Analise este cardápio e extraia TODOS os itens visíveis.
Retorne SOMENTE JSON válido sem markdown:
{"itens":[{"nome":"Nome","categoria":"CATEGORIA","preco":0.00,"descricao":"desc","emoji":"🍔"}]}
Categorias: LANCHES, PIZZAS, BEBIDAS, SOBREMESAS, PORÇÕES, PRATOS, MASSAS, SALADAS, OUTROS
Preco: número (0 se não visível). Descricao: max 80 chars. Emoji: representativo.
Extraia TODOS os itens visíveis.`;

  try {
    const result = await openaiPost(apiKey, {
      model: 'gpt-4.1-mini',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${image}`, detail: 'high' } }
        ]
      }]
    });

    let parsed;
    try { parsed = JSON.parse(result.text); }
    catch(e) { return res.status(502).json({ error: 'Resposta inválida da OpenAI: ' + result.text.slice(0, 200) }); }

    if (result.status !== 200) {
      return res.status(502).json({ error: parsed?.error?.message || 'Erro OpenAI status ' + result.status });
    }

    const text  = parsed.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json|```/g, '').trim();

    let items;
    try { items = JSON.parse(clean); }
    catch(e) { return res.status(502).json({ error: 'IA retornou formato inválido: ' + clean.slice(0, 200) }); }

    return res.status(200).json(items);

  } catch(e) {
    return res.status(500).json({ error: 'Erro interno: ' + e.message });
  }
};
