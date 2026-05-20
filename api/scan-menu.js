// api/scan-menu.js — Vercel Serverless Function
// Recebe imagem base64, envia para GPT-4o-mini Vision, retorna itens do cardápio

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY não configurada.' });

  const { image, mimeType = 'image/jpeg' } = req.body || {};
  if (!image) return res.status(400).json({ error: 'Imagem não enviada.' });

  const prompt = `Você é um especialista em extrair cardápios de restaurantes.
Analise cuidadosamente a imagem do cardápio e extraia TODOS os itens visíveis.

Retorne SOMENTE um JSON válido neste formato exato (sem markdown, sem texto extra):
{"itens":[{"nome":"Nome do item","categoria":"CATEGORIA","preco":0.00,"descricao":"descrição curta se visível","emoji":"🍔"}]}

Regras para CATEGORIA (escolha a mais adequada):
- LANCHES → hambúrgueres, sanduíches, wraps, hot dogs
- PIZZAS → pizzas, calzones
- BEBIDAS → sucos, refrigerantes, cervejas, drinks, água, café, chá
- SOBREMESAS → doces, sorvetes, bolos, pudins, açaí
- PORÇÕES → entradas, petiscos, batata frita, frango frito, bolinhos
- PRATOS → pratos executivos, almoço, refeições completas, marmitas
- MASSAS → macarrão, espaguete, lasanha, risoto
- SALADAS → saladas, opções saudáveis
- OUTROS → qualquer item que não se encaixe acima

Regras para EMOJI: use o emoji mais representativo do item.
Regras para PRECO: extraia o valor numérico (ex: 28.90). Se não visível, coloque 0.
Regras para DESCRICAO: máximo 80 caracteres. Se não visível, deixe vazio "".

IMPORTANTE: Extraia absolutamente todos os itens visíveis no cardápio, incluindo variações de tamanho se houver.`;

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

    // Limpa markdown caso venha com ```json
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);
  } catch (e) {
    console.error('scan-menu error:', e);
    return res.status(500).json({ error: 'Erro ao processar: ' + e.message });
  }
}
