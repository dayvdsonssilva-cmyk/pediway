// api/criar-pedido.js
// Recebe o pedido do cliente final (lojas.html) e grava no Supabase com o
// TOTAL RECALCULADO NO SERVIDOR, a partir dos preços reais da tabela
// `produtos` — nunca a partir do preço que vem do carrinho do navegador.
// Isso fecha a brecha de alguém adulterar o carrinho pelo console e mandar
// um pedido de valor menor do que o real.
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.SUPA_URL;
const SUPA_SVC = process.env.SUPA_SERVICE_KEY;

const LIMITES = { nome: 100, whats: 15, endereco: 300, obs: 500 };
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function limpa(v, max) {
  return String(v || '').trim().slice(0, max);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPA_URL || !SUPA_SVC) {
    console.error('[criar-pedido] SUPA_URL/SUPA_SERVICE_KEY não configurados');
    return res.status(500).json({ error: 'Erro de configuração do servidor' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const {
      estabelecimento_id,
      itens: itensBrutos,
      cliente_nome,
      cliente_whats,
      observacao,
      endereco,
      opcao_entrega,   // 'entrega' | 'retirada'
      pagamento,
    } = body;

    // ── Validações básicas de presença/formato ────────────────────────────
    if (!estabelecimento_id || !UUID_REGEX.test(estabelecimento_id)) {
      return res.status(400).json({ error: 'Loja inválida' });
    }
    const nome = limpa(cliente_nome, LIMITES.nome);
    const whats = String(cliente_whats || '').replace(/\D/g, '').slice(0, LIMITES.whats);
    if (!nome) return res.status(400).json({ error: 'Digite seu nome' });
    if (whats.length < 10) return res.status(400).json({ error: 'WhatsApp inválido' });

    if (!Array.isArray(itensBrutos) || !itensBrutos.length) {
      return res.status(400).json({ error: 'Sacola vazia' });
    }

    const supa = createClient(SUPA_URL, SUPA_SVC);

    // ── Carrega a loja (taxa de entrega, se está aberta/ativa) ────────────
    const { data: loja, error: lojaErr } = await supa
      .from('estabelecimentos')
      .select('id,nome,aberto,horarios,status,taxa_entrega,faz_entrega,faz_retirada')
      .eq('id', estabelecimento_id)
      .single();

    if (lojaErr || !loja) return res.status(404).json({ error: 'Loja não encontrada' });
    if (loja.status && loja.status !== 'ativo') {
      return res.status(400).json({ error: 'Esta loja não está disponível no momento' });
    }

    const op = opcao_entrega === 'retirada' ? 'retirada' : 'entrega';
    if (op === 'entrega' && loja.faz_entrega === false) {
      return res.status(400).json({ error: 'Esta loja não faz entrega' });
    }
    if (op === 'retirada' && loja.faz_retirada === false) {
      return res.status(400).json({ error: 'Esta loja não faz retirada' });
    }

    // ── Carrega os produtos reais do banco (nunca confia no preço do cliente) ─
    const idsProdutos = [...new Set(itensBrutos.map(i => i.id).filter(Boolean))];
    if (!idsProdutos.length) return res.status(400).json({ error: 'Itens inválidos' });

    const { data: produtosDb, error: prodErr } = await supa
      .from('produtos')
      .select('id,nome,preco,disponivel,estabelecimento_id,grupo_adicional_id')
      .in('id', idsProdutos)
      .eq('estabelecimento_id', estabelecimento_id);

    if (prodErr) throw new Error('Erro ao validar produtos');
    const produtosMap = new Map((produtosDb || []).map(p => [String(p.id), p]));

    // ── Carrega os grupos de adicionais desses produtos, p/ validar preço dos extras ─
    const gruposIds = [...new Set((produtosDb || []).map(p => p.grupo_adicional_id).filter(Boolean))];
    let gruposMap = new Map();
    if (gruposIds.length) {
      const { data: grupos } = await supa
        .from('grupos_adicionais')
        .select('id,opcoes')
        .in('id', gruposIds);
      gruposMap = new Map((grupos || []).map(g => {
        const opcoes = Array.isArray(g.opcoes) ? g.opcoes : JSON.parse(g.opcoes || '[]');
        return [String(g.id), opcoes];
      }));
    }

    // ── Recalcula cada item usando SOMENTE dados do banco ─────────────────
    const itens = [];
    for (const bruto of itensBrutos) {
      const produto = produtosMap.get(String(bruto.id));
      if (!produto) return res.status(400).json({ error: 'Produto inválido ou de outra loja' });
      if (produto.disponivel === false) {
        return res.status(400).json({ error: `"${produto.nome}" não está disponível no momento` });
      }

      const qtd = Math.max(1, Math.min(99, parseInt(bruto.qtd, 10) || 1));

      // Adicionais: só aceita os que existem de fato no grupo do produto,
      // e sempre pelo preço cadastrado no banco — nunca o que vier do cliente.
      const opcoesValidas = gruposMap.get(String(produto.grupo_adicional_id)) || [];
      const adicionais = [];
      for (const a of (bruto.adicionais || [])) {
        const nomeAdic = limpa(a?.nome, 80);
        const opcaoReal = opcoesValidas.find(o => String(o.nome).trim() === nomeAdic);
        if (!opcaoReal) continue; // ignora adicional que não existe — não confia no que o cliente mandou
        adicionais.push({ nome: nomeAdic, preco: Number(opcaoReal.preco) || 0 });
      }

      itens.push({
        id: produto.id,
        nome: limpa(produto.nome, 120),
        preco: Number(produto.preco) || 0,   // preço real do banco, não o do carrinho
        qtd,
        emoji: limpa(bruto.emoji, 10),
        adicionais,
      });
    }

    const sub = itens.reduce((s, i) =>
      s + i.preco * i.qtd + i.adicionais.reduce((sa, a) => sa + a.preco * i.qtd, 0), 0);
    const taxa = op === 'retirada' ? 0 : parseFloat(loja.taxa_entrega || 0);
    const total = Math.round((sub + taxa) * 100) / 100;

    if (total <= 0) return res.status(400).json({ error: 'Total do pedido inválido' });

    // ── Rate limit: máx 5 pedidos por WhatsApp em 5 minutos, checado no banco ─
    const cincoMinAtras = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count } = await supa
      .from('pedidos')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_whats', whats)
      .gte('created_at', cincoMinAtras);
    if ((count || 0) >= 5) {
      return res.status(429).json({ error: 'Muitos pedidos em pouco tempo. Aguarde alguns minutos.' });
    }

    const enderecoFinal = op === 'entrega'
      ? limpa(endereco, LIMITES.endereco)
      : 'Retirada no local';
    if (op === 'entrega' && !enderecoFinal) {
      return res.status(400).json({ error: 'Endereço obrigatório para entrega' });
    }

    const { data: insertData, error: insertErr } = await supa
      .from('pedidos')
      .insert({
        estabelecimento_id,
        cliente_nome: nome,
        cliente_whats: whats,
        observacao: limpa(observacao, LIMITES.obs),
        itens,
        total,
        status: 'novo',
        endereco: enderecoFinal,
        pagamento: limpa(pagamento, 40) || 'pix',
        taxa_entrega: taxa,
      })
      .select('id')
      .single();

    if (insertErr) throw insertErr;

    return res.status(200).json({ id: insertData.id, total, itens, taxa_entrega: taxa });

  } catch (e) {
    console.error('[criar-pedido] Erro:', e.message);
    return res.status(500).json({ error: 'Erro ao registrar pedido. Tente novamente.' });
  }
}
