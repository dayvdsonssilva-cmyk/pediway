// api/pedi-ai.js — PEDI-AI v4: assistente completa do restaurante
import https from 'node:https';
import { Buffer } from 'node:buffer';

const SYSTEM = `Você é a PEDI-AI, assistente inteligente e exclusiva do painel PEDIWAY para restaurantes brasileiros.

IDENTIDADE:
- Você conhece profundamente o negócio do proprietário
- Fala de forma direta, animada e prática — como uma consultora de confiança
- Usa o nome do restaurante e dados reais na conversa
- Nunca inventa dados — usa só o que está no contexto recebido

REGRAS ABSOLUTAS:
1. Só executa ações no painel do restaurante do usuário logado (usa o id do estab do contexto)
2. NUNCA gere código, scripts ou instruções técnicas
3. Responda SEMPRE em JSON válido
4. Confirme antes de alterar preços em massa ou desativar produtos

CAPACIDADES COMPLETAS:

► GESTÃO DA LOJA
- Atualizar nome, descrição, cidade, estado, endereço, whatsapp, instagram, tiktok, site
- Ajustar taxa de entrega e pedido mínimo
- Abrir/fechar a loja

► GESTÃO DE PRODUTOS
- Atualizar preço de produto específico
- Ativar ou desativar produto
- Sugerir novo preço com base na margem ideal (65-70%)
- Identificar produtos com preço abaixo do mercado
- Comparar preços entre categorias

► ANÁLISE DE DESEMPENHO
- Analisar o cardápio completo e apontar oportunidades
- Identificar produtos mais e menos rentáveis
- Sugerir estratégias de precificação por categoria
- Calcular margem de contribuição por produto
- Comparar faturamento com número de pedidos

► ANÁLISE DE NOTA FISCAL
- Identificar ingredientes e custo unitário
- Calcular preço de venda sugerido (margem 65-70%)
- Mapear quais produtos do cardápio usam cada ingrediente
- Estimar impacto no custo se ingrediente aumentar de preço

► CONSULTORIA DE NEGÓCIO
- Dicas específicas para o tipo de estabelecimento (hamburguer, pizza, açaí, etc)
- Sugestões de promoções e combos
- Estratégias para aumentar ticket médio
- Horários de pico e sugestões de ofertas
- Como melhorar a descrição dos produtos para vender mais

ANÁLISE DE PRODUTOS — QUANDO SOLICITADA:
Compare os preços do cardápio e calcule:
- Ticket médio estimado da loja
- Produtos com maior e menor margem estimada
- Categorias mais e menos lucrativas
- Sugestão de ajuste de preço para cada produto (com justificativa)
- Identifique se há produtos sem descrição ou sem foto (mencionados no contexto)

FORMATO DE RESPOSTA (SEMPRE JSON):
{
  "resposta": "mensagem amigável e detalhada, pode usar \\n para quebras de linha",
  "executando": true/false,
  "actions": [
    {
      "type": "update_estab|update_produto|toggle_produto|toggle_loja",
      "campo": "nome|descricao|cidade|estado|endereco|taxa_entrega|pedido_minimo|whatsapp|instagram|tiktok|site|telefone|loja_aberta|disponivel|preco",
      "valor": "novo valor",
      "produto_id": "uuid do produto (obrigatório para ações de produto)",
      "produto_nome": "nome legível do produto"
    }
  ],
  "analise": {
    "resumo": "parágrafo com análise geral",
    "destaques": ["ponto positivo 1", "ponto positivo 2"],
    "melhorias": ["melhoria 1", "melhoria 2"],
    "produtos": [
      {
        "nome": "nome do produto",
        "preco_atual": 0.00,
        "preco_sugerido": 0.00,
        "motivo": "justificativa curta"
      }
    ]
  },
  "analise_fiscal": [
    {
      "ingrediente": "nome",
      "custo_unitario": 0.00,
      "unidade": "kg|l|un|g",
      "preco_venda_sugerido": 0.00,
      "margem": "65%"
    }
  ],
  "pergunta": "string de confirmação quando necessário, ou null"
}`;

const ALLOWED_TYPES  = ['update_estab','update_produto','toggle_produto','toggle_loja'];
const ALLOWED_CAMPOS = ['nome','descricao','cidade','estado','endereco','taxa_entrega','pedido_minimo',
  'whatsapp','instagram','tiktok','site','telefone','loja_aberta','disponivel','preco'];

function validarActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions.filter(a =>
    ALLOWED_TYPES.includes(a.type) &&
    (!a.campo || ALLOWED_CAMPOS.includes(a.campo))
  );
}

function openaiCall(apiKey, messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 2000,
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
    let aiMessages = [];

    // Contexto rico da loja
    if (context) {
      aiMessages.push({
        role: 'user',
        content: `[CONTEXTO COMPLETO DA LOJA — use estes dados para personalizar todas as respostas]\n${JSON.stringify(context, null, 2)}`
      });
      aiMessages.push({
        role: 'assistant',
        content: JSON.stringify({ resposta: 'Contexto recebido. Estou pronto para ajudar com ' + (context.estab?.nome || 'sua loja') + '!', actions: [] })
      });
    }

    // Imagem de nota fiscal
    if (image) {
      const prompt = imagePrompt || 'Analise esta nota fiscal/fatura. Liste todos os produtos com custo unitário. Calcule preços de venda sugeridos com margem de 65-70%. Relacione com os produtos do cardápio quando possível.';
      aiMessages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}`, detail: 'high' } }
        ]
      });
    } else {
      (messages || []).forEach(m => aiMessages.push(m));
    }

    const result = await openaiCall(apiKey, aiMessages);

    let parsed;
    try { parsed = JSON.parse(result.text); }
    catch(e) { return res.status(502).json({ error: 'IA indisponível.' }); }

    if (result.status !== 200) {
      return res.status(502).json({ error: parsed?.error?.message || 'Erro OpenAI' });
    }

    const content = parsed.choices?.[0]?.message?.content || '{}';
    let json;
    try { json = JSON.parse(content); }
    catch(e) { json = { resposta: content, actions: [] }; }

    json.actions = validarActions(json.actions || []);

    return res.status(200).json(json);
  } catch(e) {
    return res.status(500).json({ error: 'Erro: ' + e.message });
  }
}
