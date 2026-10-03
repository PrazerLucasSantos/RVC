// Consultas de leitura: tela inicial, lista de atendimentos, histórico e relatórios.
import { db, empresa } from './db.js';
import { agora, hoje, somaMinutos, parseDataHora } from './util.js';
import { certificadoVencido, configIncompleta } from './nfse/servico.js';

const ULTIMA_NOTA = '(SELECT situacao FROM nfse n WHERE n.atendimento_id = a.id ORDER BY n.id DESC LIMIT 1)';
const ULTIMA_NOTA_NUM = '(SELECT numero_nfse FROM nfse n WHERE n.atendimento_id = a.id ORDER BY n.id DESC LIMIT 1)';
const SERVICOS = "(SELECT group_concat(descricao, ', ') FROM itens_atendimento i WHERE i.atendimento_id = a.id)";

const BASE = `SELECT a.id, a.status, a.total, a.desconto, a.aberto_em, a.finalizado_em, a.cancelado_em, a.observacao,
    v.placa, v.modelo_cor, p.nome porte_nome, COALESCE(NULLIF(c.nome, ''), a.tomador_nome) cliente_nome,
    ${SERVICOS} servicos, ${ULTIMA_NOTA} nota_situacao, ${ULTIMA_NOTA_NUM} nota_numero,
    (SELECT group_concat(forma, '+') FROM pagamentos pg WHERE pg.atendimento_id = a.id) formas
  FROM atendimentos a JOIN veiculos v ON v.id = a.veiculo_id JOIN portes p ON p.id = a.porte_id
  LEFT JOIN clientes c ON c.id = a.cliente_id`;

export function listarAtendimentos(f = {}) {
  const where = [];
  const params = [];
  const de = f.de || hoje();
  const ate = f.ate || hoje();
  where.push('substr(COALESCE(a.finalizado_em, a.aberto_em), 1, 10) BETWEEN ? AND ?');
  params.push(de, ate);
  if (f.q) {
    where.push("(v.placa LIKE ? OR c.nome LIKE ? OR a.tomador_nome LIKE ? OR c.telefone LIKE ?)");
    const q = `%${String(f.q).trim()}%`;
    const placa = String(f.q).toUpperCase().replace(/[^A-Z0-9]/g, '');
    params.push(placa ? `%${placa}%` : q, q, q, q);
  }
  if (f.status) { where.push('a.status = ?'); params.push(f.status); }
  if (f.nota === 'SEM') where.push(`${ULTIMA_NOTA} IS NULL AND a.status = 'FINALIZADO'`);
  else if (f.nota) { where.push(`${ULTIMA_NOTA} = ?`); params.push(f.nota); }
  return db.prepare(`${BASE} WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT 1000`).all(...params);
}

export function historicoVeiculo(veiculoId, limite = 10) {
  return db.prepare(`${BASE} WHERE a.veiculo_id = ? ORDER BY a.id DESC LIMIT ?`).all(veiculoId, limite);
}

export function historicoCliente(clienteId, limite = 50) {
  return db.prepare(`${BASE} WHERE a.cliente_id = ? ORDER BY a.id DESC LIMIT ?`).all(clienteId, limite);
}

function resumoPeriodo(de, ate) {
  const fin = db.prepare(`SELECT COUNT(*) qtd, COALESCE(SUM(total),0) faturamento, COALESCE(SUM(desconto),0) descontos
    FROM atendimentos WHERE status = 'FINALIZADO' AND substr(finalizado_em,1,10) BETWEEN ? AND ?`).get(de, ate);
  const notas = db.prepare(`SELECT situacao, COUNT(*) qtd, COALESCE(SUM(valor),0) valor FROM nfse
    WHERE substr(criado_em,1,10) BETWEEN ? AND ? GROUP BY situacao`).all(de, ate);
  const porSituacao = Object.fromEntries(notas.map((n) => [n.situacao, n]));
  return {
    qtd: fin.qtd,
    faturamento: fin.faturamento,
    ticket_medio: fin.qtd ? Math.round(fin.faturamento / fin.qtd) : 0,
    descontos: fin.descontos,
    notas_emitidas: porSituacao.AUTORIZADA?.qtd || 0,
    notas_situacao: porSituacao,
  };
}

export function inicio() {
  const emp = empresa();
  const d = hoje();
  const patio = db.prepare(`${BASE} WHERE a.status = 'ABERTO' ORDER BY a.id`).all();
  const pendencias = db.prepare(`${BASE} WHERE a.status <> 'CANCELADO' AND ${ULTIMA_NOTA} IN ('PENDENTE','PROCESSANDO','REJEITADA','CANCELANDO') ORDER BY a.id`).all()
    .map((p) => ({ ...p, nota_motivo: db.prepare('SELECT motivo FROM nfse WHERE atendimento_id = ? ORDER BY id DESC LIMIT 1').get(p.id)?.motivo }));
  const ultimos = db.prepare(`${BASE} WHERE a.status = 'FINALIZADO' AND substr(a.finalizado_em,1,10) = ? ORDER BY a.finalizado_em DESC LIMIT 10`).all(d);
  const resumo = resumoPeriodo(d, d);
  resumo.sem_nota = db.prepare(`SELECT COUNT(*) n FROM atendimentos a WHERE a.status = 'FINALIZADO' AND a.total > 0 AND substr(a.finalizado_em,1,10) = ? AND ${ULTIMA_NOTA} IS NULL`).get(d).n;

  const alertas = [];
  const faltas = configIncompleta(emp);
  if (faltas.length) alertas.push({ nivel: 'erro', texto: `Configuração fiscal incompleta (${faltas.join(', ')}). As notas ficarão pendentes.`, link: '#/config' });
  if (certificadoVencido(emp)) alertas.push({ nivel: 'erro', texto: 'Certificado digital vencido. As notas não serão emitidas.', link: '#/config' });
  else if (emp.certificado_validade) {
    const dias = Math.ceil((parseDataHora(`${emp.certificado_validade} 23:59:59`) - new Date()) / 86400000);
    if (dias <= 30) alertas.push({ nivel: 'aviso', texto: `Certificado digital vence em ${dias} dia(s).`, link: '#/config' });
  }
  const antigas = db.prepare("SELECT COUNT(*) n FROM nfse WHERE situacao IN ('PENDENTE','PROCESSANDO') AND criado_em < ?")
    .get(somaMinutos(-60 * emp.alerta_pendente_horas)).n;
  if (antigas) alertas.push({ nivel: 'erro', texto: `${antigas} nota(s) pendente(s) há mais de ${emp.alerta_pendente_horas} h. Verifique a integração.` });
  if (emp.provedor === 'simulado') alertas.push({ nivel: 'info', texto: 'Modo de SIMULAÇÃO: as notas não têm valor fiscal. Configure o provedor real antes de operar.', link: '#/config' });
  else if (emp.ambiente !== 'PRODUCAO') alertas.push({ nivel: 'info', texto: 'Ambiente de HOMOLOGAÇÃO: as notas não têm valor fiscal.', link: '#/config' });

  return { patio, pendencias, ultimos, resumo, alertas, agora: agora() };
}

export function relatorio(de, ate) {
  const resumo = resumoPeriodo(de, ate);
  const porForma = db.prepare(`SELECT pg.forma, COUNT(*) qtd, SUM(pg.valor) valor FROM pagamentos pg JOIN atendimentos a ON a.id = pg.atendimento_id
    WHERE pg.estornado = 0 AND a.status = 'FINALIZADO' AND substr(a.finalizado_em,1,10) BETWEEN ? AND ? GROUP BY pg.forma ORDER BY valor DESC`).all(de, ate);
  const porServico = db.prepare(`SELECT i.descricao, COUNT(*) qtd, SUM(i.valor) valor FROM itens_atendimento i JOIN atendimentos a ON a.id = i.atendimento_id
    WHERE a.status = 'FINALIZADO' AND substr(a.finalizado_em,1,10) BETWEEN ? AND ? GROUP BY i.descricao ORDER BY valor DESC`).all(de, ate);
  const porDia = db.prepare(`SELECT substr(finalizado_em,1,10) dia, COUNT(*) qtd, SUM(total) valor FROM atendimentos
    WHERE status = 'FINALIZADO' AND substr(finalizado_em,1,10) BETWEEN ? AND ? GROUP BY dia ORDER BY dia`).all(de, ate);
  const cancelados = db.prepare(`SELECT a.id, a.total, a.cancelado_em, a.motivo_cancelamento, v.placa, u.nome usuario
    FROM atendimentos a JOIN veiculos v ON v.id = a.veiculo_id LEFT JOIN usuarios u ON u.id = a.cancelado_por
    WHERE a.status = 'CANCELADO' AND substr(a.cancelado_em,1,10) BETWEEN ? AND ? ORDER BY a.cancelado_em DESC`).all(de, ate);
  const descontos = db.prepare(`SELECT a.id, a.subtotal, a.desconto, a.finalizado_em, v.placa, u.nome usuario
    FROM atendimentos a JOIN veiculos v ON v.id = a.veiculo_id LEFT JOIN usuarios u ON u.id = a.finalizado_por
    WHERE a.status = 'FINALIZADO' AND a.desconto > 0 AND substr(a.finalizado_em,1,10) BETWEEN ? AND ? ORDER BY a.finalizado_em DESC`).all(de, ate);
  return { de, ate, resumo, porForma, porServico, porDia, cancelados, descontos };
}
