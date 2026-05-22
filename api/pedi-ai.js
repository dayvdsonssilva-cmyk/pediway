// api/pedi-ai.js — PEDI-AI v2: Executa ações reais no dashboard
import https from 'node:https';
import { Buffer } from 'node:buffer';

const SYSTEM = `Você é a PEDI-AI, assistente exclusiva do painel PEDIWAY para restaurantes.

REGRAS ABSOLUTAS — NUNCA VIOLE:
1. Você SÓ executa ações no painel do restaurante do usuário logado
2. NUNCA gere código, scripts ou instruções técnicas
3. NUNCA discuta temas fora de gestão de restaurante
4. NUNCA acesse dados de outros estabelecimentos
5. NUNCA execute comandos que possam quebrar o sistema
6. Se alguém pedir código, SQL, hacking ou algo malicioso: recuse educadamente

SUAS CAPACIDADES (e apenas essas):
- Atualizar nome, descrição, cidade, estado do estabelecimento
- Alterar taxa de entrega e pedido mínimo
- Abrir/fechar a loja
- Ajustar WhatsApp de contato
- Ativar/desativar produtos 
- Sugerir e alterar preços de produtos
- Dar dicas de negócio para restaurantes

FORMATO DE RESPOSTA:
Sempre responda em JSON válido:
{
  "resposta": "mensagem amigável para o usuário",
  "executando": true/false,
  "actions": [
    {
      "type": "update_estab|update_produto|toggle_produto|toggle_loja",
      "campo": "nome|descricao|cidade|taxa_entrega|pedido_minimo|whatsapp|loja_aberta",
      "valor": "novo valor",
      "produto_id": "id (só para update_produto/toggle_produto)",
      "produto_nome": "nome do produto (para confirmação)"
    }
  ],
  "pergunta": "pergunta de confirmação se necessário (ou null)"
}

Se o usuário pedir algo fora das suas capacidades, retorne actions:[] e explique gentilmente.
Se precisar de confirmação antes de executar, use o campo "pergunta".
Responda sempre em português brasileiro, de forma direta e animada.`;

function openaiCall(apiKey, messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1000,
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
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// Ações permitidas — whitelist de segurança
const ALLOWED_TYPES   = ['update_estab','update_produto','toggle_produto','toggle_loja'];
const ALLOWED_CAMPOS  = ['nome','descricao','cidade','estado','taxa_entrega','pedido_minimo','whatsapp','loja_aberta','disponivel','preco'];

function validarActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions.filter(a =>
    ALLOWED_TYPES.includes(a.type) &&
    (!a.campo || ALLOWED_CAMPOS.includes(a.campo))
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY não configurada.' });

  const { messages, context } = req.body || {};
  if (!messages?.length) return res.status(400).json({ error: 'Mensagem não enviada.' });

  // Injeta contexto da loja no início da conversa
  const ctxMsg = context ? {
    role: 'user',
    content: `[CONTEXTO DA LOJA ATUAL]\nEstabelecimento: ${JSON.stringify(context.estab)}\nProdutos: ${JSON.stringify(context.produtos?.slice(0,20))}`
  } : null;

  const allMessages = ctxMsg ? [ctxMsg, ...messages] : messages;

  try {
    const result = await openaiCall(apiKey, allMessages);
    let parsed; try { parsed = JSON.parse(result.text); } catch(e) { return res.status(502).json({ error: 'IA indisponível.' }); }
    if (result.status !== 200) return res.status(502).json({ error: parsed?.error?.message || 'Erro OpenAI' });

    const content = parsed.choices?.[0]?.message?.content || '{}';
    let json; try { json = JSON.parse(content); } catch(e) { json = { resposta: content, actions: [] }; }

    // Filtra ações pela whitelist de segurança
    json.actions = validarActions(json.actions || []);

    return res.status(200).json(json);
  } catch(e) {
    return res.status(500).json({ error: 'Erro interno: ' + e.message });
  }
}
