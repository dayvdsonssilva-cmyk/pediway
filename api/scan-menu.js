// api/scan-menu.js — CommonJS para Vercel Serverless

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  // Tenta variações comuns do nome da variável
  const apiKey = process.env.OPENAI_API_KEY
               || process.env.OPENAI_KEY
               || process.env.OPEN_AI_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'Chave da OpenAI não encontrada. Verifique OPENAI_API_KEY nas variáveis de ambiente do Vercel e faça um novo deploy.'
    });
  }

  const { image, mimeType = 'image/jpeg' } = req.body || {};
  if (!image) return res.status(400).json({ error: 'Imagem não enviada.' });

  const prompt = `Você é um especialista em extrair cardápios de restaurantes.
Analise a imagem e extraia TODOS os itens do cardápio.

Retorne SOMENTE um JSON válido (sem markdown, sem texto extra):
{"itens":[{"nome":"Nome","categoria":"CATEGORIA","preco":0.00,"descricao":"desc curta","emoji":"🍔"}]}

Categorias: LANCHES, PIZZAS, BEBIDAS, SOBREMESAS, PORÇÕES, PRATOS, MASSAS, SALADAS, OUTROS
Preco: valor numérico, 0 se não visível.
Descricao: max 80 chars, vazio se não visível.
Emoji: mais representativo para o item.

Extraia TODOS os itens visíveis.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${image}`, detail: 'high' } }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(502).json({ error: err?.error?.message || 'Erro na OpenAI' });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);

  } catch (e) {
    console.error('scan-menu error:', e);
    return res.status(500).json({ error: 'Erro ao processar: ' + e.message });
  }
};
