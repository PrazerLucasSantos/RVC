// Regras do atendimento: abertura, edição, finalização (pagamento) e cancelamento.
import { db, empresa, transacao, auditar } from './db.js';
import {
  ErroNegocio, normalizaPlaca, placaValida, normalizaDocumento, documentoValido, agora, texto, inteiro,
} from './util.js';
import * as nfse from './nfse/servico.js';

export const FORMAS = { DINHEIRO: 'Dinheiro', PIX: 'PIX', DEBITO: 'Débito', CREDITO: 'Crédito', OUTRO: 'Outro' };

function precoDe(servicoId, porteId) {
  return db.prepare('SELECT valor FROM precos WHERE servico_id = ? AND porte_id = ?').get(servicoId, porteId)?.valor;
}

export function carregar(id) {
  const a = db.prepare(`SELECT a.*, v.placa, v.modelo_cor, p.nome porte_nome, c.nome cliente_nome, c.telefone cliente_telefone,
      ua.nome aberto_por_nome, uf.nome finalizado_por_nome, uc.nome cancelado_por_nome
    FROM atendimentos a JOIN veiculos v ON v.id = a.veiculo_id JOIN portes p ON p.id = a.porte_id
    LEFT JOIN clientes c ON c.id = a.cliente_id
    LEFT JOIN usuarios ua ON ua.id = a.aberto_por LEFT JOIN usuarios uf ON uf.id = a.finalizado_por LEFT JOIN usuarios uc ON uc.id = a.cancelado_por
    WHERE a.id = ?`).get(id);
  if (!a) throw new ErroNegocio('Atendimento não encontrado.', 404);
  a.tomador_endereco = JSON.parse(a.tomador_endereco || '{}');
  a.itens = db.prepare('SELECT i.*, s.avulso FROM itens_atendimento i JOIN servicos s ON s.id = i.servico_id WHERE atendimento_id = ? ORDER BY i.id').all(id);
  a.pagamentos = db.prepare('SELECT * FROM pagamentos WHERE atendimento_id = ? ORDER BY id').all(id);
  a.notas = db.prepare(`SELECT id, situacao, ambiente, serie_dps, numero_dps, numero_nfse, codigo_verificacao, data_emissao, valor,
      motivo, codigo_retorno, envio_incerto, tentativas, proxima_tentativa_em, token_publico, link_consulta, criado_em, cancelamento_motivo, cancelada_em
    FROM nfse WHERE atendimento_id = ? ORDER BY id DESC`).all(id);
  return a;
}

function calcularDesconto(subtotal, tipo, informado) {
  const v = Number(informado) || 0;
  if (v < 0) throw new ErroNegocio('Desconto não pode ser negativo.', 400, 'desconto');
  const d = tipo === 'PERCENTUAL' ? Math.round((subtotal * Math.min(v, 100)) / 100) : Math.round(v);
  if (d > subtotal) throw new ErroNegocio('O desconto é maior que o valor dos serviços.', 400, 'desconto');
  return d;
}

// Cria (id ausente) ou altera um atendimento ABERTO.
export function salvar(dados, usuario, id = null) {
  return transacao(() => {
    const placa = normalizaPlaca(dados.placa);
    if (!placaValida(placa)) throw new ErroNegocio('Placa inválida. Use o formato ABC1234 ou ABC1D23.', 400, 'placa');
    const porteId = inteiro(dados.porte_id, 'porte');
    if (!db.prepare('SELECT 1 FROM portes WHERE id = ? AND ativo = 1').get(porteId)) throw new ErroNegocio('Escolha o porte do veículo.', 400, 'porte');
    const clienteId = dados.cliente_id ? inteiro(dados.cliente_id, 'cliente') : null;
    if (clienteId && !db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(clienteId)) throw new ErroNegocio('Cliente não encontrado.', 400, 'cliente');

    let atual = null;
    if (id) {
      atual = db.prepare('SELECT * FROM atendimentos WHERE id = ?').get(id);
      if (!atual) throw new ErroNegocio('Atendimento não encontrado.', 404);
      if (atual.status !== 'ABERTO') throw new ErroNegocio('Só é possível alterar atendimento aberto.');
    }

    // Veículo: cria na hora se a placa for nova; atualiza porte/modelo informados.
    let v = db.prepare('SELECT * FROM veiculos WHERE placa = ?').get(placa);
    const modelo = dados.modelo_cor !== undefined ? texto(dados.modelo_cor, 80) : v?.modelo_cor ?? '';
    if (!v) {
      const r = db.prepare('INSERT INTO veiculos (placa, porte_id, modelo_cor, cliente_habitual_id, criado_em) VALUES (?,?,?,?,?)')
        .run(placa, porteId, modelo, clienteId, agora());
      v = db.prepare('SELECT * FROM veiculos WHERE id = ?').get(Number(r.lastInsertRowid));
    } else {
      db.prepare('UPDATE veiculos SET porte_id = ?, modelo_cor = ?, cliente_habitual_id = COALESCE(cliente_habitual_id, ?) WHERE id = ?')
        .run(porteId, modelo, clienteId, v.id);
    }
    if (atual && atual.veiculo_id !== v.id) throw new ErroNegocio('Não é possível trocar a placa de um atendimento. Cancele e abra outro.');

    // Itens: preço vem da tabela (congelado). Itens já salvos mantêm o valor se o porte não mudou.
    const anteriores = new Map((atual ? db.prepare('SELECT * FROM itens_atendimento WHERE atendimento_id = ?').all(id) : []).map((i) => [i.id, i]));
    const mesmoPorte = atual && atual.porte_id === porteId;
    const itens = (dados.itens || []).map((it) => {
      const s = db.prepare('SELECT * FROM servicos WHERE id = ?').get(inteiro(it.servico_id, 'serviço'));
      if (!s) throw new ErroNegocio('Serviço não encontrado.');
      if (s.avulso) {
        const descricao = texto(it.descricao, 120);
        const valor = Math.round(Number(it.valor));
        if (!descricao) throw new ErroNegocio('Descreva o serviço avulso.', 400, 'avulso');
        if (!(valor > 0)) throw new ErroNegocio('Informe o valor do serviço avulso.', 400, 'avulso');
        return { servico_id: s.id, descricao, valor };
      }
      const anterior = it.id && anteriores.get(Number(it.id));
      if (anterior && anterior.servico_id === s.id && mesmoPorte) return { servico_id: s.id, descricao: anterior.descricao, valor: anterior.valor };
      if (!s.ativo) throw new ErroNegocio(`O serviço "${s.nome}" está inativo.`);
      const valor = precoDe(s.id, porteId);
      if (valor === undefined) throw new ErroNegocio(`"${s.nome}" não está disponível para este porte.`);
      return { servico_id: s.id, descricao: s.nome, valor };
    });

    const subtotal = itens.reduce((t, i) => t + i.valor, 0);
    const descontoTipo = dados.desconto_tipo === 'PERCENTUAL' ? 'PERCENTUAL' : 'VALOR';
    const desconto = calcularDesconto(subtotal, descontoTipo, dados.desconto_informado);
    const total = subtotal - desconto;
    const obs = texto(dados.observacao, 500);

    if (!atual) {
      const r = db.prepare(`INSERT INTO atendimentos (veiculo_id, porte_id, cliente_id, subtotal, desconto_tipo, desconto_informado, desconto, total, observacao, aberto_em, aberto_por)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(v.id, porteId, clienteId, subtotal, descontoTipo, Number(dados.desconto_informado) || 0, desconto, total, obs, agora(), usuario.id);
      id = Number(r.lastInsertRowid);
      auditar(usuario.id, 'atendimento', id, 'ABRIR', { placa });
    } else {
      db.prepare(`UPDATE atendimentos SET porte_id = ?, cliente_id = ?, subtotal = ?, desconto_tipo = ?, desconto_informado = ?, desconto = ?, total = ?, observacao = ? WHERE id = ?`)
        .run(porteId, clienteId, subtotal, descontoTipo, Number(dados.desconto_informado) || 0, desconto, total, obs, id);
      db.prepare('DELETE FROM itens_atendimento WHERE atendimento_id = ?').run(id);
    }
    const ins = db.prepare('INSERT INTO itens_atendimento (atendimento_id, servico_id, descricao, valor) VALUES (?,?,?,?)');
    for (const i of itens) ins.run(id, i.servico_id, i.descricao, i.valor);
    if (desconto > 0 && (!atual || atual.desconto !== desconto)) auditar(usuario.id, 'atendimento', id, 'DESCONTO', { desconto, subtotal });
    return id;
  });
}

function normalizaTomador(t = {}) {
  const e = t.endereco || {};
  return {
    documento: normalizaDocumento(t.documento),
    nome: texto(t.nome, 150),
    email: texto(t.email, 150),
    telefone: texto(t.telefone, 30),
    endereco: {
      cep: texto(e.cep, 9), logradouro: texto(e.logradouro, 150), numero: texto(e.numero, 20), complemento: texto(e.complemento, 60),
      bairro: texto(e.bairro, 80), cidade: texto(e.cidade, 80), uf: texto(e.uf, 2).toUpperCase(),
    },
  };
}

// Vincula o tomador a um cliente (existente ou novo) e grava o snapshot no atendimento.
function gravarTomador(a, t) {
  let clienteId = a.cliente_id;
  if (t.documento) {
    const porDoc = db.prepare('SELECT id FROM clientes WHERE documento = ?').get(t.documento);
    if (porDoc) clienteId = porDoc.id;
  }
  if (clienteId) {
    const c = db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
    const docLivre = t.documento && !c.documento && !db.prepare('SELECT 1 FROM clientes WHERE documento = ? AND id <> ?').get(t.documento, c.id);
    const endTem = Object.values(t.endereco).some(Boolean);
    db.prepare(`UPDATE clientes SET nome = CASE WHEN nome = '' THEN ? ELSE nome END, email = CASE WHEN email = '' THEN ? ELSE email END,
        telefone = CASE WHEN telefone = '' THEN ? ELSE telefone END, documento = CASE WHEN ? THEN ? ELSE documento END,
        endereco = CASE WHEN ? THEN ? ELSE endereco END WHERE id = ?`)
      .run(t.nome, t.email, t.telefone, docLivre ? 1 : 0, t.documento, endTem ? 1 : 0, JSON.stringify(t.endereco), c.id);
  } else if (t.documento || t.nome) {
    clienteId = Number(db.prepare('INSERT INTO clientes (nome, telefone, email, documento, endereco, criado_em) VALUES (?,?,?,?,?,?)')
      .run(t.nome, t.telefone, t.email, t.documento || null, JSON.stringify(t.endereco), agora()).lastInsertRowid);
  }
  db.prepare(`UPDATE atendimentos SET cliente_id = ?, tomador_documento = ?, tomador_nome = ?, tomador_email = ?, tomador_telefone = ?, tomador_endereco = ? WHERE id = ?`)
    .run(clienteId, t.documento, t.nome, t.email, t.telefone, JSON.stringify(t.endereco), a.id);
  if (clienteId) db.prepare('UPDATE veiculos SET cliente_habitual_id = COALESCE(cliente_habitual_id, ?) WHERE id = ?').run(clienteId, a.veiculo_id);
}

export async function finalizar(id, dados, usuario) {
  const emp = empresa();
  const emitir = dados.emitir_nota !== undefined ? !!dados.emitir_nota : !!emp.emissao_automatica;
  const t = normalizaTomador(dados.tomador);
  if (t.documento && !documentoValido(t.documento)) throw new ErroNegocio('CPF/CNPJ inválido. Confira os números.', 400, 'documento');

  transacao(() => {
    const a = db.prepare('SELECT * FROM atendimentos WHERE id = ?').get(id);
    if (!a) throw new ErroNegocio('Atendimento não encontrado.', 404);
    if (a.status !== 'ABERTO') throw new ErroNegocio('Este atendimento já foi finalizado ou cancelado.', 409);
    const nItens = db.prepare('SELECT COUNT(*) n FROM itens_atendimento WHERE atendimento_id = ?').get(id).n;
    if (!nItens) throw new ErroNegocio('Adicione pelo menos um serviço.');
    if (emitir && a.total > 0) nfse.validarTomador(t, emp);

    const pags = (dados.pagamentos || []).filter((p) => Number(p.valor) > 0).map((p) => {
      const forma = String(p.forma || '');
      if (!FORMAS[forma] || !emp.formas_pagamento.includes(forma)) throw new ErroNegocio('Forma de pagamento inválida.', 400, 'pagamento');
      const valor = Math.round(Number(p.valor));
      let recebido = null;
      let troco = 0;
      if (forma === 'DINHEIRO' && p.valor_recebido) {
        recebido = Math.round(Number(p.valor_recebido));
        if (recebido < valor) throw new ErroNegocio('O valor recebido em dinheiro é menor que o valor a pagar.', 400, 'pagamento');
        troco = recebido - valor;
      }
      return { forma, valor, recebido, troco };
    });
    const soma = pags.reduce((s, p) => s + p.valor, 0);
    if (soma !== a.total) throw new ErroNegocio('A soma dos pagamentos precisa ser igual ao total.', 400, 'pagamento');

    const ins = db.prepare('INSERT INTO pagamentos (atendimento_id, forma, valor, valor_recebido, troco, criado_em, criado_por) VALUES (?,?,?,?,?,?,?)');
    for (const p of pags) ins.run(id, p.forma, p.valor, p.recebido, p.troco, agora(), usuario.id);
    gravarTomador(a, t);
    db.prepare("UPDATE atendimentos SET status = 'FINALIZADO', finalizado_em = ?, finalizado_por = ? WHERE id = ?").run(agora(), usuario.id, id);
    auditar(usuario.id, 'atendimento', id, 'FINALIZAR', { total: a.total, pagamentos: pags.map((p) => p.forma) });
  });

  // A nota é solicitada só depois que atendimento e pagamento estão gravados (RN023).
  let nota = null;
  let aviso = null;
  const a = db.prepare('SELECT total FROM atendimentos WHERE id = ?').get(id);
  if (emitir && a.total > 0) {
    try {
      const n = nfse.enfileirarEmissao(id, usuario.id);
      nota = await nfse.processarComEspera(n.id, usuario.id);
    } catch (e) {
      aviso = `Atendimento finalizado, mas a nota não foi solicitada: ${e.message}`;
    }
  }
  return { atendimento: carregar(id), nota, aviso };
}

// Corrige o tomador para reemitir (somente sem nota ativa).
export function atualizarTomador(id, dados, usuario) {
  const t = normalizaTomador(dados);
  if (t.documento && !documentoValido(t.documento)) throw new ErroNegocio('CPF/CNPJ inválido. Confira os números.', 400, 'documento');
  transacao(() => {
    const a = db.prepare('SELECT * FROM atendimentos WHERE id = ?').get(id);
    if (!a) throw new ErroNegocio('Atendimento não encontrado.', 404);
    if (a.status !== 'FINALIZADO') throw new ErroNegocio('Atendimento não está finalizado.');
    if (nfse.notaAtiva(id)) throw new ErroNegocio('Não é possível alterar os dados do cliente com nota em andamento ou emitida.', 409);
    gravarTomador(a, t);
    auditar(usuario.id, 'atendimento', id, 'ALTERAR_TOMADOR', { documento: t.documento ? 'informado' : 'vazio' });
  });
  return carregar(id);
}

export async function cancelar(id, motivo, usuario) {
  motivo = String(motivo ?? '').trim();
  if (motivo.length < 5) throw new ErroNegocio('Informe o motivo do cancelamento.', 400, 'motivo');
  const a = db.prepare('SELECT * FROM atendimentos WHERE id = ?').get(id);
  if (!a) throw new ErroNegocio('Atendimento não encontrado.', 404);
  if (a.status === 'CANCELADO') throw new ErroNegocio('Atendimento já cancelado.');
  if (a.status === 'FINALIZADO' && usuario.perfil !== 'ADMIN') throw new ErroNegocio('Somente o administrador pode cancelar atendimento finalizado.', 403);

  const ativa = nfse.notaAtiva(id);
  if (ativa) {
    const nuncaEnviada = ativa.situacao === 'PENDENTE' && !ativa.envio_incerto && ativa.tentativas === 0;
    if (nuncaEnviada) {
      db.prepare("UPDATE nfse SET situacao = 'REJEITADA', motivo = 'Não enviada: atendimento cancelado antes do envio.', proxima_tentativa_em = NULL WHERE id = ?").run(ativa.id);
    } else if (ativa.situacao === 'AUTORIZADA') {
      if (motivo.length < 15) throw new ErroNegocio('Para cancelar a nota, descreva o motivo com pelo menos 15 caracteres.', 400, 'motivo');
      const r = await nfse.cancelar(ativa.id, motivo, usuario);
      if (r.situacao !== 'CANCELADA') {
        throw new ErroNegocio(r.situacao === 'CANCELANDO'
          ? 'O cancelamento da nota foi enviado e aguarda confirmação. Cancele o atendimento depois que a nota estiver cancelada.'
          : `A nota não foi cancelada. ${r.motivo}`, 409);
      }
    } else {
      throw new ErroNegocio('A nota deste atendimento ainda está em processamento. Aguarde o retorno para cancelar.', 409);
    }
  }

  transacao(() => {
    db.prepare("UPDATE atendimentos SET status = 'CANCELADO', cancelado_em = ?, cancelado_por = ?, motivo_cancelamento = ? WHERE id = ?")
      .run(agora(), usuario.id, motivo, id);
    db.prepare('UPDATE pagamentos SET estornado = 1 WHERE atendimento_id = ?').run(id);
    auditar(usuario.id, 'atendimento', id, 'CANCELAR', motivo);
  });
  return carregar(id);
}
