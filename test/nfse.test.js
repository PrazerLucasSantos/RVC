// Testes das regras críticas: atendimento, pagamento e proteções da NFS-e.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.SIM_LATENCIA_MS = '0';
process.env.TZ = 'America/Sao_Paulo';

let db, atend, nfse, util;
const admin = { id: 1, perfil: 'ADMIN' };
const atendente = { id: 1, perfil: 'ATENDENTE' };

before(async () => {
  ({ db } = await import('../server/db.js'));
  atend = await import('../server/atendimentos.js');
  nfse = await import('../server/nfse/servico.js');
  util = await import('../server/util.js');
  configurar({ cnpj: '11222333000181', municipio_ibge: '3550308', codigo_tributacao: '140101', aliquota_iss: 2 });
});

function configurar(campos) {
  const ks = Object.keys(campos);
  db.prepare(`UPDATE empresa SET ${ks.map((k) => `${k} = ?`).join(', ')} WHERE id = 1`).run(...ks.map((k) => campos[k]));
}
const modo = (m) => configurar({ provedor_config: JSON.stringify({ modo: m }) });

let seqPlaca = 0;
function novoAtendimento(itens = [{ servico_id: 2 }]) {
  seqPlaca++;
  const placa = `TS${String.fromCharCode(65 + seqPlaca)}1A${String(seqPlaca).padStart(2, "0")}`;
  return atend.carregar(atend.salvar({ placa, porte_id: 3, itens }, admin));
}
const pagarPix = (a) => [{ forma: 'PIX', valor: a.total }];
const tentativas = (id, op) => db.prepare('SELECT COUNT(*) n FROM nfse_tentativas WHERE nfse_id = ? AND operacao = ?').get(id, op).n;
const notasSimuladas = (n) => db.prepare('SELECT COUNT(*) n FROM sim_notas WHERE chave_dps LIKE ?').get(`%|${n.serie_dps}|${n.numero_dps}`).n;

test('validadores de placa e documentos', () => {
  assert.ok(util.placaValida('ABC1234'));
  assert.ok(util.placaValida('ABC1D23'));
  assert.ok(!util.placaValida('AB1234'));
  assert.ok(util.cpfValido('52998224725'));
  assert.ok(!util.cpfValido('11111111111'));
  assert.ok(util.cnpjValido('11222333000181'));
  assert.ok(util.cnpjValido('12ABC34501DE35'), 'CNPJ alfanumérico');
  assert.ok(!util.cnpjValido('11222333000182'));
});

test('preço vem da tabela porte × serviço e fica congelado', () => {
  const a = novoAtendimento([{ servico_id: 2 }, { servico_id: 3 }]);
  assert.equal(a.total, 6000 + 2000);
  db.prepare('UPDATE precos SET valor = 9999 WHERE servico_id = 2 AND porte_id = 3').run();
  const editado = atend.carregar(atend.salvar({ placa: a.placa, porte_id: 3, itens: a.itens.map((i) => ({ id: i.id, servico_id: i.servico_id })) }, admin, a.id));
  assert.equal(editado.total, 8000, 'itens já salvos mantêm o preço');
  db.prepare('UPDATE precos SET valor = 6000 WHERE servico_id = 2 AND porte_id = 3').run();
});

test('serviço indisponível para o porte é recusado', () => {
  assert.throws(() => atend.salvar({ placa: 'MOT1A11', porte_id: 1, itens: [{ servico_id: 4 }] }, admin), /não está disponível/);
});

test('soma dos pagamentos precisa fechar o total', async () => {
  const a = novoAtendimento();
  await assert.rejects(atend.finalizar(a.id, { pagamentos: [{ forma: 'PIX', valor: 100 }], emitir_nota: false }, admin), /soma dos pagamentos/);
  const r = await atend.finalizar(a.id, { pagamentos: [{ forma: 'DINHEIRO', valor: 3000, valor_recebido: 5000 }, { forma: 'PIX', valor: 3000 }], emitir_nota: false }, admin);
  assert.equal(r.atendimento.status, 'FINALIZADO');
  assert.equal(r.atendimento.pagamentos[0].troco, 2000);
  await assert.rejects(atend.finalizar(a.id, { pagamentos: pagarPix(a), emitir_nota: false }, admin), /já foi finalizado/);
});

test('emissão bem-sucedida e bloqueio de segunda nota ativa', async () => {
  modo('sucesso');
  const a = novoAtendimento();
  const r = await atend.finalizar(a.id, { pagamentos: pagarPix(a), emitir_nota: true, tomador: { documento: '529.982.247-25' } }, admin);
  assert.equal(r.nota.situacao, 'AUTORIZADA');
  assert.ok(r.nota.numero_nfse);
  assert.throws(() => nfse.enfileirarEmissao(a.id, 1), /já possui uma nota/);
});

test('CPF inválido impede finalizar quando vai emitir (nada é gravado)', async () => {
  const a = novoAtendimento();
  await assert.rejects(atend.finalizar(a.id, { pagamentos: pagarPix(a), emitir_nota: true, tomador: { documento: '52998224724' } }, admin), /inválido/);
  assert.equal(atend.carregar(a.id).status, 'ABERTO');
  assert.equal(atend.carregar(a.id).pagamentos.length, 0);
});

test('timeout: consulta antes de reenviar e não duplica a nota', async () => {
  modo('timeout');
  const a = novoAtendimento();
  const r = await atend.finalizar(a.id, { pagamentos: pagarPix(a), emitir_nota: true }, admin);
  assert.equal(r.atendimento.status, 'FINALIZADO', 'falha na nota não desfaz o atendimento');
  assert.equal(r.nota.situacao, 'PENDENTE');
  assert.equal(r.nota.envio_incerto, 1);
  const numero = r.nota.numero_dps;

  modo('sucesso');
  const n = await nfse.processar(r.nota.id);
  assert.equal(n.situacao, 'AUTORIZADA');
  assert.equal(n.numero_dps, numero, 'mesmo número de DPS');
  assert.equal(tentativas(n.id, 'EMITIR'), 1, 'não reenviou: localizou pela consulta');
  assert.equal(tentativas(n.id, 'CONSULTAR'), 1);
  assert.equal(notasSimuladas(n), 1, 'apenas uma nota no provedor');
});

test('indisponibilidade: fica pendente e emite depois sem duplicar', async () => {
  modo('indisponivel');
  const a = novoAtendimento();
  const r = await atend.finalizar(a.id, { pagamentos: pagarPix(a), emitir_nota: true }, admin);
  assert.equal(r.nota.situacao, 'PENDENTE');
  assert.ok(r.nota.proxima_tentativa_em > util.agora(), 'reenvio agendado');
  modo('sucesso');
  const n = await nfse.processar(r.nota.id);
  assert.equal(n.situacao, 'AUTORIZADA');
  assert.equal(notasSimuladas(n), 1);
});

test('DPS duplicada no provedor: vincula a nota existente', async () => {
  modo('sucesso');
  const a = novoAtendimento();
  await atend.finalizar(a.id, { pagamentos: pagarPix(a), emitir_nota: false }, admin);
  const n0 = nfse.enfileirarEmissao(a.id, 1);
  // Simula nota criada no provedor sem que o sistema soubesse (ex.: queda após o envio, com flag perdida).
  await nfse.processar(n0.id);
  db.prepare("UPDATE nfse SET situacao = 'PENDENTE', envio_incerto = 0, numero_nfse = '' WHERE id = ?").run(n0.id);
  const n = await nfse.processar(n0.id);
  assert.equal(n.situacao, 'AUTORIZADA');
  assert.equal(notasSimuladas(n), 1);
});

test('rejeição: corrigir e reemitir usa novo número de DPS', async () => {
  modo('rejeicao');
  const a = novoAtendimento();
  const r = await atend.finalizar(a.id, { pagamentos: pagarPix(a), emitir_nota: true }, admin);
  assert.equal(r.nota.situacao, 'REJEITADA');
  assert.ok(r.nota.motivo.length > 10);
  modo('sucesso');
  atend.atualizarTomador(a.id, { documento: '52998224725' }, admin);
  const n2 = nfse.enfileirarEmissao(a.id, 1);
  assert.notEqual(n2.numero_dps, r.nota.numero_dps);
  assert.equal((await nfse.processar(n2.id)).situacao, 'AUTORIZADA');
  assert.equal(atend.carregar(a.id).notas.length, 2, 'histórico preservado');
});

test('processando: autoriza na consulta posterior', async () => {
  modo('processando');
  const a = novoAtendimento();
  const r = await atend.finalizar(a.id, { pagamentos: pagarPix(a), emitir_nota: true }, admin);
  assert.equal(r.nota.situacao, 'PROCESSANDO');
  db.prepare("UPDATE sim_notas SET autoriza_em = '2000-01-01 00:00:00'").run();
  modo('sucesso');
  assert.equal((await nfse.processar(r.nota.id)).situacao, 'AUTORIZADA');
});

test('configuração incompleta: nota aguarda e sai após corrigir', async () => {
  modo('sucesso');
  configurar({ codigo_tributacao: '' });
  const a = novoAtendimento();
  const r = await atend.finalizar(a.id, { pagamentos: pagarPix(a), emitir_nota: true }, admin);
  assert.equal(r.atendimento.status, 'FINALIZADO');
  assert.equal(r.nota.situacao, 'PENDENTE');
  assert.equal(r.nota.codigo_retorno, 'CONFIG');
  assert.equal(tentativas(r.nota.id, 'EMITIR'), 0, 'nada foi enviado');
  configurar({ codigo_tributacao: '140101' });
  nfse.liberarPendentesDeConfiguracao();
  await nfse.processarFila();
  assert.equal(nfse.obter(r.nota.id).situacao, 'AUTORIZADA');
});

test('trava impede envio simultâneo da mesma nota', async () => {
  modo('sucesso');
  process.env.SIM_LATENCIA_MS = '50';
  const a = novoAtendimento();
  await atend.finalizar(a.id, { pagamentos: pagarPix(a), emitir_nota: false }, admin);
  const n = nfse.enfileirarEmissao(a.id, 1);
  await Promise.all([nfse.processar(n.id), nfse.processar(n.id), nfse.processar(n.id)]);
  process.env.SIM_LATENCIA_MS = '0';
  assert.equal(tentativas(n.id, 'EMITIR'), 1);
  assert.equal(nfse.obter(n.id).situacao, 'AUTORIZADA');
});

test('cancelamento: atendente não cancela; admin cancela nota e atendimento', async () => {
  modo('sucesso');
  const a = novoAtendimento();
  const r = await atend.finalizar(a.id, { pagamentos: pagarPix(a), emitir_nota: true }, admin);
  await assert.rejects(atend.cancelar(a.id, 'Cliente desistiu do serviço contratado', atendente), /administrador/);
  await assert.rejects(atend.cancelar(a.id, 'curto', admin), /15 caracteres/);
  const c = await atend.cancelar(a.id, 'Serviço lançado em duplicidade', admin);
  assert.equal(c.status, 'CANCELADO');
  assert.equal(nfse.obter(r.nota.id).situacao, 'CANCELADA');
  assert.ok(c.pagamentos.every((p) => p.estornado === 1));
});

test('não cancela atendimento com nota em processamento', async () => {
  modo('processando');
  const a = novoAtendimento();
  await atend.finalizar(a.id, { pagamentos: pagarPix(a), emitir_nota: true }, admin);
  await assert.rejects(atend.cancelar(a.id, 'Motivo qualquer de teste', admin), /processamento/);
  modo('sucesso');
});

test('nota fora do prazo de cancelamento é bloqueada', async () => {
  modo('sucesso');
  const a = novoAtendimento();
  const r = await atend.finalizar(a.id, { pagamentos: pagarPix(a), emitir_nota: true }, admin);
  db.prepare("UPDATE nfse SET data_emissao = '2020-01-01 10:00:00' WHERE id = ?").run(r.nota.id);
  await assert.rejects(nfse.cancelar(r.nota.id, 'Motivo de cancelamento de teste', admin), /prazo/);
});
