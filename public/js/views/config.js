// Configurações (admin): empresa e fiscal, serviços e preços, portes, usuários e auditoria.
import { api } from '../api.js';
import { $, $$, esc, moedaInput, parseMoeda, dataHora, toast, comBotao, erroCampo, modal, confirmar, FORMAS } from '../ui.js';
import { carregarCatalogo } from '../app.js';

let abaAtual = 'empresa';

export async function telaConfig(app) {
  app.innerHTML = `<h1>Configurações</h1>
    <div class="abas" role="tablist">
      ${[['empresa', 'Empresa e fiscal'], ['servicos', 'Serviços e preços'], ['portes', 'Portes'], ['usuarios', 'Usuários'], ['auditoria', 'Auditoria']]
        .map(([k, t]) => `<button data-aba="${k}" class="${abaAtual === k ? 'ativa' : ''}" role="tab">${t}</button>`).join('')}
    </div><div id="aba"></div>`;
  $$('[data-aba]').forEach((b) => (b.onclick = () => { abaAtual = b.dataset.aba; telaConfig(app); }));
  const alvo = $('#aba');
  await { empresa: abaEmpresa, servicos: abaServicos, portes: abaPortes, usuarios: abaUsuarios, auditoria: abaAuditoria }[abaAtual](alvo);
}

// ---------------------------------------------------------------------
async function abaEmpresa(el) {
  const e = await api('/empresa');
  const sel = (nome, opcoes, atual) => `<select name="${nome}">${opcoes.map(([v, t]) => `<option value="${v}" ${String(atual) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const chk = (nome, atual, texto) => `<label class="check"><input type="checkbox" name="${nome}" ${atual ? 'checked' : ''}> ${texto}</label>`;
  el.innerHTML = `<form id="f-emp">
    <div class="grade-2">
      <section class="cartao"><h2>Dados da empresa (prestador)</h2>
        <label class="campo" data-campo="razao_social"><span>Razão social</span><input name="razao_social" value="${esc(e.razao_social)}"></label>
        <div class="linha-2">
          <label class="campo" data-campo="cnpj"><span>CNPJ</span><input name="cnpj" value="${esc(e.cnpj)}"></label>
          <label class="campo"><span>Inscrição municipal</span><input name="inscricao_municipal" value="${esc(e.inscricao_municipal)}"></label>
        </div>
        <label class="campo"><span>Endereço</span><input name="endereco" value="${esc(e.endereco)}"></label>
        <div class="linha">
          <label class="campo"><span>Município</span><input name="municipio" value="${esc(e.municipio)}"></label>
          <label class="campo"><span>UF</span><input name="uf" value="${esc(e.uf)}" maxlength="2"></label>
          <label class="campo" data-campo="municipio_ibge"><span>Código IBGE do município</span><input name="municipio_ibge" value="${esc(e.municipio_ibge)}" inputmode="numeric" maxlength="7"></label>
        </div>
        <div class="linha-2">
          <label class="campo"><span>Telefone</span><input name="telefone" value="${esc(e.telefone)}"></label>
          <label class="campo"><span>E-mail</span><input name="email" value="${esc(e.email)}"></label>
        </div>
      </section>

      <section class="cartao"><h2>Configuração fiscal</h2>
        <p class="pequeno texto-2">⚠️ Confirme todos os códigos e regras com o seu contador antes de emitir em produção.</p>
        <label class="campo"><span>Regime tributário</span>${sel('regime_tributario', [['MEI', 'MEI'], ['SIMPLES', 'Simples Nacional'], ['NORMAL', 'Lucro Presumido / Real']], e.regime_tributario)}</label>
        <div class="linha-2">
          <label class="campo" data-campo="codigo_servico"><span>Código do serviço (LC 116)</span><input name="codigo_servico" value="${esc(e.codigo_servico)}"><small>Lava-car: provavelmente 14.01</small></label>
          <label class="campo" data-campo="codigo_tributacao"><span>Código de tributação nacional/municipal</span><input name="codigo_tributacao" value="${esc(e.codigo_tributacao)}"></label>
        </div>
        <div class="linha-2">
          <label class="campo" data-campo="aliquota_iss"><span>Alíquota ISS (%)</span><input name="aliquota_iss" value="${String(e.aliquota_iss).replace('.', ',')}" inputmode="decimal"><small>Não se aplica a MEI</small></label>
          <label class="campo"><span>CNAE (se exigido)</span><input name="cnae" value="${esc(e.cnae)}" inputmode="numeric"></label>
        </div>
        <label class="campo"><span>Desconto na nota</span>${sel('tratamento_desconto', [['LIQUIDO', 'Enviar valor líquido (já com desconto)'], ['INCONDICIONADO', 'Informar como desconto incondicionado']], e.tratamento_desconto)}</label>
      </section>

      <section class="cartao"><h2>Emissão de NFS-e</h2>
        <div class="linha-2">
          <label class="campo"><span>Provedor de NFS-e</span>${sel('provedor', e.provedores.map((p) => [p, p === 'simulado' ? 'Simulado (testes, sem valor fiscal)' : p]), e.provedor)}</label>
          <label class="campo" id="campo-modo"><span>Comportamento do simulador</span>${sel('modo', [['sucesso', 'Sempre autoriza'], ['processando', 'Processa em ~8 s'], ['timeout', 'Timeout (nota criada sem resposta)'], ['rejeicao', 'Rejeita'], ['indisponivel', 'Fora do ar'], ['aleatorio', 'Aleatório']], e.provedor_config?.modo || 'sucesso')}</label>
        </div>
        <label class="campo"><span>Ambiente</span>${sel('ambiente', [['HOMOLOGACAO', 'Homologação (testes)'], ['PRODUCAO', 'PRODUÇÃO (notas com valor fiscal)']], e.ambiente)}</label>
        <div class="linha-2">
          <label class="campo"><span>Série da DPS/RPS</span><input name="serie_dps" value="${esc(e.serie_dps)}"></label>
          <label class="campo" data-campo="proximo_numero_dps"><span>Próximo número da DPS</span><input name="proximo_numero_dps" value="${e.proximo_numero_dps}" inputmode="numeric"><small>Altere só com orientação do contador</small></label>
        </div>
        <div class="linha-2">
          <label class="campo"><span>Validade do certificado digital</span><input type="date" name="certificado_validade" value="${esc(e.certificado_validade)}"><small>Para alertas de vencimento</small></label>
          <label class="campo"><span>Prazo para cancelar nota (horas)</span><input name="prazo_cancelamento_horas" value="${e.prazo_cancelamento_horas}" inputmode="numeric"></label>
        </div>
        <label class="campo"><span>Alertar nota pendente após (horas)</span><input name="alerta_pendente_horas" value="${e.alerta_pendente_horas}" inputmode="numeric"></label>
        ${chk('emissao_automatica', e.emissao_automatica, 'Emitir NFS-e automaticamente ao finalizar o atendimento')}
        ${chk('permite_tomador_nao_identificado', e.permite_tomador_nao_identificado, 'Permitir nota sem CPF/CNPJ do cliente (consumidor não identificado)')}
        ${chk('exige_nome_pf', e.exige_nome_pf, 'Exigir nome do cliente pessoa física')}
        ${chk('exige_endereco_pj', e.exige_endereco_pj, 'Exigir endereço do cliente empresa (CNPJ)')}
        ${chk('atendente_cancela_nota', e.atendente_cancela_nota, 'Atendente pode cancelar nota')}
        <button type="button" class="btn mt" id="testar">Testar conexão com o provedor</button>
      </section>

      <section class="cartao"><h2>Formas de pagamento</h2>
        <p class="pequeno texto-2">Desmarque as que o estabelecimento não aceita.</p>
        ${Object.entries(FORMAS).map(([k, t]) => `<label class="check"><input type="checkbox" name="forma_${k}" ${e.formas_pagamento.includes(k) ? 'checked' : ''}> ${t}</label>`).join('')}
      </section>
    </div>
    <button class="btn btn-primario btn-grande" id="salvar-emp">Salvar configurações</button>
  </form>`;

  const f = $('#f-emp');
  const modo = () => { $('#campo-modo').hidden = f.provedor.value !== 'simulado'; };
  f.provedor.onchange = modo;
  modo();
  $('#testar').onclick = (ev) => comBotao(ev.currentTarget, async () => {
    const r = await api('/empresa/testar-conexao', { method: 'POST' });
    const faltas = r.faltas.length ? ` Falta configurar: ${r.faltas.join(', ')}.` : '';
    toast(`${r.mensagem}${faltas}`, r.ok && !r.faltas.length ? 'ok' : 'erro');
  });
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    if (d.ambiente === 'PRODUCAO' && e.ambiente !== 'PRODUCAO') {
      const ok = await confirmar('Mudar para PRODUÇÃO? A partir de agora as notas terão valor fiscal. Confirme que os testes em homologação foram feitos e que o contador validou a configuração.', { ok: 'Mudar para produção', perigo: true });
      if (!ok) return;
    }
    const corpo = {
      razao_social: d.razao_social, cnpj: d.cnpj, inscricao_municipal: d.inscricao_municipal, endereco: d.endereco, municipio: d.municipio, uf: d.uf,
      municipio_ibge: d.municipio_ibge, telefone: d.telefone, email: d.email, regime_tributario: d.regime_tributario, codigo_servico: d.codigo_servico,
      codigo_tributacao: d.codigo_tributacao, aliquota_iss: Number(String(d.aliquota_iss).replace(',', '.')) || 0, cnae: d.cnae,
      tratamento_desconto: d.tratamento_desconto, provedor: d.provedor, provedor_config: { ...(e.provedor_config || {}), modo: d.modo || 'sucesso' },
      ambiente: d.ambiente, serie_dps: d.serie_dps, proximo_numero_dps: Number(d.proximo_numero_dps), certificado_validade: d.certificado_validade,
      prazo_cancelamento_horas: Number(d.prazo_cancelamento_horas), alerta_pendente_horas: Number(d.alerta_pendente_horas),
      emissao_automatica: !!d.emissao_automatica, permite_tomador_nao_identificado: !!d.permite_tomador_nao_identificado,
      exige_nome_pf: !!d.exige_nome_pf, exige_endereco_pj: !!d.exige_endereco_pj, atendente_cancela_nota: !!d.atendente_cancela_nota,
      formas_pagamento: Object.keys(FORMAS).filter((k) => d[`forma_${k}`]),
    };
    if (corpo.proximo_numero_dps !== e.proximo_numero_dps) {
      const ok = await confirmar('Alterar a numeração da DPS pode causar rejeição ou duplicidade. Continuar?', { ok: 'Alterar numeração', perigo: true });
      if (!ok) return;
    }
    comBotao($('#salvar-emp'), async () => {
      try {
        await api('/empresa', { method: 'PUT', body: corpo });
        await carregarCatalogo(true);
        toast('Configurações salvas.');
        abaEmpresa(el);
      } catch (err) { erroCampo(el, err.campo, err.message); }
    });
  };
}

// ---------------------------------------------------------------------
async function abaServicos(el) {
  const [servicos, portes] = await Promise.all([api('/servicos'), api('/portes')]);
  const ativos = portes.filter((p) => p.ativo);
  let lista = servicos.map((s) => ({ ...s }));

  const render = () => {
    el.innerHTML = `<div class="cartao">
      <p class="texto-2 pequeno">Preencha o preço de cada serviço por porte. <b>Deixe vazio</b> quando o serviço não existir para aquele porte. Use as setas para ordenar os botões do atendimento.</p>
      <div class="tabela-wrap"><table class="grade-precos"><thead><tr><th>Serviço</th>${ativos.map((p) => `<th>${esc(p.nome)}</th>`).join('')}<th>Mesmo preço</th><th>Avulso</th><th>Ativo</th><th></th></tr></thead>
      <tbody>${lista.map((s, i) => `<tr data-i="${i}">
        <td><input data-campo-s="nome" value="${esc(s.nome)}" maxlength="80"></td>
        ${ativos.map((p) => `<td><input data-preco="${p.id}" value="${s.avulso ? '' : moedaInput(s.precos?.[p.id])}" inputmode="decimal" ${s.avulso ? 'disabled placeholder="na hora"' : 'placeholder="—"'}></td>`).join('')}
        <td><button type="button" class="btn btn-pequeno" data-replicar ${s.avulso ? 'disabled' : ''} title="Copia o primeiro preço preenchido para todos os portes">⇉</button></td>
        <td><input type="checkbox" data-campo-s="avulso" ${s.avulso ? 'checked' : ''}></td>
        <td><input type="checkbox" data-campo-s="ativo" ${s.ativo ? 'checked' : ''}></td>
        <td style="white-space:nowrap"><button type="button" class="btn btn-pequeno" data-subir ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button><button type="button" class="btn btn-pequeno" data-descer ${i === lista.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button></td>
      </tr>`).join('')}</tbody></table></div>
      <div class="chips mt"><button class="btn" id="novo-serv">+ Novo serviço</button><button class="btn btn-primario" id="salvar-serv">Salvar tabela</button></div>
    </div>`;
    ligar();
  };

  const ler = () => {
    $$('tr[data-i]', el).forEach((tr) => {
      const s = lista[Number(tr.dataset.i)];
      s.nome = $('[data-campo-s="nome"]', tr).value;
      s.avulso = $('[data-campo-s="avulso"]', tr).checked;
      s.ativo = $('[data-campo-s="ativo"]', tr).checked;
      s.precos = {};
      $$('[data-preco]', tr).forEach((inp) => { if (inp.value.trim() !== '') s.precos[inp.dataset.preco] = parseMoeda(inp.value); });
    });
  };

  const ligar = () => {
    $$('tr[data-i]', el).forEach((tr) => {
      const i = Number(tr.dataset.i);
      $('[data-replicar]', tr).onclick = () => {
        const primeiro = $$('[data-preco]', tr).find((x) => x.value.trim());
        if (!primeiro) return toast('Preencha um preço primeiro.', 'erro');
        $$('[data-preco]', tr).forEach((x) => { x.value = primeiro.value; });
      };
      $('[data-campo-s="avulso"]', tr).onchange = () => { ler(); render(); };
      $('[data-subir]', tr).onclick = () => { ler(); [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]]; render(); };
      $('[data-descer]', tr).onclick = () => { ler(); [lista[i + 1], lista[i]] = [lista[i], lista[i + 1]]; render(); };
    });
    $('#novo-serv').onclick = () => { ler(); lista.push({ nome: '', avulso: false, ativo: true, precos: {} }); render(); $$('[data-campo-s="nome"]', el).at(-1).focus(); };
    $('#salvar-serv').onclick = (ev) => comBotao(ev.currentTarget, async () => {
      ler();
      try {
        await api('/servicos', { method: 'PUT', body: lista });
        await carregarCatalogo(true);
        toast('Tabela de preços salva.');
        abaServicos(el);
      } catch (err) { toast(err.message, 'erro'); }
    });
  };
  render();
}

// ---------------------------------------------------------------------
async function abaPortes(el) {
  const portes = await api('/portes');
  el.innerHTML = `<div class="cartao"><p class="texto-2 pequeno">O porte define o preço. Use exemplos de modelos para o atendente escolher sem errar.</p>
    <div class="tabela-wrap"><table><thead><tr><th>Ordem</th><th>Nome</th><th>Exemplos</th><th>Ativo</th><th></th></tr></thead><tbody>
    ${portes.map((p) => `<tr data-id="${p.id}"><td><input name="ordem" value="${p.ordem}" inputmode="numeric" style="width:70px"></td><td><input name="nome" value="${esc(p.nome)}" maxlength="40"></td>
      <td><input name="exemplos" value="${esc(p.exemplos)}" maxlength="150"></td><td><input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}></td>
      <td><button class="btn btn-pequeno btn-primario" data-salvar>Salvar</button></td></tr>`).join('')}
    <tr data-id=""><td><input name="ordem" value="${portes.length + 1}" style="width:70px"></td><td><input name="nome" placeholder="Novo porte"></td><td><input name="exemplos" placeholder="Exemplos de modelos"></td>
      <td><input type="checkbox" name="ativo" checked></td><td><button class="btn btn-pequeno" data-salvar>Adicionar</button></td></tr>
    </tbody></table></div></div>`;
  $$('[data-salvar]', el).forEach((b) => (b.onclick = () => comBotao(b, async () => {
    const tr = b.closest('tr');
    const corpo = { nome: $('[name=nome]', tr).value, exemplos: $('[name=exemplos]', tr).value, ordem: Number($('[name=ordem]', tr).value), ativo: $('[name=ativo]', tr).checked };
    try {
      await api(tr.dataset.id ? `/portes/${tr.dataset.id}` : '/portes', { method: tr.dataset.id ? 'PUT' : 'POST', body: corpo });
      await carregarCatalogo(true);
      toast('Porte salvo.');
      abaPortes(el);
    } catch (err) { toast(err.message, 'erro'); }
  })));
}

// ---------------------------------------------------------------------
async function abaUsuarios(el) {
  const usuarios = await api('/usuarios');
  el.innerHTML = `<div class="cartao"><div class="cartao-titulo"><h2>Usuários</h2><button class="btn btn-primario" id="novo-u">+ Novo usuário</button></div>
    <p class="texto-2 pequeno"><b>Administrador:</b> acesso total. <b>Atendente:</b> atendimento, recebimento, clientes e emissão de nota (sem relatórios, configurações e cancelamentos de finalizados).</p>
    <div class="tabela-wrap"><table><thead><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Situação</th><th></th></tr></thead><tbody>
    ${usuarios.map((u) => `<tr><td>${esc(u.nome)}</td><td>${esc(u.login)}</td><td>${u.perfil === 'ADMIN' ? 'Administrador' : 'Atendente'}</td>
      <td>${u.ativo ? '<span class="selo selo-verde">Ativo</span>' : '<span class="selo selo-cinza">Inativo</span>'}</td>
      <td><button class="btn btn-pequeno" data-u="${u.id}">Editar</button></td></tr>`).join('')}</tbody></table></div></div>`;

  const form = (u) => {
    const m = modal(`<h2>${u ? 'Editar usuário' : 'Novo usuário'}</h2>
      <label class="campo" data-campo="nome"><span>Nome</span><input id="u-nome" value="${esc(u?.nome || '')}" autofocus></label>
      <label class="campo" data-campo="login"><span>Login</span><input id="u-login" value="${esc(u?.login || '')}" ${u ? 'disabled' : ''} autocapitalize="none"></label>
      <label class="campo" data-campo="senha"><span>${u ? 'Nova senha (deixe vazio para manter)' : 'Senha (mín. 6 caracteres)'}</span><input id="u-senha" type="password" autocomplete="new-password"></label>
      <label class="campo"><span>Perfil</span><select id="u-perfil"><option value="ATENDENTE">Atendente</option><option value="ADMIN" ${u?.perfil === 'ADMIN' ? 'selected' : ''}>Administrador</option></select></label>
      ${u ? `<label class="check"><input type="checkbox" id="u-ativo" ${u.ativo ? 'checked' : ''}> Ativo</label>` : ''}
      <div class="acoes-modal"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="u-ok">Salvar</button></div>`);
    $('#u-ok', m.el).onclick = (ev) => comBotao(ev.currentTarget, async () => {
      const corpo = { nome: $('#u-nome', m.el).value, login: $('#u-login', m.el).value, senha: $('#u-senha', m.el).value, perfil: $('#u-perfil', m.el).value,
        ativo: u ? $('#u-ativo', m.el).checked : true };
      try {
        await api(u ? `/usuarios/${u.id}` : '/usuarios', { method: u ? 'PUT' : 'POST', body: corpo });
        m.fechar();
        toast('Usuário salvo.');
        abaUsuarios(el);
      } catch (err) { erroCampo(m.el, err.campo, err.message); }
    });
  };
  $('#novo-u').onclick = () => form(null);
  $$('[data-u]', el).forEach((b) => (b.onclick = () => form(usuarios.find((u) => u.id === Number(b.dataset.u)))));
}

// ---------------------------------------------------------------------
async function abaAuditoria(el) {
  const log = await api('/auditoria');
  el.innerHTML = `<div class="cartao" style="padding:0"><div class="tabela-wrap"><table class="log"><thead><tr><th>Quando</th><th>Usuário</th><th>Onde</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>
    ${log.map((a) => `<tr><td>${dataHora(a.data_hora)}</td><td>${esc(a.usuario || 'sistema')}</td><td>${esc(a.entidade)}${a.entidade_id ? ` #${a.entidade_id}` : ''}</td>
    <td>${esc(a.acao)}</td><td>${esc(a.detalhe)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
