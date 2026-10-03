// Serviço de NFS-e: fila, máquina de estados e proteções contra duplicidade.
//
// Proteções implementadas:
//  1. Índice único: no máximo uma NFS-e ativa por atendimento (ux_nfse_ativa).
//  2. Número de DPS reservado uma vez por registro e REUTILIZADO em todo reenvio.
//  3. `envio_incerto` é gravado ANTES de chamar o provedor; se a resposta não chegar
//     (timeout, queda, crash do processo), a próxima tentativa CONSULTA antes de reenviar.
//  4. Novo número de DPS só nasce em um novo registro, criado após rejeição definitiva.
//  5. Trava por nota (trava_ate) impede dois envios simultâneos da mesma nota.
//  6. Toda chamada ao provedor fica registrada em nfse_tentativas.
import { randomBytes } from 'node:crypto';
import { db, empresa, transacao, auditar } from '../db.js';
import { agora, somaMinutos, parseDataHora, ErroNegocio, documentoValido, tipoDocumento } from '../util.js';
import { provedorDe } from './provedores/index.js';
import { ErroComunicacao } from './provedores/base.js';
import { traduzir } from './erros.js';

const ATIVAS = ['PENDENTE', 'PROCESSANDO', 'AUTORIZADA', 'CANCELANDO'];
const BACKOFF_MIN = [1, 5, 15, 60, 360];
const TRAVA_SEGUNDOS = 90;

export function obter(id) {
  return db.prepare('SELECT * FROM nfse WHERE id = ?').get(id);
}

export function notaAtiva(atendimentoId) {
  return db.prepare(`SELECT * FROM nfse WHERE atendimento_id = ? AND situacao IN (${ATIVAS.map(() => '?').join(',')})`)
    .get(atendimentoId, ...ATIVAS);
}

export function configIncompleta(emp) {
  const faltas = [];
  if (!emp.razao_social) faltas.push('razão social');
  if (!emp.cnpj) faltas.push('CNPJ');
  if (!emp.municipio_ibge) faltas.push('código IBGE do município');
  if (!emp.codigo_servico) faltas.push('código do serviço');
  if (!emp.codigo_tributacao) faltas.push('código de tributação');
  if (emp.regime_tributario !== 'MEI' && !(emp.aliquota_iss > 0)) faltas.push('alíquota de ISS');
  return faltas;
}

export function certificadoVencido(emp) {
  return !!emp.certificado_validade && emp.certificado_validade < agora().slice(0, 10);
}

// Valida os dados do tomador conforme a configuração (RN033). Lança ErroNegocio com o campo faltante.
export function validarTomador(t, emp) {
  const doc = t.documento || '';
  if (!doc) {
    if (!emp.permite_tomador_nao_identificado) throw new ErroNegocio('Informe o CPF ou CNPJ do cliente para emitir a nota.', 400, 'documento');
    return;
  }
  if (!documentoValido(doc)) throw new ErroNegocio('CPF/CNPJ inválido. Confira os números.', 400, 'documento');
  const tipo = tipoDocumento(doc);
  if (tipo === 'PJ' && !t.nome) throw new ErroNegocio('Informe a razão social da empresa.', 400, 'nome');
  if (tipo === 'PF' && emp.exige_nome_pf && !t.nome) throw new ErroNegocio('Informe o nome do cliente.', 400, 'nome');
  if (tipo === 'PJ' && emp.exige_endereco_pj) {
    const e = t.endereco || {};
    if (!e.cep || !e.logradouro || !e.numero || !e.cidade || !e.uf) {
      throw new ErroNegocio('Informe o endereço completo da empresa (CEP, rua, número, cidade e UF).', 400, 'endereco');
    }
  }
}

function discriminacaoDe(atendimentoId) {
  const a = db.prepare(`SELECT v.placa, v.modelo_cor FROM atendimentos a JOIN veiculos v ON v.id = a.veiculo_id WHERE a.id = ?`).get(atendimentoId);
  const itens = db.prepare('SELECT descricao FROM itens_atendimento WHERE atendimento_id = ? ORDER BY id').all(atendimentoId);
  const veiculo = [a.modelo_cor, `placa ${a.placa}`].filter(Boolean).join(', ');
  return `${itens.map((i) => i.descricao).join('; ')} — ${veiculo}`;
}

// Cria o registro da NFS-e (PENDENTE) reservando o número da DPS. Não chama o provedor.
export function enfileirarEmissao(atendimentoId, usuarioId) {
  return transacao(() => {
    const a = db.prepare('SELECT * FROM atendimentos WHERE id = ?').get(atendimentoId);
    if (!a) throw new ErroNegocio('Atendimento não encontrado.', 404);
    if (a.status !== 'FINALIZADO') throw new ErroNegocio('Só é possível emitir nota de atendimento finalizado.');
    if (a.total <= 0) throw new ErroNegocio('Atendimento sem valor não gera nota.');
    const ativa = notaAtiva(atendimentoId);
    if (ativa) throw new ErroNegocio('Este atendimento já possui uma nota em andamento ou emitida.', 409);

    const emp = empresa();
    const tomador = {
      documento: a.tomador_documento,
      nome: a.tomador_nome,
      email: a.tomador_email,
      telefone: a.tomador_telefone,
      endereco: JSON.parse(a.tomador_endereco || '{}'),
    };
    validarTomador(tomador, emp);

    // Reserva do número: pula números já usados (ex.: se o administrador voltou a numeração).
    let numero = emp.proximo_numero_dps;
    const usado = db.prepare('SELECT 1 FROM nfse WHERE serie_dps = ? AND numero_dps = ? AND ambiente = ?');
    while (usado.get(emp.serie_dps, numero, emp.ambiente)) numero++;
    db.prepare('UPDATE empresa SET proximo_numero_dps = ? WHERE id = 1').run(numero + 1);

    const t = agora();
    const r = db.prepare(`INSERT INTO nfse (atendimento_id, situacao, ambiente, serie_dps, numero_dps, referencia, valor, discriminacao,
        tomador, token_publico, proxima_tentativa_em, criado_em, criado_por, atualizado_em)
      VALUES (?, 'PENDENTE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      atendimentoId, emp.ambiente, emp.serie_dps, numero, `${emp.ambiente[0]}-${emp.serie_dps}-${numero}`, a.total,
      discriminacaoDe(atendimentoId), JSON.stringify(tomador), randomBytes(16).toString('hex'), t, t, usuarioId ?? null, t);
    const id = Number(r.lastInsertRowid);
    auditar(usuarioId, 'nfse', id, 'ENFILEIRAR', { atendimento: atendimentoId, dps: `${emp.serie_dps}/${numero}` });
    return obter(id);
  });
}

function montarDps(n, emp) {
  const t = JSON.parse(n.tomador);
  return {
    ambiente: n.ambiente,
    serie: n.serie_dps,
    numero: n.numero_dps,
    referencia: n.referencia,
    data_competencia: n.criado_em.slice(0, 10),
    prestador: {
      cnpj: emp.cnpj, razao_social: emp.razao_social, inscricao_municipal: emp.inscricao_municipal,
      municipio_ibge: emp.municipio_ibge, regime_tributario: emp.regime_tributario,
    },
    tomador: t,
    servico: {
      codigo_servico: emp.codigo_servico, codigo_tributacao: emp.codigo_tributacao, cnae: emp.cnae,
      aliquota_iss: emp.regime_tributario === 'MEI' ? 0 : emp.aliquota_iss, discriminacao: n.discriminacao,
      municipio_prestacao_ibge: emp.municipio_ibge,
    },
    valor: n.valor,
    tratamento_desconto: emp.tratamento_desconto,
  };
}

function referenciaDe(n, dps) {
  return { serie: n.serie_dps, numero: n.numero_dps, referencia: n.referencia, protocolo: n.protocolo,
    chave_acesso: n.chave_acesso, numero_nfse: n.numero_nfse, dps };
}

function atualizar(id, campos) {
  const chaves = Object.keys(campos);
  db.prepare(`UPDATE nfse SET ${chaves.map((k) => `${k} = ?`).join(', ')}, atualizado_em = ? WHERE id = ?`)
    .run(...chaves.map((k) => campos[k]), agora(), id);
}

function travar(id) {
  const r = db.prepare('UPDATE nfse SET trava_ate = ? WHERE id = ? AND (trava_ate IS NULL OR trava_ate < ?)')
    .run(somaMinutos(TRAVA_SEGUNDOS / 60), id, agora());
  return r.changes === 1;
}

function destravar(id) {
  db.prepare('UPDATE nfse SET trava_ate = NULL WHERE id = ?').run(id);
}

function agendarRetentativa(n, motivo, codigo) {
  const idx = Math.min(n.tentativas, BACKOFF_MIN.length - 1);
  atualizar(n.id, { motivo, codigo_retorno: codigo, proxima_tentativa_em: somaMinutos(BACKOFF_MIN[idx]) });
}

// Executa uma operação no provedor registrando a tentativa. ErroComunicacao vira resultado DESCONHECIDO.
async function chamar(n, operacao, usuarioId, requisicao, fn) {
  const tid = Number(db.prepare('INSERT INTO nfse_tentativas (nfse_id, operacao, iniciado_em, usuario_id, requisicao) VALUES (?,?,?,?,?)')
    .run(n.id, operacao, agora(), usuarioId ?? null, JSON.stringify(requisicao)).lastInsertRowid);
  let r;
  try {
    r = await fn();
  } catch (e) {
    r = { resultado: 'DESCONHECIDO', codigo: 'COMUNICACAO', mensagem: e instanceof ErroComunicacao ? e.message : `Erro inesperado: ${e.message}` };
    if (!(e instanceof ErroComunicacao)) console.error('[nfse] erro inesperado no provedor', e);
  }
  const resposta = r.nota ? { ...r, nota: { ...r.nota, xml: r.nota.xml ? '(xml armazenado)' : '' } } : r;
  db.prepare('UPDATE nfse_tentativas SET finalizado_em = ?, resposta = ?, resultado = ?, codigo = ?, mensagem = ? WHERE id = ?')
    .run(agora(), JSON.stringify(resposta), r.resultado, r.codigo || '', r.mensagem || '', tid);
  return r;
}

function autorizar(n, nota) {
  atualizar(n.id, {
    situacao: 'AUTORIZADA', envio_incerto: 0, motivo: '', codigo_retorno: '', proxima_tentativa_em: null,
    numero_nfse: String(nota.numero), codigo_verificacao: nota.codigo_verificacao || '', chave_acesso: nota.chave_acesso || '',
    data_emissao: nota.data_emissao || agora(), link_consulta: nota.link_consulta || '', xml: nota.xml || '',
  });
}

function rejeitar(n, codigo, mensagem) {
  atualizar(n.id, { situacao: 'REJEITADA', envio_incerto: 0, motivo: traduzir(codigo, mensagem), codigo_retorno: codigo || '', proxima_tentativa_em: null });
}

// Trata a resposta de uma CONSULTA. Retorna true se o envio deve prosseguir (nota não existe no provedor).
function aplicarConsulta(n, r) {
  switch (r.resultado) {
    case 'AUTORIZADA': autorizar(n, r.nota); return false;
    case 'PROCESSANDO':
      atualizar(n.id, { situacao: 'PROCESSANDO', envio_incerto: 0, motivo: 'Nota em processamento na prefeitura.', proxima_tentativa_em: somaMinutos(1) });
      return false;
    case 'REJEITADA': rejeitar(n, r.codigo, r.mensagem); return false;
    case 'NAO_ENCONTRADA': return true;
    default:
      agendarRetentativa(n, traduzir('COMUNICACAO'), 'COMUNICACAO');
      return false;
  }
}

async function processarPendente(n, emp, prov, usuarioId) {
  const faltas = configIncompleta(emp);
  if (faltas.length) {
    atualizar(n.id, { motivo: `${traduzir('CONFIG')} Falta: ${faltas.join(', ')}.`, codigo_retorno: 'CONFIG', proxima_tentativa_em: somaMinutos(15) });
    return;
  }
  if (certificadoVencido(emp)) {
    atualizar(n.id, { motivo: traduzir('CERTIFICADO'), codigo_retorno: 'CERTIFICADO', proxima_tentativa_em: somaMinutos(15) });
    return;
  }
  const dps = montarDps(n, emp);

  // Resultado anterior desconhecido: consultar antes de reenviar (nunca emitir às cegas).
  if (n.envio_incerto) {
    const c = await chamar(n, 'CONSULTAR', usuarioId, { referencia: n.referencia }, () => prov.consultar(referenciaDe(n, dps), emp));
    if (!aplicarConsulta(n, c)) return;
  }

  // Marca o envio como incerto ANTES de chamar o provedor (protege contra queda no meio do envio).
  atualizar(n.id, { envio_incerto: 1, tentativas: n.tentativas + 1 });
  n = obter(n.id);
  const r = await chamar(n, 'EMITIR', usuarioId, dps, () => prov.emitir(dps, emp));
  switch (r.resultado) {
    case 'AUTORIZADA': autorizar(n, r.nota); break;
    case 'PROCESSANDO':
      atualizar(n.id, { situacao: 'PROCESSANDO', envio_incerto: 0, protocolo: r.protocolo || '', motivo: 'Nota em processamento na prefeitura.', proxima_tentativa_em: somaMinutos(1) });
      break;
    case 'REJEITADA': rejeitar(n, r.codigo, r.mensagem); break;
    case 'DUPLICADA': {
      // O provedor já tem esta DPS: localizar a nota existente em vez de gerar outra.
      const c = await chamar(n, 'CONSULTAR', usuarioId, { referencia: n.referencia }, () => prov.consultar(referenciaDe(n, dps), emp));
      if (aplicarConsulta(n, c)) agendarRetentativa(n, traduzir('COMUNICACAO'), 'COMUNICACAO');
      break;
    }
    default: agendarRetentativa(n, traduzir('COMUNICACAO'), 'COMUNICACAO');
  }
}

async function processarProcessando(n, emp, prov, usuarioId) {
  const dps = montarDps(n, emp);
  const c = await chamar(n, 'CONSULTAR', usuarioId, { referencia: n.referencia, protocolo: n.protocolo }, () => prov.consultar(referenciaDe(n, dps), emp));
  if (c.resultado === 'NAO_ENCONTRADA') {
    // Reenvio com o MESMO número de DPS: idempotente no provedor.
    atualizar(n.id, { situacao: 'PENDENTE', envio_incerto: 1, proxima_tentativa_em: agora() });
    return;
  }
  aplicarConsulta(n, c);
}

async function processarCancelando(n, emp, prov, usuarioId) {
  const dps = montarDps(n, emp);
  const r = await chamar(n, 'CANCELAR', usuarioId, { referencia: n.referencia, motivo: n.cancelamento_motivo },
    () => prov.cancelar(referenciaDe(n, dps), n.cancelamento_motivo, emp));
  if (r.resultado === 'CANCELADA') {
    atualizar(n.id, { situacao: 'CANCELADA', cancelada_em: agora(), motivo: '', codigo_retorno: '', proxima_tentativa_em: null });
  } else if (r.resultado === 'NEGADO') {
    atualizar(n.id, { situacao: 'AUTORIZADA', motivo: `Cancelamento negado: ${traduzir(r.codigo, r.mensagem)}`, codigo_retorno: r.codigo || '', proxima_tentativa_em: null });
  } else {
    agendarRetentativa(n, 'Cancelamento enviado sem confirmação. O sistema tentará novamente automaticamente.', 'COMUNICACAO');
  }
}

export async function processar(id, usuarioId = null) {
  if (!travar(id)) return obter(id);
  try {
    const n = obter(id);
    const emp = empresa();
    const prov = provedorDe(emp);
    if (n.situacao === 'PENDENTE') await processarPendente(n, emp, prov, usuarioId);
    else if (n.situacao === 'PROCESSANDO') await processarProcessando(n, emp, prov, usuarioId);
    else if (n.situacao === 'CANCELANDO') await processarCancelando(n, emp, prov, usuarioId);
  } catch (e) {
    console.error('[nfse] falha ao processar', id, e);
  } finally {
    destravar(id);
  }
  return obter(id);
}

// Processa e espera até `ms`; se demorar mais, devolve o estado atual e o processamento segue.
export async function processarComEspera(id, usuarioId, ms = 12000) {
  const p = processar(id, usuarioId);
  const limite = new Promise((r) => setTimeout(() => r(null), ms));
  return (await Promise.race([p, limite])) || obter(id);
}

export async function tentarAgora(id, usuario) {
  const n = obter(id);
  if (!n) throw new ErroNegocio('Nota não encontrada.', 404);
  if (!['PENDENTE', 'PROCESSANDO', 'CANCELANDO'].includes(n.situacao)) throw new ErroNegocio('Esta nota não está aguardando envio.');
  if (n.trava_ate && n.trava_ate > agora()) throw new ErroNegocio('Esta nota já está sendo enviada. Aguarde alguns segundos.', 409);
  atualizar(id, { proxima_tentativa_em: agora() });
  auditar(usuario.id, 'nfse', id, 'TENTAR_AGORA');
  return processarComEspera(id, usuario.id);
}

export async function cancelar(id, motivo, usuario) {
  const n = obter(id);
  const emp = empresa();
  if (!n) throw new ErroNegocio('Nota não encontrada.', 404);
  if (usuario.perfil !== 'ADMIN' && !emp.atendente_cancela_nota) throw new ErroNegocio('Somente o administrador pode cancelar notas.', 403);
  if (n.situacao !== 'AUTORIZADA') throw new ErroNegocio('Só é possível cancelar nota autorizada.');
  motivo = String(motivo ?? '').trim();
  if (motivo.length < 15) throw new ErroNegocio('Descreva o motivo do cancelamento (mínimo 15 caracteres).', 400, 'motivo');
  const limite = new Date(parseDataHora(n.data_emissao).getTime() + emp.prazo_cancelamento_horas * 3600000);
  if (new Date() > limite) throw new ErroNegocio(traduzir('E_PRAZO_CANCELAMENTO'));
  atualizar(id, { situacao: 'CANCELANDO', cancelamento_motivo: motivo, tentativas: 0, proxima_tentativa_em: agora() });
  auditar(usuario.id, 'nfse', id, 'CANCELAR', motivo);
  return processarComEspera(id, usuario.id);
}

export async function consultarAgora(id, usuario) {
  const n = obter(id);
  if (!n) throw new ErroNegocio('Nota não encontrada.', 404);
  if (n.situacao === 'PENDENTE' && !n.envio_incerto) return tentarAgora(id, usuario);
  if (!['PENDENTE', 'PROCESSANDO'].includes(n.situacao)) return n;
  return tentarAgora(id, usuario);
}

// Ao corrigir a configuração fiscal, as notas presas por configuração voltam para a fila imediatamente.
export function liberarPendentesDeConfiguracao() {
  db.prepare("UPDATE nfse SET proxima_tentativa_em = ? WHERE situacao = 'PENDENTE' AND codigo_retorno IN ('CONFIG','CERTIFICADO')").run(agora());
}

let rodando = false;
export async function processarFila() {
  if (rodando) return;
  rodando = true;
  try {
    const ids = db.prepare(`SELECT id FROM nfse WHERE situacao IN ('PENDENTE','PROCESSANDO','CANCELANDO')
      AND proxima_tentativa_em <= ? AND (trava_ate IS NULL OR trava_ate < ?) ORDER BY proxima_tentativa_em LIMIT 20`).all(agora(), agora());
    for (const { id } of ids) await processar(id);
  } finally {
    rodando = false;
  }
}

export function iniciarWorker(intervaloMs = 5000) {
  const t = setInterval(() => processarFila().catch((e) => console.error('[nfse] fila', e)), intervaloMs);
  t.unref();
  return t;
}

export function tentativasDe(id) {
  return db.prepare('SELECT * FROM nfse_tentativas WHERE nfse_id = ? ORDER BY id').all(id);
}
