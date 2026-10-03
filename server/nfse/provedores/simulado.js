// Provedor SIMULADO: imita o comportamento de uma prefeitura/intermediador para testes e
// treinamento. Não gera nota com valor fiscal. Modos (Configurações › Empresa e fiscal):
//   sucesso      – autoriza na hora
//   processando  – responde com protocolo; autoriza ~8 s depois (na consulta)
//   timeout      – REGISTRA a nota e devolve timeout (testa a consulta antes do reenvio)
//   rejeicao     – rejeita por erro de dados
//   indisponivel – serviço fora do ar
//   aleatorio    – sorteia um dos modos acima
import { randomBytes } from 'node:crypto';
import { db } from '../../db.js';
import { agora, somaMinutos } from '../../util.js';
import { ErroComunicacao } from './base.js';

const MODOS = ['sucesso', 'processando', 'timeout', 'rejeicao', 'indisponivel'];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const latencia = () => espera(Number(process.env.SIM_LATENCIA_MS ?? 300));

function modo(empresa) {
  const m = empresa.provedor_config?.modo || 'sucesso';
  if (m !== 'aleatorio') return m;
  const sorteio = Math.random();
  // Maioria de sucesso, para o teste aleatório ser realista.
  if (sorteio < 0.6) return 'sucesso';
  return MODOS[1 + Math.floor(Math.random() * (MODOS.length - 1))];
}

const chave = (dps) => `${dps.ambiente}|${dps.prestador.cnpj}|${dps.serie}|${dps.numero}`;

function xmlDe(dps, numero, codigo) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<NFSe simulada="true" ambiente="${dps.ambiente}">
  <infNFSe>
    <nNFSe>${numero}</nNFSe><codVerificacao>${codigo}</codVerificacao><dhEmi>${agora()}</dhEmi>
    <DPS serie="${esc(dps.serie)}" numero="${dps.numero}"/>
    <prest><CNPJ>${esc(dps.prestador.cnpj)}</CNPJ><xNome>${esc(dps.prestador.razao_social)}</xNome></prest>
    <toma>${dps.tomador.documento ? `<doc>${esc(dps.tomador.documento)}</doc>` : ''}<xNome>${esc(dps.tomador.nome)}</xNome></toma>
    <serv><cServ>${esc(dps.servico.codigo_servico)}</cServ><cTrib>${esc(dps.servico.codigo_tributacao)}</cTrib><xDesc>${esc(dps.servico.discriminacao)}</xDesc></serv>
    <valores><vServ>${(dps.valor / 100).toFixed(2)}</vServ><pAliq>${dps.servico.aliquota_iss}</pAliq></valores>
  </infNFSe>
</NFSe>`;
}

function notaDe(reg) {
  const d = JSON.parse(reg.dados);
  return {
    numero: String(reg.numero_nfse),
    codigo_verificacao: reg.codigo_verificacao,
    chave_acesso: reg.chave_dps.replace(/\|/g, ''),
    data_emissao: d.data_emissao,
    link_consulta: '',
    xml: d.xml,
  };
}

function registrar(dps, situacao, autorizaEm = null) {
  const numero = (db.prepare('SELECT MAX(numero_nfse) n FROM sim_notas').get().n || 0) + 1;
  const codigo = randomBytes(4).toString('hex').toUpperCase();
  db.prepare('INSERT INTO sim_notas (chave_dps, numero_nfse, situacao, autoriza_em, codigo_verificacao, dados) VALUES (?,?,?,?,?,?)')
    .run(chave(dps), numero, situacao, autorizaEm, codigo, JSON.stringify({ data_emissao: agora(), xml: xmlDe(dps, numero, codigo) }));
  return db.prepare('SELECT * FROM sim_notas WHERE chave_dps = ?').get(chave(dps));
}

export const provedorSimulado = {
  nome: 'simulado',

  async emitir(dps, empresa) {
    await latencia();
    const m = modo(empresa);
    if (m === 'indisponivel') throw new ErroComunicacao('Serviço de NFS-e indisponível (simulado).');
    if (db.prepare('SELECT 1 FROM sim_notas WHERE chave_dps = ?').get(chave(dps))) {
      return { resultado: 'DUPLICADA', codigo: 'E_DPS_DUPLICADA', mensagem: 'DPS já informada anteriormente.' };
    }
    if (m === 'rejeicao') {
      return { resultado: 'REJEITADA', codigo: 'E_SIM_REJEICAO', mensagem: 'Rejeição simulada: código de tributação não permitido para o prestador.' };
    }
    if (m === 'processando') {
      registrar(dps, 'PROCESSANDO', somaMinutos(8 / 60));
      return { resultado: 'PROCESSANDO', protocolo: `PROT-${dps.numero}-${Date.now()}` };
    }
    const reg = registrar(dps, 'AUTORIZADA');
    if (m === 'timeout') throw new ErroComunicacao('Tempo de resposta esgotado (simulado). A nota pode ter sido criada.');
    return { resultado: 'AUTORIZADA', nota: notaDe(reg) };
  },

  async consultar(ref, empresa) {
    await latencia();
    if ((empresa.provedor_config?.modo || 'sucesso') === 'indisponivel') throw new ErroComunicacao('Serviço de NFS-e indisponível (simulado).');
    const reg = db.prepare('SELECT * FROM sim_notas WHERE chave_dps = ?').get(chave(ref.dps));
    if (!reg) return { resultado: 'NAO_ENCONTRADA' };
    if (reg.situacao === 'PROCESSANDO') {
      if (reg.autoriza_em > agora()) return { resultado: 'PROCESSANDO' };
      db.prepare("UPDATE sim_notas SET situacao = 'AUTORIZADA' WHERE chave_dps = ?").run(reg.chave_dps);
    }
    return { resultado: 'AUTORIZADA', nota: notaDe(reg) };
  },

  async cancelar(ref, motivo, empresa) {
    await latencia();
    if ((empresa.provedor_config?.modo || 'sucesso') === 'indisponivel') throw new ErroComunicacao('Serviço de NFS-e indisponível (simulado).');
    const reg = db.prepare('SELECT * FROM sim_notas WHERE chave_dps = ?').get(chave(ref.dps));
    if (!reg) return { resultado: 'NEGADO', codigo: 'E_NAO_ENCONTRADA', mensagem: 'Nota não encontrada no provedor.' };
    db.prepare("UPDATE sim_notas SET situacao = 'CANCELADA' WHERE chave_dps = ?").run(reg.chave_dps);
    return { resultado: 'CANCELADA' };
  },

  async testarConexao() {
    await latencia();
    return { ok: true, mensagem: 'Provedor simulado ativo. As notas NÃO têm valor fiscal.' };
  },
};
