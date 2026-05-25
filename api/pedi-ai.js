// api/pedi-ai.js — PEDI-AI v3: chat, ações reais + análise de notas fiscais
import https from 'node:https';
import { Buffer } from 'node:buffer';

const SYSTEM = `Você é a PEDI-AI, assistente exclusiva do painel PEDIWAY para restaurantes brasileiros.

REGRAS ABSOLUTAS:
1. Só executa ações no painel do restaurante do usuário logado
2. NUNCA gere código, scripts ou instruções técnicas
3. Responda SEMPRE em JSON válido (response_format: json_object)
4. Seja direto, animado e prático

CAPACIDADES:
- Atualizar nome, descrição, cidade, taxa de entrega, pedido mínimo, whatsapp da loja
- Abrir/fechar a loja
- Ativar/desativar produtos
- Sugerir e ajustar preços de produtos
- Analisar nota fiscal/fatura para calcular custos e margens de lucro
- Dar dicas de negócio para restaurantes

ANÁLISE DE NOTA FISCAL:
Quando receber imagem de nota fiscal/fatura/pedido de compras:
- Liste todos os itens com custo unitário
- Calcule o preço de venda sugerido (margem 65-70%)
- Identifique quais produtos do cardápio usam cada ingrediente
- Dê sugestão de preço para cada produto

FORMATO DE RESPOSTA (SEMPRE JSON):
{
  "resposta": "mensagem amigável",
  "executando": true/false,
  "actions": [
    {
      "type": "update_estab|update_produto|toggle_produto|toggle_loja",
      "campo": "nome|descricao|cidade|taxa_entrega|pedido_minimo|whatsapp|loja_aberta|disponivel|preco",
      "valor": "novo valor",
      "produto_id": "id (para produto)",
      "produto_nome": "nome do produto"
    }
  ],
  "analise_fiscal": [
    {
      "ingrediente": "nome",
      "custo_unitario": 0.00,
      "unidade": "kg|l|un",
      "preco_venda_sugerido": 0.00,
      "margem": "65%"
    }
  ],
  "pergunta": "confirmação necessária (ou null)"
}`;

const ALLOWED_TYPES  = ['update_estab','update_produto','toggle_produto','toggle_loja'];
const ALLOWED_CAMPOS = ['nome','descricao','cidade','estado','taxa_entrega','pedido_minimo','whatsapp','loja_aberta','disponivel','preco'];

function validarActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions.filter(a => ALLOWED_TYPES.includes(a.type) && (!a.campo || ALLOWED_CAMPOS.includes(a.campo)));
}

function openaiCall(apiKey, messages, hasImage) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, ...messages]
    });
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    });
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY não configurada.' });

  const { messages, context, image, imagePrompt } = req.body || {};
  if (!messages?.length && !image) return res.status(400).json({ error: 'Sem mensagem.' });

  try {
    // Monta contexto da loja
    const ctxContent = context
      ? `[CONTEXTO DA LOJA]\n${JSON.stringify(context, null, 2)}`
      : null;

    let aiMessages = [];
    if (ctxContent) aiMessages.push({ role: 'user', content: ctxContent });

    // Se veio imagem (nota fiscal) — usa vision
    if (image) {
      const prompt = imagePrompt || 'Analise esta nota fiscal/fatura. Identifique todos os produtos com custo. Calcule preços de venda com margem de 65-70%. Liste ingredientes e sugira preços para o cardápio do restaurante.';
      aiMessages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}`, detail: 'high' } }
        ]
      });
    } else {
      // Chat normal
      (messages || []).forEach(m => aiMessages.push(m));
    }

    const result = await openaiCall(apiKey, aiMessages, !!image);
    let parsed; try { parsed = JSON.parse(result.text); } catch(e) { return res.status(502).json({ error: 'IA indisponível.' }); }
    if (result.status !== 200) return res.status(502).json({ error: parsed?.error?.message || 'Erro OpenAI' });

    const content = parsed.choices?.[0]?.message?.content || '{}';
    let json; try { json = JSON.parse(content); } catch(e) { json = { resposta: content, actions: [] }; }

    json.actions = validarActions(json.actions || []);

    return res.status(200).json(json);
  } catch(e) {
    return res.status(500).json({ error: 'Erro: ' + e.message });
  }
}
