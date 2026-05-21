// api/pedi-ai.js — PEDI-AI: Assistente inteligente do PEDIWAY
import https from 'node:https';
import { Buffer } from 'node:buffer';

const SYSTEM_PROMPT = `Você é a PEDI-AI, a assistente inteligente do PEDIWAY — uma plataforma de delivery para restaurantes brasileiros.

Sua personalidade: 
- Nome: PEDI-AI   
- Tom: Amigável, prático, direto e animado
- Especialidade: Gestão de restaurantes, cardápios, preços e lucratividade
- Língua: Português brasileiro

Suas capacidades:
1. CONFIGURAR a loja: nome, tipo, endereço, horários, taxas de entrega 
2. ANALISAR cardápios: verificar preços, sugerir melhorias de lucratividade
3. CRIAR itens: sugerir novos pratos, preços e categorias
4. OTIMIZAR preços: baseado no tipo de estabelecimento e mercado brasileiro
5. ONBOARDING: guiar novos usuários pelo processo de configuração

Regras de análise de preços (mercado brasileiro 2024):
- Hambúrgueres artesanais: R$25-55
- X-Burguer simples: R$18-30
- Pizzas: R$35-80 
- Refrigerante lata: R$6-10
- Suco natural: R$10-18
- Porções fritas: R$20-45
- Pratos executivos: R$25-45
- Cervejas: R$8-16
- Sobremesas: R$12-25

Margem saudável para restaurante: 60-70% sobre custo.
Se preço estiver abaixo do mercado, sugira aumento.
Se estiver acima, justifique com qualidade ou sugira adequação.

Ao analisar itens, responda SEMPRE em JSON quando a action for 'analyze_menu' ou 'onboarding':
{
  "resposta": "texto amigável",
  "analise": [{
    "nome": "item",
    "preco_atual": 0,
    "preco_sugerido": 0,
    "motivo": "justificativa",
    "status": "ok|baixo|alto"
  }],
  "dica_geral": "dica de negócio",
  "actions": []
}

Para chat normal, responda em texto livre e natural.`;

function openaiCall(apiKey, messages, maxTokens = 1500) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método não permitido' });

  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY não configurada.' });

  const { action, messages, context } = req.body || {};

  // ── Ações específicas ──────────────────────────────────────────────────────
  try {
    let aiMessages = messages || [];

    if (action === 'analyze_menu') {
      // Analisa preços e sugere melhorias
      const itens = context?.itens || [];
      const tipo  = context?.tipo_estabelecimento || 'restaurante';
      aiMessages = [{
        role: 'user',
        content: `Analise estes itens de um ${tipo} e dê sugestões de preço para maximizar lucro. Responda em JSON.\n\nItens: ${JSON.stringify(itens, null, 2)}`
      }];

    } else if (action === 'onboarding_step') {
      // Guia o onboarding
      const step   = context?.step || 1;
      const dados  = context?.dados || {};
      const prompt = {
        1: `O usuário está abrindo um ${dados.tipo||'restaurante'} chamado "${dados.nome||'novo negócio'}". Dê uma mensagem de boas-vindas animada e 3 dicas rápidas de como configurar o cardápio para este tipo de negócio. Seja breve e motivador.`,
        2: `Baseado no cardápio detectado via foto: ${JSON.stringify(dados.itens||[])}. Analise os preços e dê 2-3 sugestões diretas para lucrar mais. Formato JSON com resposta e analise.`,
        3: `O cardápio foi configurado com sucesso! Dê dicas finais sobre: (1) horário de funcionamento ideal para ${dados.tipo||'restaurante'}, (2) taxa de entrega sugerida na cidade ${dados.cidade||'brasileira'}, (3) formas de pagamento recomendadas. Seja animado e conciso.`,
      }[step] || 'Como posso ajudar?';
      aiMessages = [{ role: 'user', content: prompt }];

    } else if (action === 'chat') {
      // Chat livre com contexto da loja
      if (context?.loja) {
        aiMessages = [
          { role: 'system', content: `Contexto da loja do usuário:\n${JSON.stringify(context.loja, null, 2)}` },
          ...aiMessages
        ];
      }
    }

    const result = await openaiCall(apiKey, aiMessages, 2000);
    let parsed;
    try { parsed = JSON.parse(result.text); } 
    catch(e) { return res.status(502).json({ error: 'Resposta inválida da IA.' }); }

    if (result.status !== 200) {
      return res.status(502).json({ error: parsed?.error?.message || 'Erro OpenAI' });
    }

    const content = parsed.choices?.[0]?.message?.content || '';

    // Tenta parsear JSON estruturado (para analyze e onboarding)
    let structured = null;
    if (action === 'analyze_menu' || (action === 'onboarding_step' && context?.step === 2)) {
      const clean = content.replace(/```json|```/g, '').trim();
      try { structured = JSON.parse(clean); } catch(e) { /* retorna texto */ }
    }

    return res.status(200).json({
      content,
      structured,
      action,
    });

  } catch(e) {
    return res.status(500).json({ error: 'Erro interno: ' + e.message });
  }
}
