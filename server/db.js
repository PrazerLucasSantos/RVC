// Banco SQLite (módulo nativo node:sqlite). Schema, migração simples e dados iniciais.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashSenha } from './senha.js';
import { agora } from './util.js';

const caminho = process.env.DB_PATH || fileURLToPath(new URL('../data/rvc.db', import.meta.url));
if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });

export const db = new DatabaseSync(caminho);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS empresa (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  razao_social TEXT NOT NULL DEFAULT '',
  cnpj TEXT NOT NULL DEFAULT '',
  inscricao_municipal TEXT NOT NULL DEFAULT '',
  endereco TEXT NOT NULL DEFAULT '',
  municipio TEXT NOT NULL DEFAULT '',
  municipio_ibge TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  regime_tributario TEXT NOT NULL DEFAULT 'SIMPLES',
  codigo_servico TEXT NOT NULL DEFAULT '14.01',
  codigo_tributacao TEXT NOT NULL DEFAULT '',
  aliquota_iss REAL NOT NULL DEFAULT 0,
  cnae TEXT NOT NULL DEFAULT '',
  tratamento_desconto TEXT NOT NULL DEFAULT 'LIQUIDO',
  emissao_automatica INTEGER NOT NULL DEFAULT 1,
  ambiente TEXT NOT NULL DEFAULT 'HOMOLOGACAO',
  serie_dps TEXT NOT NULL DEFAULT '1',
  proximo_numero_dps INTEGER NOT NULL DEFAULT 1,
  provedor TEXT NOT NULL DEFAULT 'simulado',
  provedor_config TEXT NOT NULL DEFAULT '{"modo":"sucesso"}',
  certificado_validade TEXT NOT NULL DEFAULT '',
  prazo_cancelamento_horas INTEGER NOT NULL DEFAULT 720,
  permite_tomador_nao_identificado INTEGER NOT NULL DEFAULT 1,
  exige_nome_pf INTEGER NOT NULL DEFAULT 0,
  exige_endereco_pj INTEGER NOT NULL DEFAULT 0,
  atendente_cancela_nota INTEGER NOT NULL DEFAULT 0,
  alerta_pendente_horas INTEGER NOT NULL DEFAULT 4,
  formas_pagamento TEXT NOT NULL DEFAULT '["DINHEIRO","PIX","DEBITO","CREDITO","OUTRO"]'
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('ADMIN','ATENDENTE')),
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  expira_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  exemplos TEXT NOT NULL DEFAULT '',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS servicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  avulso INTEGER NOT NULL DEFAULT 0,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS precos (
  servico_id INTEGER NOT NULL REFERENCES servicos(id),
  porte_id INTEGER NOT NULL REFERENCES portes(id),
  valor INTEGER NOT NULL CHECK (valor >= 0),
  PRIMARY KEY (servico_id, porte_id)
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  documento TEXT,
  endereco TEXT NOT NULL DEFAULT '{}',
  inscricao_municipal TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_documento ON clientes(documento) WHERE documento IS NOT NULL AND documento <> '';

CREATE TABLE IF NOT EXISTS veiculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placa TEXT NOT NULL UNIQUE,
  porte_id INTEGER NOT NULL REFERENCES portes(id),
  modelo_cor TEXT NOT NULL DEFAULT '',
  cliente_habitual_id INTEGER REFERENCES clientes(id),
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS atendimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  veiculo_id INTEGER NOT NULL REFERENCES veiculos(id),
  porte_id INTEGER NOT NULL REFERENCES portes(id),
  cliente_id INTEGER REFERENCES clientes(id),
  tomador_documento TEXT NOT NULL DEFAULT '',
  tomador_nome TEXT NOT NULL DEFAULT '',
  tomador_email TEXT NOT NULL DEFAULT '',
  tomador_telefone TEXT NOT NULL DEFAULT '',
  tomador_endereco TEXT NOT NULL DEFAULT '{}',
  subtotal INTEGER NOT NULL DEFAULT 0,
  desconto_tipo TEXT NOT NULL DEFAULT 'VALOR',
  desconto_informado REAL NOT NULL DEFAULT 0,
  desconto INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  observacao TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO','FINALIZADO','CANCELADO')),
  aberto_em TEXT NOT NULL,
  aberto_por INTEGER REFERENCES usuarios(id),
  finalizado_em TEXT,
  finalizado_por INTEGER REFERENCES usuarios(id),
  cancelado_em TEXT,
  cancelado_por INTEGER REFERENCES usuarios(id),
  motivo_cancelamento TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_atend_status ON atendimentos(status);
CREATE INDEX IF NOT EXISTS ix_atend_finalizado ON atendimentos(finalizado_em);
CREATE INDEX IF NOT EXISTS ix_atend_veiculo ON atendimentos(veiculo_id);

CREATE TABLE IF NOT EXISTS itens_atendimento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atendimento_id INTEGER NOT NULL REFERENCES atendimentos(id) ON DELETE CASCADE,
  servico_id INTEGER NOT NULL REFERENCES servicos(id),
  descricao TEXT NOT NULL,
  valor INTEGER NOT NULL CHECK (valor >= 0)
);

CREATE TABLE IF NOT EXISTS pagamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atendimento_id INTEGER NOT NULL REFERENCES atendimentos(id),
  forma TEXT NOT NULL,
  valor INTEGER NOT NULL CHECK (valor > 0),
  valor_recebido INTEGER,
  troco INTEGER NOT NULL DEFAULT 0,
  estornado INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  criado_por INTEGER REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS nfse (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  atendimento_id INTEGER NOT NULL REFERENCES atendimentos(id),
  situacao TEXT NOT NULL CHECK (situacao IN ('PENDENTE','PROCESSANDO','AUTORIZADA','REJEITADA','CANCELANDO','CANCELADA')),
  ambiente TEXT NOT NULL,
  serie_dps TEXT NOT NULL,
  numero_dps INTEGER NOT NULL,
  referencia TEXT NOT NULL UNIQUE,
  valor INTEGER NOT NULL,
  discriminacao TEXT NOT NULL,
  tomador TEXT NOT NULL DEFAULT '{}',
  envio_incerto INTEGER NOT NULL DEFAULT 0,
  protocolo TEXT NOT NULL DEFAULT '',
  numero_nfse TEXT NOT NULL DEFAULT '',
  codigo_verificacao TEXT NOT NULL DEFAULT '',
  chave_acesso TEXT NOT NULL DEFAULT '',
  data_emissao TEXT,
  link_consulta TEXT NOT NULL DEFAULT '',
  xml TEXT NOT NULL DEFAULT '',
  token_publico TEXT NOT NULL UNIQUE,
  motivo TEXT NOT NULL DEFAULT '',
  codigo_retorno TEXT NOT NULL DEFAULT '',
  cancelamento_motivo TEXT NOT NULL DEFAULT '',
  cancelada_em TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  proxima_tentativa_em TEXT,
  trava_ate TEXT,
  criado_em TEXT NOT NULL,
  criado_por INTEGER REFERENCES usuarios(id),
  atualizado_em TEXT NOT NULL,
  UNIQUE (serie_dps, numero_dps, ambiente)
);
-- Regra central anti-duplicidade: no máximo uma NFS-e ativa por atendimento.
CREATE UNIQUE INDEX IF NOT EXISTS ux_nfse_ativa ON nfse(atendimento_id)
  WHERE situacao IN ('PENDENTE','PROCESSANDO','AUTORIZADA','CANCELANDO');
CREATE INDEX IF NOT EXISTS ix_nfse_fila ON nfse(situacao, proxima_tentativa_em);

CREATE TABLE IF NOT EXISTS nfse_tentativas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nfse_id INTEGER NOT NULL REFERENCES nfse(id),
  operacao TEXT NOT NULL,
  iniciado_em TEXT NOT NULL,
  finalizado_em TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  requisicao TEXT NOT NULL DEFAULT '',
  resposta TEXT NOT NULL DEFAULT '',
  resultado TEXT NOT NULL DEFAULT '',
  codigo TEXT NOT NULL DEFAULT '',
  mensagem TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER REFERENCES usuarios(id),
  data_hora TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id INTEGER,
  acao TEXT NOT NULL,
  detalhe TEXT NOT NULL DEFAULT ''
);

-- Armazenamento interno do provedor SIMULADO (imita o lado da prefeitura).
CREATE TABLE IF NOT EXISTS sim_notas (
  chave_dps TEXT PRIMARY KEY,
  numero_nfse INTEGER NOT NULL,
  situacao TEXT NOT NULL,
  autoriza_em TEXT,
  codigo_verificacao TEXT NOT NULL,
  dados TEXT NOT NULL
);
`);

export function transacao(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function auditar(usuarioId, entidade, entidadeId, acao, detalhe = '') {
  db.prepare('INSERT INTO auditoria (usuario_id, data_hora, entidade, entidade_id, acao, detalhe) VALUES (?,?,?,?,?,?)')
    .run(usuarioId ?? null, agora(), entidade, entidadeId ?? null, acao, typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe));
}

export function empresa() {
  const e = db.prepare('SELECT * FROM empresa WHERE id = 1').get();
  return { ...e, provedor_config: JSON.parse(e.provedor_config), formas_pagamento: JSON.parse(e.formas_pagamento) };
}

function seed() {
  if (db.prepare('SELECT COUNT(*) n FROM usuarios').get().n > 0) return;
  transacao(() => {
    db.prepare("INSERT INTO empresa (id, razao_social) VALUES (1, 'Meu Lava-Car')").run();
    db.prepare("INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES ('Administrador', 'admin', ?, 'ADMIN')")
      .run(hashSenha(process.env.ADMIN_SENHA || 'admin123'));

    const portes = [
      ['Moto', 'Qualquer moto', 1],
      ['Pequeno', 'Gol, Onix, HB20, Mobi', 2],
      ['Médio', 'Virtus, Corolla, Cronos, T-Cross', 3],
      ['Grande', 'Compass, SW4, Hilux, Tiguan', 4],
      ['Extra grande', 'Ranger, Amarok, S10 cabine dupla, vans', 5],
    ];
    const insPorte = db.prepare('INSERT INTO portes (nome, exemplos, ordem) VALUES (?,?,?)');
    const idsPorte = portes.map((p) => Number(insPorte.run(...p).lastInsertRowid));

    // Preços em centavos por porte (Moto, Pequeno, Médio, Grande, Extra grande); null = indisponível.
    const servicos = [
      ['Lavagem simples', [2500, 3500, 4000, 5000, 6000]],
      ['Lavagem completa', [3500, 5000, 6000, 7000, 8500]],
      ['Cera', [1500, 2000, 2000, 2500, 3000]],
      ['Higienização interna', [null, 15000, 18000, 22000, 26000]],
      ['Polimento', [12000, 25000, 30000, 35000, 40000]],
      ['Lavagem de motor', [null, 4000, 4000, 5000, 5000]],
    ];
    const insServ = db.prepare('INSERT INTO servicos (nome, ordem) VALUES (?,?)');
    const insPreco = db.prepare('INSERT INTO precos (servico_id, porte_id, valor) VALUES (?,?,?)');
    servicos.forEach(([nome, valores], i) => {
      const sid = Number(insServ.run(nome, i + 1).lastInsertRowid);
      valores.forEach((v, j) => v != null && insPreco.run(sid, idsPorte[j], v));
    });
    db.prepare("INSERT INTO servicos (nome, avulso, ordem) VALUES ('Avulso / adicional', 1, 99)").run();
  });
}

seed();
