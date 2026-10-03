// Rotas HTTP da API (/api).
import { Router } from 'express';
import { db, empresa, transacao, auditar } from './db.js';
import { login, logout, autenticar, somenteAdmin } from './auth.js';
import { hashSenha, confereSenha } from './senha.js';
import {
  ErroNegocio, normalizaPlaca, placaValida, normalizaDocumento, documentoValido, mascaraDocumento, agora, texto, inteiro, soDigitos,
} from './util.js';
import * as atend from './atendimentos.js';
import * as nfse from './nfse/servico.js';
import { provedorDe, nomesProvedores } from './nfse/provedores/index.js';
import { listarAtendimentos, historicoVeiculo, historicoCliente, inicio, relatorio } from './consultas.js';

export const api = Router();

api.post('/login', (req, res) => res.json(login(req.body.login, req.body.senha)));

api.use(autenticar);

api.post('/logout', (req, res) => { logout(req.token); res.json({ ok: true }); });
api.get('/me', (req, res) => res.json(req.usuario));

// ---------- Catálogo usado pela tela de atendimento ----------
function catalogo() {
  const emp = empresa();
  const portes = db.prepare('SELECT * FROM portes WHERE ativo = 1 ORDER BY ordem, nome').all();
  const servicos = db.prepare('SELECT * FROM servicos WHERE ativo = 1 ORDER BY ordem, nome').all();
  const precos = db.prepare('SELECT * FROM precos').all();
  for (const s of servicos) s.precos = Object.fromEntries(precos.filter((p) => p.servico_id === s.id).map((p) => [p.porte_id, p.valor]));
  return {
    portes, servicos,
    formas: emp.formas_pagamento.map((f) => ({ id: f, nome: atend.FORMAS[f] })),
    empresa: {
      razao_social: emp.razao_social, emissao_automatica: !!emp.emissao_automatica,
      permite_tomador_nao_identificado: !!emp.permite_tomador_nao_identificado, exige_nome_pf: !!emp.exige_nome_pf,
      exige_endereco_pj: !!emp.exige_endereco_pj, atendente_cancela_nota: !!emp.atendente_cancela_nota,
      provedor: emp.provedor, ambiente: emp.ambiente,
    },
  };
}
api.get('/catalogo', (req, res) => res.json(catalogo()));

api.get('/inicio', (req, res) => {
  const r = inicio();
  if (req.usuario.perfil !== 'ADMIN') r.alertas = r.alertas.filter((a) => a.nivel !== 'info' || a.texto.startsWith('Modo'));
  const u = db.prepare('SELECT login, senha_hash FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (u.login === 'admin' && confereSenha('admin123', u.senha_hash)) {
    r.alertas.unshift({ nivel: 'erro', texto: 'Você está usando a senha padrão do administrador. Troque agora (menu do usuário › Trocar senha).' });
  }
  res.json(r);
});

// ---------- Veículos e busca ----------
function veiculoCompleto(v) {
  const cliente = v.cliente_habitual_id ? db.prepare('SELECT * FROM clientes WHERE id = ?').get(v.cliente_habitual_id) : null;
  const ultimo = db.prepare("SELECT id FROM atendimentos WHERE veiculo_id = ? AND status = 'FINALIZADO' ORDER BY id DESC LIMIT 1").get(v.id);
  const ultimosItens = ultimo ? db.prepare(`SELECT i.servico_id, i.descricao, s.avulso, s.ativo FROM itens_atendimento i JOIN servicos s ON s.id = i.servico_id
    WHERE i.atendimento_id = ? ORDER BY i.id`).all(ultimo.id).filter((i) => !i.avulso && i.ativo) : [];
  const aberto = db.prepare("SELECT id FROM atendimentos WHERE veiculo_id = ? AND status = 'ABERTO' ORDER BY id DESC LIMIT 1").get(v.id);
  return { ...v, cliente: cliente && clientePublico(cliente), ultimos_itens: ultimosItens, atendimento_aberto: aberto?.id || null, historico: historicoVeiculo(v.id, 5) };
}

api.get('/veiculos/placa/:placa', (req, res) => {
  const placa = normalizaPlaca(req.params.placa);
  const v = db.prepare('SELECT * FROM veiculos WHERE placa = ?').get(placa);
  res.json({ placa, valida: placaValida(placa), veiculo: v ? veiculoCompleto(v) : null });
});

api.get('/busca', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const placa = normalizaPlaca(q);
  const dig = soDigitos(q);
  const doc = normalizaDocumento(q);
  const rows = db.prepare(`SELECT v.id veiculo_id, v.placa, v.modelo_cor, p.nome porte_nome, c.id cliente_id, c.nome cliente_nome, c.telefone
    FROM veiculos v JOIN portes p ON p.id = v.porte_id LEFT JOIN clientes c ON c.id = v.cliente_habitual_id
    WHERE v.placa LIKE ? OR c.nome LIKE ? OR (? <> '' AND replace(replace(replace(replace(c.telefone,'(',''),')',''),'-',''),' ','') LIKE ?) OR (? <> '' AND c.documento = ?)
    ORDER BY v.placa LIMIT 30`).all(`%${placa}%`, `%${q}%`, dig.length >= 4 ? dig : '', `%${dig}%`, doc.length >= 11 ? doc : '', doc);
  // Clientes sem veículo também aparecem.
  const soClientes = db.prepare(`SELECT NULL veiculo_id, NULL placa, NULL modelo_cor, NULL porte_nome, c.id cliente_id, c.nome cliente_nome, c.telefone
    FROM clientes c WHERE NOT EXISTS (SELECT 1 FROM veiculos v WHERE v.cliente_habitual_id = c.id) AND (c.nome LIKE ? OR (? <> '' AND c.documento = ?)) LIMIT 10`)
    .all(`%${q}%`, doc.length >= 11 ? doc : '', doc);
  res.json([...rows, ...soClientes]);
});

api.post('/veiculos', (req, res) => {
  const placa = normalizaPlaca(req.body.placa);
  if (!placaValida(placa)) throw new ErroNegocio('Placa inválida. Use o formato ABC1234 ou ABC1D23.', 400, 'placa');
  if (db.prepare('SELECT 1 FROM veiculos WHERE placa = ?').get(placa)) throw new ErroNegocio('Já existe um veículo com esta placa.', 409, 'placa');
  const porte = inteiro(req.body.porte_id, 'porte');
  const r = db.prepare('INSERT INTO veiculos (placa, porte_id, modelo_cor, cliente_habitual_id, criado_em) VALUES (?,?,?,?,?)')
    .run(placa, porte, texto(req.body.modelo_cor, 80), req.body.cliente_id || null, agora());
  res.json(db.prepare('SELECT * FROM veiculos WHERE id = ?').get(Number(r.lastInsertRowid)));
});

api.put('/veiculos/:id', (req, res) => {
  const v = db.prepare('SELECT * FROM veiculos WHERE id = ?').get(req.params.id);
  if (!v) throw new ErroNegocio('Veículo não encontrado.', 404);
  const placa = normalizaPlaca(req.body.placa ?? v.placa);
  if (!placaValida(placa)) throw new ErroNegocio('Placa inválida.', 400, 'placa');
  if (db.prepare('SELECT 1 FROM veiculos WHERE placa = ? AND id <> ?').get(placa, v.id)) throw new ErroNegocio('Já existe um veículo com esta placa.', 409, 'placa');
  db.prepare('UPDATE veiculos SET placa = ?, porte_id = ?, modelo_cor = ?, cliente_habitual_id = ? WHERE id = ?').run(
    placa, inteiro(req.body.porte_id ?? v.porte_id, 'porte'), texto(req.body.modelo_cor ?? v.modelo_cor, 80),
    req.body.cliente_id === undefined ? v.cliente_habitual_id : req.body.cliente_id || null, v.id);
  auditar(req.usuario.id, 'veiculo', v.id, 'ALTERAR', { placa });
  res.json(db.prepare('SELECT * FROM veiculos WHERE id = ?').get(v.id));
});

// ---------- Clientes ----------
// Em listagens o documento sai apenas mascarado (LGPD).
function clientePublico(c, mascarar = false) {
  const r = { ...c, endereco: JSON.parse(c.endereco || '{}'), documento: c.documento || '', documento_mascarado: mascaraDocumento(c.documento) };
  if (mascarar) delete r.documento;
  return r;
}

function dadosCliente(b) {
  const documento = normalizaDocumento(b.documento);
  if (documento && !documentoValido(documento)) throw new ErroNegocio('CPF/CNPJ inválido.', 400, 'documento');
  const e = b.endereco || {};
  return {
    nome: texto(b.nome, 150), telefone: texto(b.telefone, 30), email: texto(b.email, 150), documento: documento || null,
    inscricao_municipal: texto(b.inscricao_municipal, 30),
    endereco: JSON.stringify({ cep: texto(e.cep, 9), logradouro: texto(e.logradouro, 150), numero: texto(e.numero, 20), complemento: texto(e.complemento, 60),
      bairro: texto(e.bairro, 80), cidade: texto(e.cidade, 80), uf: texto(e.uf, 2).toUpperCase() }),
  };
}

api.get('/clientes', (req, res) => {
  const q = String(req.query.q || '').trim();
  const dig = soDigitos(q);
  const doc = normalizaDocumento(q);
  const placa = normalizaPlaca(q);
  const rows = db.prepare(`SELECT c.*, (SELECT group_concat(placa, ', ') FROM veiculos v WHERE v.cliente_habitual_id = c.id) placas,
      (SELECT MAX(COALESCE(finalizado_em, aberto_em)) FROM atendimentos a WHERE a.cliente_id = c.id) ultimo_atendimento
    FROM clientes c
    WHERE ? = '' OR c.nome LIKE ? OR (? <> '' AND replace(replace(replace(replace(c.telefone,'(',''),')',''),'-',''),' ','') LIKE ?)
      OR (? <> '' AND c.documento LIKE ?) OR (? <> '' AND EXISTS (SELECT 1 FROM veiculos v WHERE v.cliente_habitual_id = c.id AND v.placa LIKE ?))
    ORDER BY c.nome LIMIT 200`).all(q, `%${q}%`, dig.length >= 3 ? dig : '', `%${dig}%`, doc.length >= 3 ? doc : '', `%${doc}%`, placa.length >= 3 ? placa : '', `%${placa}%`);
  res.json(rows.map((c) => clientePublico(c, true)));
});

api.get('/clientes/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!c) throw new ErroNegocio('Cliente não encontrado.', 404);
  const veiculos = db.prepare('SELECT v.*, p.nome porte_nome FROM veiculos v JOIN portes p ON p.id = v.porte_id WHERE cliente_habitual_id = ? ORDER BY placa').all(c.id);
  res.json({ ...clientePublico(c), veiculos, historico: historicoCliente(c.id) });
});

api.post('/clientes', (req, res) => {
  const d = dadosCliente(req.body);
  if (!d.nome && !d.documento && !d.telefone) throw new ErroNegocio('Informe ao menos nome, telefone ou CPF/CNPJ.', 400, 'nome');
  if (d.documento && db.prepare('SELECT 1 FROM clientes WHERE documento = ?').get(d.documento)) throw new ErroNegocio('Já existe cliente com este CPF/CNPJ.', 409, 'documento');
  const r = db.prepare('INSERT INTO clientes (nome, telefone, email, documento, inscricao_municipal, endereco, criado_em) VALUES (?,?,?,?,?,?,?)')
    .run(d.nome, d.telefone, d.email, d.documento, d.inscricao_municipal, d.endereco, agora());
  res.json(clientePublico(db.prepare('SELECT * FROM clientes WHERE id = ?').get(Number(r.lastInsertRowid))));
});

api.put('/clientes/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!c) throw new ErroNegocio('Cliente não encontrado.', 404);
  const d = dadosCliente(req.body);
  if (d.documento && db.prepare('SELECT 1 FROM clientes WHERE documento = ? AND id <> ?').get(d.documento, c.id)) throw new ErroNegocio('Já existe cliente com este CPF/CNPJ.', 409, 'documento');
  db.prepare('UPDATE clientes SET nome = ?, telefone = ?, email = ?, documento = ?, inscricao_municipal = ?, endereco = ? WHERE id = ?')
    .run(d.nome, d.telefone, d.email, d.documento, d.inscricao_municipal, d.endereco, c.id);
  auditar(req.usuario.id, 'cliente', c.id, 'ALTERAR');
  res.json(clientePublico(db.prepare('SELECT * FROM clientes WHERE id = ?').get(c.id)));
});

// ---------- Atendimentos ----------
api.get('/atendimentos', (req, res) => res.json(listarAtendimentos(req.query)));

api.get('/atendimentos.csv', (req, res) => {
  const linhas = listarAtendimentos(req.query);
  const cab = ['Número', 'Status', 'Abertura', 'Finalização', 'Placa', 'Veículo', 'Porte', 'Cliente', 'Serviços', 'Desconto', 'Total', 'Pagamento', 'Situação NFS-e', 'Nº NFS-e'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const valor = (c) => (c / 100).toFixed(2).replace('.', ',');
  const corpo = linhas.map((l) => [l.id, l.status, l.aberto_em, l.finalizado_em, l.placa, l.modelo_cor, l.porte_nome, l.cliente_nome, l.servicos,
    valor(l.desconto), valor(l.total), l.formas, l.nota_situacao || (l.status === 'FINALIZADO' ? 'SEM NOTA' : ''), l.nota_numero].map(esc).join(';'));
  res.type('text/csv; charset=utf-8').attachment('atendimentos.csv').send('﻿' + [cab.map(esc).join(';'), ...corpo].join('\r\n'));
});

api.get('/atendimentos/:id', (req, res) => res.json(atend.carregar(Number(req.params.id))));

api.post('/atendimentos', (req, res) => {
  const id = atend.salvar(req.body, req.usuario);
  res.json(atend.carregar(id));
});

api.put('/atendimentos/:id', (req, res) => {
  const id = atend.salvar(req.body, req.usuario, Number(req.params.id));
  res.json(atend.carregar(id));
});

api.post('/atendimentos/:id/finalizar', async (req, res) => {
  res.json(await atend.finalizar(Number(req.params.id), req.body, req.usuario));
});

api.post('/atendimentos/:id/cancelar', async (req, res) => {
  res.json(await atend.cancelar(Number(req.params.id), req.body.motivo, req.usuario));
});

api.put('/atendimentos/:id/tomador', (req, res) => {
  res.json(atend.atualizarTomador(Number(req.params.id), req.body, req.usuario));
});

// ---------- NFS-e ----------
api.post('/atendimentos/:id/nfse', async (req, res) => {
  const n = nfse.enfileirarEmissao(Number(req.params.id), req.usuario.id);
  res.json(await nfse.processarComEspera(n.id, req.usuario.id));
});

api.get('/nfse/:id', (req, res) => {
  const n = nfse.obter(Number(req.params.id));
  if (!n) throw new ErroNegocio('Nota não encontrada.', 404);
  const { xml, ...resto } = n;
  res.json({ ...resto, tem_xml: !!xml, tentativas_log: nfse.tentativasDe(n.id).map((t) => ({ ...t, requisicao: undefined })) });
});

api.get('/nfse/:id/xml', (req, res) => {
  const n = nfse.obter(Number(req.params.id));
  if (!n?.xml) throw new ErroNegocio('XML não disponível.', 404);
  res.type('application/xml').attachment(`nfse-${n.numero_nfse || n.numero_dps}.xml`).send(n.xml);
});

api.post('/nfse/:id/tentar', async (req, res) => res.json(await nfse.tentarAgora(Number(req.params.id), req.usuario)));
api.post('/nfse/:id/consultar', async (req, res) => res.json(await nfse.consultarAgora(Number(req.params.id), req.usuario)));
api.post('/nfse/:id/cancelar', async (req, res) => res.json(await nfse.cancelar(Number(req.params.id), req.body.motivo, req.usuario)));

// ---------- Relatórios ----------
api.get('/relatorios', somenteAdmin, (req, res) => {
  const de = String(req.query.de || agora().slice(0, 10));
  const ate = String(req.query.ate || de);
  res.json(relatorio(de, ate));
});

// ---------- Configurações (admin) ----------
const CAMPOS_EMPRESA = {
  razao_social: 'texto', cnpj: 'doc', inscricao_municipal: 'texto', endereco: 'texto', municipio: 'texto', municipio_ibge: 'digitos', uf: 'uf',
  telefone: 'texto', email: 'texto', regime_tributario: ['MEI', 'SIMPLES', 'NORMAL'], codigo_servico: 'texto', codigo_tributacao: 'texto',
  aliquota_iss: 'numero', cnae: 'digitos', tratamento_desconto: ['LIQUIDO', 'INCONDICIONADO'], emissao_automatica: 'bool',
  ambiente: ['HOMOLOGACAO', 'PRODUCAO'], serie_dps: 'texto', proximo_numero_dps: 'inteiro', provedor: nomesProvedores,
  provedor_config: 'json', certificado_validade: 'data', prazo_cancelamento_horas: 'inteiro', permite_tomador_nao_identificado: 'bool',
  exige_nome_pf: 'bool', exige_endereco_pj: 'bool', atendente_cancela_nota: 'bool', alerta_pendente_horas: 'inteiro', formas_pagamento: 'formas',
};

api.get('/empresa', somenteAdmin, (req, res) => res.json({ ...empresa(), provedores: nomesProvedores }));

api.put('/empresa', somenteAdmin, (req, res) => {
  const atual = empresa();
  const sets = {};
  for (const [campo, tipo] of Object.entries(CAMPOS_EMPRESA)) {
    if (!(campo in req.body)) continue;
    let v = req.body[campo];
    if (Array.isArray(tipo)) { if (!tipo.includes(v)) throw new ErroNegocio(`Valor inválido para ${campo}.`, 400, campo); }
    else if (tipo === 'texto') v = texto(v, 200);
    else if (tipo === 'digitos') v = soDigitos(v);
    else if (tipo === 'uf') v = texto(v, 2).toUpperCase();
    else if (tipo === 'doc') { v = normalizaDocumento(v); if (v && !documentoValido(v)) throw new ErroNegocio('CNPJ da empresa inválido.', 400, campo); }
    else if (tipo === 'numero') { v = Number(v); if (!(v >= 0 && v <= 100)) throw new ErroNegocio('Alíquota inválida.', 400, campo); }
    else if (tipo === 'inteiro') { v = inteiro(v, campo); if (v < 0) throw new ErroNegocio(`Valor inválido para ${campo}.`, 400, campo); }
    else if (tipo === 'bool') v = v ? 1 : 0;
    else if (tipo === 'data') { v = String(v || ''); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ErroNegocio('Data inválida.', 400, campo); }
    else if (tipo === 'json') v = JSON.stringify(v || {});
    else if (tipo === 'formas') {
      if (!Array.isArray(v) || !v.length || v.some((f) => !atend.FORMAS[f])) throw new ErroNegocio('Selecione ao menos uma forma de pagamento.', 400, campo);
      v = JSON.stringify(v);
    }
    sets[campo] = v;
  }
  if ('proximo_numero_dps' in sets && sets.proximo_numero_dps < 1) throw new ErroNegocio('Número da DPS deve ser maior que zero.', 400, 'proximo_numero_dps');
  transacao(() => {
    const ks = Object.keys(sets);
    if (ks.length) db.prepare(`UPDATE empresa SET ${ks.map((k) => `${k} = ?`).join(', ')} WHERE id = 1`).run(...ks.map((k) => sets[k]));
    const mudou = ks.filter((k) => String(sets[k]) !== String(typeof atual[k] === 'object' ? JSON.stringify(atual[k]) : atual[k]));
    if (mudou.length) auditar(req.usuario.id, 'empresa', 1, 'ALTERAR', mudou.join(', '));
  });
  nfse.liberarPendentesDeConfiguracao();
  res.json({ ...empresa(), provedores: nomesProvedores });
});

api.post('/empresa/testar-conexao', somenteAdmin, async (req, res) => {
  const emp = empresa();
  const faltas = nfse.configIncompleta(emp);
  const r = await provedorDe(emp).testarConexao(emp).catch((e) => ({ ok: false, mensagem: e.message }));
  res.json({ ...r, faltas });
});

api.get('/portes', somenteAdmin, (req, res) => res.json(db.prepare('SELECT * FROM portes ORDER BY ordem, nome').all()));

function dadosPorte(b) {
  const nome = texto(b.nome, 40);
  if (!nome) throw new ErroNegocio('Informe o nome do porte.', 400, 'nome');
  return [nome, texto(b.exemplos, 150), Number(b.ordem) || 0, b.ativo === false || b.ativo === 0 ? 0 : 1];
}
api.post('/portes', somenteAdmin, (req, res) => {
  const r = db.prepare('INSERT INTO portes (nome, exemplos, ordem, ativo) VALUES (?,?,?,?)').run(...dadosPorte(req.body));
  res.json(db.prepare('SELECT * FROM portes WHERE id = ?').get(Number(r.lastInsertRowid)));
});
api.put('/portes/:id', somenteAdmin, (req, res) => {
  db.prepare('UPDATE portes SET nome = ?, exemplos = ?, ordem = ?, ativo = ? WHERE id = ?').run(...dadosPorte(req.body), req.params.id);
  res.json(db.prepare('SELECT * FROM portes WHERE id = ?').get(req.params.id));
});

api.get('/servicos', somenteAdmin, (req, res) => {
  const servicos = db.prepare('SELECT * FROM servicos ORDER BY ordem, nome').all();
  const precos = db.prepare('SELECT * FROM precos').all();
  for (const s of servicos) s.precos = Object.fromEntries(precos.filter((p) => p.servico_id === s.id).map((p) => [p.porte_id, p.valor]));
  res.json(servicos);
});

// Salva a grade inteira de serviços e preços de uma vez.
api.put('/servicos', somenteAdmin, (req, res) => {
  const lista = Array.isArray(req.body) ? req.body : [];
  const portes = new Set(db.prepare('SELECT id FROM portes').all().map((p) => p.id));
  transacao(() => {
    lista.forEach((s, i) => {
      const nome = texto(s.nome, 80);
      if (!nome) throw new ErroNegocio('Todo serviço precisa de um nome.', 400, 'nome');
      const avulso = s.avulso ? 1 : 0;
      const ativo = s.ativo === false || s.ativo === 0 ? 0 : 1;
      let id = s.id;
      if (id) db.prepare('UPDATE servicos SET nome = ?, avulso = ?, ordem = ?, ativo = ? WHERE id = ?').run(nome, avulso, i + 1, ativo, id);
      else id = Number(db.prepare('INSERT INTO servicos (nome, avulso, ordem, ativo) VALUES (?,?,?,?)').run(nome, avulso, i + 1, ativo).lastInsertRowid);
      db.prepare('DELETE FROM precos WHERE servico_id = ?').run(id);
      if (avulso) return;
      for (const [porteId, valor] of Object.entries(s.precos || {})) {
        if (valor === null || valor === '' || valor === undefined) continue;
        const v = Math.round(Number(valor));
        if (!(v >= 0) || !portes.has(Number(porteId))) throw new ErroNegocio(`Preço inválido em "${nome}".`, 400, 'preco');
        db.prepare('INSERT INTO precos (servico_id, porte_id, valor) VALUES (?,?,?)').run(id, Number(porteId), v);
      }
    });
    auditar(req.usuario.id, 'servicos', null, 'ALTERAR_TABELA', `${lista.length} serviço(s)`);
  });
  res.json({ ok: true });
});

api.get('/usuarios', somenteAdmin, (req, res) => res.json(db.prepare('SELECT id, nome, login, perfil, ativo FROM usuarios ORDER BY nome').all()));

api.post('/usuarios', somenteAdmin, (req, res) => {
  const nome = texto(req.body.nome, 80);
  const login = texto(req.body.login, 40).toLowerCase();
  const perfil = req.body.perfil === 'ADMIN' ? 'ADMIN' : 'ATENDENTE';
  if (!nome || !login) throw new ErroNegocio('Informe nome e login.', 400, 'nome');
  if (String(req.body.senha || '').length < 6) throw new ErroNegocio('A senha precisa ter pelo menos 6 caracteres.', 400, 'senha');
  if (db.prepare('SELECT 1 FROM usuarios WHERE login = ?').get(login)) throw new ErroNegocio('Este login já existe.', 409, 'login');
  const r = db.prepare('INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES (?,?,?,?)').run(nome, login, hashSenha(req.body.senha), perfil);
  auditar(req.usuario.id, 'usuario', Number(r.lastInsertRowid), 'CRIAR', login);
  res.json({ ok: true });
});

api.put('/usuarios/:id', somenteAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!u) throw new ErroNegocio('Usuário não encontrado.', 404);
  const perfil = req.body.perfil === 'ADMIN' ? 'ADMIN' : 'ATENDENTE';
  const ativo = req.body.ativo === false || req.body.ativo === 0 ? 0 : 1;
  if (u.id === req.usuario.id && (perfil !== 'ADMIN' || !ativo)) throw new ErroNegocio('Você não pode remover seu próprio acesso de administrador.');
  db.prepare('UPDATE usuarios SET nome = ?, perfil = ?, ativo = ? WHERE id = ?').run(texto(req.body.nome, 80) || u.nome, perfil, ativo, u.id);
  if (req.body.senha) {
    if (String(req.body.senha).length < 6) throw new ErroNegocio('A senha precisa ter pelo menos 6 caracteres.', 400, 'senha');
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hashSenha(req.body.senha), u.id);
    db.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND token <> ?').run(u.id, req.token);
  }
  if (!ativo) db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(u.id);
  auditar(req.usuario.id, 'usuario', u.id, 'ALTERAR', { perfil, ativo, senha: !!req.body.senha });
  res.json({ ok: true });
});

// Qualquer usuário pode trocar a própria senha.
api.put('/me/senha', (req, res) => {
  if (String(req.body.nova || '').length < 6) throw new ErroNegocio('A nova senha precisa ter pelo menos 6 caracteres.', 400, 'nova');
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!confereSenha(req.body.atual, u.senha_hash)) throw new ErroNegocio('Senha atual incorreta.', 400, 'atual');
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hashSenha(req.body.nova), u.id);
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND token <> ?').run(u.id, req.token);
  res.json({ ok: true });
});

api.get('/auditoria', somenteAdmin, (req, res) => {
  res.json(db.prepare(`SELECT a.*, u.nome usuario FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id ORDER BY a.id DESC LIMIT 300`).all());
});
