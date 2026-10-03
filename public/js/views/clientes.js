// Clientes e seus veículos (a tela de veículos foi incorporada aqui).
import { api } from '../api.js';
import { $, $$, esc, moeda, dataHora, data, formataPlaca, formataDoc, seloNota, modal, toast, comBotao, erroCampo, vazio } from '../ui.js';
import { ir, carregarCatalogo } from '../app.js';

export async function telaClientes(app) {
  app.innerHTML = `<div class="cartao-titulo"><h1 style="margin:0">Clientes</h1><a class="btn btn-primario" href="#/cliente/novo">+ Novo cliente</a></div>
    <div class="cartao"><input id="q" placeholder="Buscar por nome, telefone, CPF/CNPJ ou placa" autocomplete="off"></div>
    <div class="cartao" style="padding:0" id="res"></div>`;
  let t;
  const buscar = async () => {
    const lista = await api(`/clientes?q=${encodeURIComponent($('#q').value.trim())}`);
    $('#res').innerHTML = lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Nome</th><th>Telefone</th><th>CPF/CNPJ</th><th>Veículos</th><th>Último atendimento</th></tr></thead>
      <tbody>${lista.map((c) => `<tr class="clicavel" data-id="${c.id}"><td>${esc(c.nome || '(sem nome)')}</td><td>${esc(c.telefone)}</td><td>${esc(c.documento_mascarado)}</td>
      <td>${esc(c.placas || '')}</td><td>${data(c.ultimo_atendimento)}</td></tr>`).join('')}</tbody></table></div>` : vazio('Nenhum cliente encontrado.');
    $$('tr[data-id]').forEach((tr) => (tr.onclick = () => ir(`#/cliente/${tr.dataset.id}`)));
  };
  $('#q').oninput = () => { clearTimeout(t); t = setTimeout(buscar, 250); };
  $('#q').focus();
  await buscar();
}

export async function telaCliente(app, id) {
  const cat = await carregarCatalogo();
  const c = id ? await api(`/clientes/${id}`) : { nome: '', telefone: '', email: '', documento: '', inscricao_municipal: '', endereco: {}, veiculos: [], historico: [] };
  const e = c.endereco || {};
  app.innerHTML = `<div class="cab-atend"><a href="#/clientes" class="btn btn-fantasma btn-pequeno">← Clientes</a><h1>${id ? esc(c.nome || 'Cliente') : 'Novo cliente'}</h1></div>
    <div class="grade-2">
      <form class="cartao" id="f-cli">
        <h2>Dados</h2>
        <label class="campo" data-campo="nome"><span>Nome / razão social</span><input name="nome" value="${esc(c.nome)}" maxlength="150"></label>
        <div class="linha-2">
          <label class="campo"><span>Telefone (WhatsApp)</span><input name="telefone" value="${esc(c.telefone)}" inputmode="tel" maxlength="30"></label>
          <label class="campo" data-campo="documento"><span>CPF/CNPJ</span><input name="documento" value="${esc(formataDoc(c.documento))}" maxlength="18"></label>
        </div>
        <label class="campo"><span>E-mail</span><input name="email" type="email" value="${esc(c.email)}" maxlength="150"></label>
        <details ${Object.values(e).some(Boolean) || c.inscricao_municipal ? 'open' : ''}><summary>Endereço e dados fiscais (só se a nota exigir)</summary>
          <div class="linha">
            <label class="campo"><span>CEP</span><input name="cep" value="${esc(e.cep)}" maxlength="9"></label>
            <label class="campo"><span>UF</span><input name="uf" value="${esc(e.uf)}" maxlength="2"></label>
            <label class="campo"><span>Cidade</span><input name="cidade" value="${esc(e.cidade)}" maxlength="80"></label>
          </div>
          <div class="linha">
            <label class="campo"><span>Logradouro</span><input name="logradouro" value="${esc(e.logradouro)}" maxlength="150"></label>
            <label class="campo"><span>Número</span><input name="numero" value="${esc(e.numero)}" maxlength="20"></label>
            <label class="campo"><span>Bairro</span><input name="bairro" value="${esc(e.bairro)}" maxlength="80"></label>
          </div>
          <label class="campo"><span>Inscrição municipal</span><input name="inscricao_municipal" value="${esc(c.inscricao_municipal)}" maxlength="30"></label>
        </details>
        <button class="btn btn-primario mt" id="salvar">Salvar</button>
      </form>
      <div>
        ${id ? `<section class="cartao"><div class="cartao-titulo"><h2>Veículos</h2><button class="btn btn-pequeno" id="add-veic">+ Veículo</button></div>
          ${c.veiculos.length ? `<ul class="lista">${c.veiculos.map((v) => `<li><div class="item-lista"><span class="placa">${esc(formataPlaca(v.placa))}</span>
            <div class="principal"><div>${esc(v.modelo_cor || '—')}</div><div class="sub">${esc(v.porte_nome)}</div></div>
            <a class="btn btn-pequeno btn-sucesso" href="#/atendimento/novo?placa=${esc(v.placa)}">Atender</a>
            <button class="btn btn-pequeno" data-editar="${v.id}">Editar</button></div></li>`).join('')}</ul>` : '<p class="texto-2">Nenhum veículo vinculado.</p>'}
        </section>
        <section class="cartao"><h2>Histórico</h2>
          ${c.historico.length ? `<ul class="lista">${c.historico.map((h) => `<li><a class="item-lista" href="#/atendimento/${h.id}"><span class="placa">${esc(formataPlaca(h.placa))}</span>
            <div class="principal"><div>${esc(h.servicos)}</div><div class="sub">${dataHora(h.finalizado_em || h.aberto_em)}</div></div>
            <div class="valor">${moeda(h.total)}<div>${seloNota(h.nota_situacao, h.status)}</div></div></a></li>`).join('')}</ul>` : '<p class="texto-2">Sem atendimentos.</p>'}
        </section>` : ''}
      </div>
    </div>`;

  $('#f-cli').onsubmit = (ev) => {
    ev.preventDefault();
    comBotao($('#salvar'), async () => {
      const d = Object.fromEntries(new FormData(ev.target));
      const corpo = { nome: d.nome, telefone: d.telefone, email: d.email, documento: d.documento, inscricao_municipal: d.inscricao_municipal,
        endereco: { cep: d.cep, uf: d.uf, cidade: d.cidade, logradouro: d.logradouro, numero: d.numero, bairro: d.bairro } };
      try {
        const r = await api(id ? `/clientes/${id}` : '/clientes', { method: id ? 'PUT' : 'POST', body: corpo });
        toast('Cliente salvo.');
        ir(`#/cliente/${r.id}`);
      } catch (err) { erroCampo(app, err.campo, err.message); }
    });
  };

  const formVeiculo = (v) => {
    const m = modal(`<h2>${v ? 'Editar veículo' : 'Novo veículo'}</h2>
      <label class="campo" data-campo="placa"><span>Placa</span><input id="v-placa" value="${esc(v?.placa || '')}" maxlength="8" autofocus></label>
      <label class="campo" data-campo="porte"><span>Porte</span><select id="v-porte">${cat.portes.map((p) => `<option value="${p.id}" ${v?.porte_id === p.id ? 'selected' : ''}>${esc(p.nome)} — ${esc(p.exemplos)}</option>`).join('')}</select></label>
      <label class="campo"><span>Modelo / cor</span><input id="v-modelo" value="${esc(v?.modelo_cor || '')}" maxlength="80"></label>
      ${v ? '<label class="check"><input type="checkbox" id="v-desvincular"> Desvincular deste cliente</label>' : ''}
      <div class="acoes-modal"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="v-ok">Salvar</button></div>`);
    $('#v-ok', m.el).onclick = (ev) => comBotao(ev.currentTarget, async () => {
      const corpo = { placa: $('#v-placa', m.el).value, porte_id: Number($('#v-porte', m.el).value), modelo_cor: $('#v-modelo', m.el).value,
        cliente_id: v && $('#v-desvincular', m.el).checked ? null : id };
      try {
        await api(v ? `/veiculos/${v.id}` : '/veiculos', { method: v ? 'PUT' : 'POST', body: corpo });
        m.fechar();
        ir(location.hash);
      } catch (err) { erroCampo(m.el, err.campo, err.message); }
    });
  };
  $('#add-veic') && ($('#add-veic').onclick = () => formVeiculo(null));
  $$('[data-editar]').forEach((b) => (b.onclick = () => formVeiculo(c.veiculos.find((v) => v.id === Number(b.dataset.editar)))));
}
