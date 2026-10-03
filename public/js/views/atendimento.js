// Tela de atendimento: abrir/editar, receber, emitir NFS-e e acompanhar a nota.
import { api, baixar } from '../api.js';
import {
  $, $$, esc, moeda, parseMoeda, moedaInput, dataHora, formataPlaca, formataDoc, seloNota, seloStatus,
  modal, confirmar, toast, comBotao, erroCampo, FORMAS, SITUACAO_NOTA,
} from '../ui.js';
import { estado, ehAdmin, ir, carregarCatalogo } from '../app.js';

const placaOk = (p) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p);
const docLimpo = (d) => String(d || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ATIVAS = ['PENDENTE', 'PROCESSANDO', 'AUTORIZADA', 'CANCELANDO'];
let timerAtualizacao = null;

export async function telaAtendimento(app, id, params) {
  clearTimeout(timerAtualizacao);
  const cat = await carregarCatalogo();
  if (id) {
    const a = await api(`/atendimentos/${id}`);
    if (a.status === 'ABERTO') return editor(app, cat, a, null);
    return visualizar(app, a);
  }
  const placa = docLimpo(params.get('placa'));
  if (!placaOk(placa)) return pedirPlaca(app, placa);
  const r = await api(`/veiculos/placa/${placa}`);
  if (r.veiculo?.atendimento_aberto) {
    toast('Este veículo já está no pátio. Abrindo o atendimento.', 'info');
    return ir(`#/atendimento/${r.veiculo.atendimento_aberto}`);
  }
  return editor(app, cat, null, r.veiculo ? r.veiculo : { placa, novo: true });
}

function pedirPlaca(app, inicial) {
  app.innerHTML = `<h1>Novo atendimento</h1><form class="cartao" id="f-placa">
    <div class="busca-placa"><input id="placa" value="${esc(inicial)}" placeholder="PLACA" maxlength="8" autocomplete="off" autocapitalize="characters"><button class="btn btn-primario">Continuar</button></div>
    <p class="texto-2 pequeno" id="placa-msg">Formato ABC1234 ou ABC1D23.</p></form>`;
  $('#placa').focus();
  $('#f-placa').onsubmit = (e) => {
    e.preventDefault();
    const p = docLimpo($('#placa').value);
    if (!placaOk(p)) { $('#placa-msg').innerHTML = '<b style="color:var(--vermelho)">Placa inválida.</b> Use ABC1234 ou ABC1D23.'; return; }
    ir(`#/atendimento/novo?placa=${p}`);
  };
}

// ======================================================================
// Editor (novo ou ABERTO)
// ======================================================================
function editor(app, cat, atend, veiculo) {
  const st = atend ? {
    id: atend.id, placa: atend.placa, novo: false, porte_id: atend.porte_id, modelo_cor: atend.modelo_cor,
    cliente: atend.cliente_id ? { id: atend.cliente_id, nome: atend.cliente_nome, telefone: atend.cliente_telefone } : null,
    itens: atend.itens.map((i) => ({ id: i.id, servico_id: i.servico_id, descricao: i.descricao, valor: i.valor, avulso: !!i.avulso })),
    desconto_tipo: atend.desconto_tipo, desconto_informado: atend.desconto_informado, observacao: atend.observacao,
    ultimos: [], historico: [], aberto_em: atend.aberto_em, porteOriginal: atend.porte_id,
  } : {
    id: null, placa: veiculo.placa, novo: !!veiculo.novo, porte_id: veiculo.porte_id || null, modelo_cor: veiculo.modelo_cor || '',
    cliente: veiculo.cliente || null, itens: [], desconto_tipo: 'VALOR', desconto_informado: 0, observacao: '',
    ultimos: veiculo.ultimos_itens || [], historico: veiculo.historico || [],
  };

  const servicosNormais = () => cat.servicos.filter((s) => !s.avulso && st.porte_id && s.precos[st.porte_id] !== undefined);
  const avulso = cat.servicos.find((s) => s.avulso);
  const subtotal = () => st.itens.reduce((t, i) => t + i.valor, 0);
  const desconto = () => {
    const sub = subtotal();
    const d = st.desconto_tipo === 'PERCENTUAL' ? Math.round((sub * Math.min(Number(st.desconto_informado) || 0, 100)) / 100) : Math.round(Number(st.desconto_informado) || 0);
    return Math.min(d, sub);
  };
  const total = () => subtotal() - desconto();

  function repreçar() {
    st.itens = st.itens.filter((i) => i.avulso || cat.servicos.find((s) => s.id === i.servico_id)?.precos[st.porte_id] !== undefined)
      .map((i) => (i.avulso ? i : { ...i, valor: cat.servicos.find((s) => s.id === i.servico_id).precos[st.porte_id] }));
  }

  function render() {
    const porte = cat.portes.find((p) => p.id === st.porte_id);
    app.innerHTML = `
      <div class="cab-atend">
        <a href="#/" class="btn btn-fantasma btn-pequeno">← Início</a>
        <span class="placa placa-grande">${esc(formataPlaca(st.placa))}</span>
        ${st.id ? `<span class="texto-2">Atendimento #${st.id} · aberto ${dataHora(st.aberto_em)}</span>` : st.novo ? '<span class="selo selo-azul">Veículo novo</span>' : ''}
      </div>
      <div class="atend">
        <div>
          <section class="cartao" data-campo="porte">
            <h3>Porte do veículo</h3>
            <div class="opcoes">${cat.portes.map((p) => `<button class="opcao ${p.id === st.porte_id ? 'sel' : ''}" data-porte="${p.id}" title="${esc(p.exemplos)}">${esc(p.nome)}<small>${esc(p.exemplos)}</small></button>`).join('')}</div>
            <label class="campo mt"><span>Modelo / cor (opcional)</span><input id="modelo" value="${esc(st.modelo_cor)}" placeholder="Ex.: Virtus prata" maxlength="80"></label>
          </section>

          <section class="cartao" data-campo="servicos">
            <div class="cartao-titulo"><h3>Serviços ${porte ? `· ${esc(porte.nome)}` : ''}</h3>
              ${st.ultimos.length && !st.id ? `<button class="btn btn-pequeno" id="repetir">↻ Repetir último (${esc(st.ultimos.map((u) => u.descricao).join(' + '))})</button>` : ''}</div>
            ${st.porte_id ? `<div class="servicos">
              ${servicosNormais().map((s) => {
                const sel = st.itens.some((i) => i.servico_id === s.id);
                return `<button class="servico ${sel ? 'sel' : ''}" data-servico="${s.id}"><span>${esc(s.nome)}</span><b>${moeda(s.precos[st.porte_id])}</b></button>`;
              }).join('')}
              ${avulso ? `<button class="servico" id="btn-avulso"><span>${esc(avulso.nome)}</span><b>+ valor</b></button>` : ''}
            </div>` : '<p class="texto-2">Escolha o porte para ver os serviços e preços.</p>'}
          </section>

          <section class="cartao">
            <h3>Cliente</h3>
            ${st.cliente ? `<div class="cliente-chip"><span>👤</span><div class="principal"><b>${esc(st.cliente.nome || 'Cliente sem nome')}</b>
              <div class="texto-2 pequeno">${esc([st.cliente.telefone, st.cliente.documento ? formataDoc(st.cliente.documento) : ''].filter(Boolean).join(' · '))}</div></div>
              <button class="btn btn-pequeno" id="trocar-cliente">Trocar</button><button class="btn btn-pequeno btn-fantasma" id="remover-cliente" aria-label="Remover cliente">✕</button></div>`
              : `<button class="btn" id="trocar-cliente">+ Identificar cliente (opcional)</button>`}
            <label class="campo mt"><span>Observação (opcional)</span><input id="obs" value="${esc(st.observacao)}" maxlength="500" placeholder="Ex.: risco na porta traseira"></label>
          </section>

          ${st.historico.length ? `<section class="cartao"><h3>Últimos atendimentos deste veículo</h3><ul class="lista">
            ${st.historico.map((h) => `<li><a class="item-lista" href="#/atendimento/${h.id}"><div class="principal"><div>${esc(h.servicos)}</div>
            <div class="sub">${dataHora(h.finalizado_em || h.aberto_em)} · ${esc(h.cliente_nome || '')}</div></div><div class="valor">${moeda(h.total)}<div>${seloNota(h.nota_situacao, h.status)}</div></div></a></li>`).join('')}
          </ul></section>` : ''}
        </div>

        <aside class="atend-lateral">
          <section class="cartao">
            <h3>Resumo</h3>
            ${st.itens.length ? `<ul class="itens">${st.itens.map((i, idx) => `<li><span>${esc(i.descricao)}</span><span>${moeda(i.valor)}</span>
              <button class="remover" data-remover="${idx}" aria-label="Remover ${esc(i.descricao)}">×</button></li>`).join('')}</ul>`
              : '<p class="texto-2">Nenhum serviço selecionado.</p>'}
            <div class="total-linha"><span>Subtotal</span><span>${moeda(subtotal())}</span></div>
            <div class="campo" data-campo="desconto" style="margin:8px 0">
              <span>Desconto</span>
              <div class="desconto-grupo">
                <input id="desconto" inputmode="decimal" placeholder="0" value="${st.desconto_informado ? (st.desconto_tipo === 'PERCENTUAL' ? String(st.desconto_informado).replace('.', ',') : moedaInput(st.desconto_informado)) : ''}">
                <button class="opcao ${st.desconto_tipo === 'VALOR' ? 'sel' : ''}" data-dtipo="VALOR">R$</button>
                <button class="opcao ${st.desconto_tipo === 'PERCENTUAL' ? 'sel' : ''}" data-dtipo="PERCENTUAL">%</button>
              </div>
            </div>
            ${desconto() ? `<div class="total-linha"><span>Desconto</span><span>− ${moeda(desconto())}</span></div>` : ''}
            <div class="total-grande"><span>Total</span><span id="total">${moeda(total())}</span></div>
            <button class="btn btn-sucesso btn-grande btn-bloco" id="receber" ${st.itens.length ? '' : 'disabled'}>Receber ${moeda(total())}</button>
            <button class="btn btn-bloco mt" id="salvar">${st.id ? 'Salvar alterações' : 'Salvar no pátio'}</button>
            ${st.id ? '<button class="btn btn-fantasma btn-bloco mt" id="cancelar-atend" style="color:var(--vermelho)">Cancelar atendimento</button>' : ''}
          </section>
        </aside>
      </div>`;
    ligar();
  }

  function lerCampos() {
    st.modelo_cor = $('#modelo')?.value ?? st.modelo_cor;
    st.observacao = $('#obs')?.value ?? st.observacao;
    const dv = $('#desconto')?.value ?? '';
    st.desconto_informado = st.desconto_tipo === 'PERCENTUAL' ? Number(dv.replace(',', '.')) || 0 : parseMoeda(dv);
  }

  function ligar() {
    $$('[data-porte]').forEach((b) => (b.onclick = () => {
      lerCampos();
      st.porte_id = Number(b.dataset.porte);
      repreçar();
      render();
    }));
    $$('[data-servico]').forEach((b) => (b.onclick = () => {
      lerCampos();
      const sid = Number(b.dataset.servico);
      const idx = st.itens.findIndex((i) => i.servico_id === sid);
      if (idx >= 0) st.itens.splice(idx, 1);
      else {
        const s = cat.servicos.find((x) => x.id === sid);
        st.itens.push({ servico_id: sid, descricao: s.nome, valor: s.precos[st.porte_id], avulso: false });
      }
      render();
    }));
    $$('[data-remover]').forEach((b) => (b.onclick = () => { lerCampos(); st.itens.splice(Number(b.dataset.remover), 1); render(); }));
    $$('[data-dtipo]').forEach((b) => (b.onclick = () => {
      lerCampos();
      const antes = st.desconto_tipo;
      st.desconto_tipo = b.dataset.dtipo;
      if (antes !== st.desconto_tipo) st.desconto_informado = 0;
      render();
      $('#desconto').focus();
    }));
    $('#desconto').oninput = () => {
      lerCampos();
      $('#total').textContent = moeda(total());
      $('#receber').textContent = `Receber ${moeda(total())}`;
    };
    $('#desconto').onchange = () => { lerCampos(); render(); };
    $('#repetir') && ($('#repetir').onclick = () => {
      lerCampos();
      if (!st.porte_id) return erroCampo(app, 'porte', 'Escolha o porte primeiro.');
      for (const u of st.ultimos) {
        const s = cat.servicos.find((x) => x.id === u.servico_id);
        if (s && s.precos[st.porte_id] !== undefined && !st.itens.some((i) => i.servico_id === s.id)) {
          st.itens.push({ servico_id: s.id, descricao: s.nome, valor: s.precos[st.porte_id], avulso: false });
        }
      }
      render();
    });
    $('#btn-avulso') && ($('#btn-avulso').onclick = () => {
      lerCampos();
      const m = modal(`<h2>Serviço avulso</h2>
        <label class="campo"><span>Descrição</span><input id="av-desc" autofocus maxlength="120" placeholder="Ex.: Remoção de piche"></label>
        <label class="campo"><span>Valor (R$)</span><input id="av-valor" inputmode="decimal" placeholder="0,00"></label>
        <div class="acoes-modal"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="av-ok">Adicionar</button></div>`);
      $('#av-ok', m.el).onclick = () => {
        const descricao = $('#av-desc', m.el).value.trim();
        const valor = parseMoeda($('#av-valor', m.el).value);
        if (!descricao) return toast('Descreva o serviço.', 'erro');
        if (!(valor > 0)) return toast('Informe o valor.', 'erro');
        st.itens.push({ servico_id: avulso.id, descricao, valor, avulso: true });
        m.fechar();
        render();
      };
    });
    $('#trocar-cliente').onclick = () => { lerCampos(); escolherCliente((c) => { st.cliente = c; render(); }); };
    $('#remover-cliente') && ($('#remover-cliente').onclick = () => { lerCampos(); st.cliente = null; render(); });
    $('#salvar').onclick = (e) => comBotao(e.currentTarget, async () => {
      const a = await salvar();
      if (a) { toast(`Atendimento #${a.id} salvo no pátio.`); ir('#/'); }
    });
    $('#receber').onclick = (e) => comBotao(e.currentTarget, async () => {
      const a = await salvar();
      if (a) {
        st.id = a.id;
        if (location.hash !== `#/atendimento/${a.id}`) history.replaceState(null, '', `#/atendimento/${a.id}`);
        receber(a, st.cliente);
      }
    });
    $('#cancelar-atend') && ($('#cancelar-atend').onclick = () => cancelarAtendimento(st.id));
  }

  async function salvar() {
    lerCampos();
    if (!st.porte_id) { erroCampo(app, 'porte', 'Escolha o porte do veículo.'); return null; }
    const corpo = {
      placa: st.placa, porte_id: st.porte_id, modelo_cor: st.modelo_cor, cliente_id: st.cliente?.id || null,
      itens: st.itens.map((i) => ({ id: i.id, servico_id: i.servico_id, descricao: i.descricao, valor: i.valor })),
      desconto_tipo: st.desconto_tipo, desconto_informado: st.desconto_informado, observacao: st.observacao,
    };
    try {
      const a = await api(st.id ? `/atendimentos/${st.id}` : '/atendimentos', { method: st.id ? 'PUT' : 'POST', body: corpo });
      st.id = a.id;
      st.itens = a.itens.map((i) => ({ id: i.id, servico_id: i.servico_id, descricao: i.descricao, valor: i.valor, avulso: !!i.avulso }));
      return a;
    } catch (err) {
      erroCampo(app, err.campo === 'avulso' ? 'servicos' : err.campo, err.message);
      return null;
    }
  }

  render();
}

// ----------------------------------------------------------------------
// Seleção / cadastro rápido de cliente
// ----------------------------------------------------------------------
function escolherCliente(aoEscolher) {
  const m = modal(`<h2>Identificar cliente</h2>
    <label class="campo"><span>Buscar por nome, telefone ou CPF/CNPJ</span><input id="cl-q" autofocus autocomplete="off"></label>
    <ul class="lista" id="cl-res"></ul>
    <hr class="sep"><h3>Ou cadastre rapidamente</h3>
    <label class="campo" data-campo="nome"><span>Nome / razão social</span><input id="cl-nome" maxlength="150"></label>
    <div class="linha-2">
      <label class="campo"><span>Telefone (WhatsApp)</span><input id="cl-tel" inputmode="tel" maxlength="30"></label>
      <label class="campo" data-campo="documento"><span>CPF/CNPJ (opcional)</span><input id="cl-doc" maxlength="18"></label>
    </div>
    <div class="acoes-modal"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="cl-ok">Cadastrar e usar</button></div>`);
  let t;
  $('#cl-q', m.el).oninput = (e) => {
    clearTimeout(t);
    const q = e.target.value.trim();
    t = setTimeout(async () => {
      if (q.length < 2) { $('#cl-res', m.el).innerHTML = ''; return; }
      const lista = await api(`/clientes?q=${encodeURIComponent(q)}`);
      $('#cl-res', m.el).innerHTML = lista.slice(0, 15).map((c) => `<li><a class="item-lista" data-id="${c.id}"><span>👤</span>
        <div class="principal"><div>${esc(c.nome || '(sem nome)')}</div><div class="sub">${esc([c.telefone, c.documento_mascarado, c.placas].filter(Boolean).join(' · '))}</div></div></a></li>`).join('')
        || '<li class="texto-2 pequeno" style="padding:8px">Nenhum cliente encontrado.</li>';
      $$('[data-id]', m.el).forEach((a) => (a.onclick = async () => {
        const c = await api(`/clientes/${a.dataset.id}`);
        m.fechar();
        aoEscolher(c);
      }));
    }, 250);
  };
  $('#cl-ok', m.el).onclick = (e) => comBotao(e.currentTarget, async () => {
    try {
      const c = await api('/clientes', { method: 'POST', body: { nome: $('#cl-nome', m.el).value, telefone: $('#cl-tel', m.el).value, documento: $('#cl-doc', m.el).value } });
      m.fechar();
      aoEscolher(c);
    } catch (err) { erroCampo(m.el, err.campo, err.message); }
  });
}

// ----------------------------------------------------------------------
// Campos do tomador (usados no recebimento e na correção)
// ----------------------------------------------------------------------
function camposTomador(t, cat) {
  const e = t.endereco || {};
  return `
    <label class="campo" data-campo="documento"><span>CPF/CNPJ na nota ${cat.empresa.permite_tomador_nao_identificado ? '(deixe vazio se o cliente não quiser)' : ''}</span>
      <input id="t-doc" inputmode="text" maxlength="18" value="${esc(formataDoc(t.documento))}" placeholder="Somente números"></label>
    <div id="t-extra">
      <label class="campo" data-campo="nome" id="t-nome-campo"><span>Nome / razão social</span><input id="t-nome" maxlength="150" value="${esc(t.nome)}"></label>
      <div class="linha-2">
        <label class="campo"><span>E-mail para envio (opcional)</span><input id="t-email" type="email" maxlength="150" value="${esc(t.email)}"></label>
        <label class="campo"><span>Telefone (opcional)</span><input id="t-tel" inputmode="tel" maxlength="30" value="${esc(t.telefone)}"></label>
      </div>
      <div id="t-end" data-campo="endereco">
        <h3 class="mt">Endereço da empresa</h3>
        <div class="linha">
          <label class="campo"><span>CEP</span><input id="t-cep" inputmode="numeric" maxlength="9" value="${esc(e.cep)}"></label>
          <label class="campo"><span>UF</span><input id="t-uf" maxlength="2" value="${esc(e.uf)}"></label>
          <label class="campo"><span>Cidade</span><input id="t-cidade" maxlength="80" value="${esc(e.cidade)}"></label>
        </div>
        <div class="linha">
          <label class="campo"><span>Logradouro</span><input id="t-log" maxlength="150" value="${esc(e.logradouro)}"></label>
          <label class="campo"><span>Número</span><input id="t-num" maxlength="20" value="${esc(e.numero)}"></label>
          <label class="campo"><span>Bairro</span><input id="t-bairro" maxlength="80" value="${esc(e.bairro)}"></label>
        </div>
      </div>
    </div>`;
}

function ligarTomador(raiz, cat) {
  const atualizar = () => {
    const d = docLimpo($('#t-doc', raiz).value);
    const pj = d.length === 14;
    const pf = d.length === 11;
    $('#t-nome-campo', raiz).hidden = !(pj || pf || $('#t-nome', raiz).value);
    $('#t-nome-campo span', raiz).textContent = pj ? 'Razão social (obrigatório)' : cat.empresa.exige_nome_pf ? 'Nome (obrigatório)' : 'Nome (opcional)';
    $('#t-end', raiz).hidden = !(pj && cat.empresa.exige_endereco_pj);
  };
  $('#t-doc', raiz).oninput = atualizar;
  $('#t-doc', raiz).onblur = () => { $('#t-doc', raiz).value = formataDoc($('#t-doc', raiz).value); };
  $('#t-cep', raiz).onblur = async () => {
    const cep = $('#t-cep', raiz).value.replace(/\D/g, '');
    if (cep.length !== 8 || $('#t-log', raiz).value) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json());
      if (r.erro) return;
      $('#t-log', raiz).value = r.logradouro || '';
      $('#t-bairro', raiz).value = r.bairro || '';
      $('#t-cidade', raiz).value = r.localidade || '';
      $('#t-uf', raiz).value = r.uf || '';
      $('#t-num', raiz).focus();
    } catch { /* sem internet: preenchimento manual */ }
  };
  atualizar();
}

function lerTomador(raiz) {
  return {
    documento: docLimpo($('#t-doc', raiz).value), nome: $('#t-nome', raiz).value.trim(), email: $('#t-email', raiz).value.trim(), telefone: $('#t-tel', raiz).value.trim(),
    endereco: { cep: $('#t-cep', raiz).value, uf: $('#t-uf', raiz).value, cidade: $('#t-cidade', raiz).value, logradouro: $('#t-log', raiz).value, numero: $('#t-num', raiz).value, bairro: $('#t-bairro', raiz).value },
  };
}

// ----------------------------------------------------------------------
// Recebimento
// ----------------------------------------------------------------------
function receber(a, cliente) {
  const cat = estado.catalogo;
  const t = {
    documento: a.tomador_documento || cliente?.documento || '', nome: a.tomador_nome || cliente?.nome || '',
    email: a.tomador_email || cliente?.email || '', telefone: a.tomador_telefone || cliente?.telefone || '',
    endereco: Object.values(a.tomador_endereco || {}).some(Boolean) ? a.tomador_endereco : cliente?.endereco || {},
  };
  const st = { forma: cat.formas.length === 1 ? cat.formas[0].id : null, dividir: false, linhas: [], emitir: cat.empresa.emissao_automatica };
  const m = modal(`<div id="rec"></div>`, { onFechar: () => ir(location.hash) });

  function render() {
    const restante = a.total - st.linhas.reduce((s, l) => s + l.valor, 0);
    $('#rec', m.el).innerHTML = `
      <h2>Receber · <span class="placa">${esc(formataPlaca(a.placa))}</span></h2>
      <div class="total-grande"><span>Total</span><span>${moeda(a.total)}</span></div>
      ${a.total > 0 ? (!st.dividir ? `
        <div data-campo="pagamento"><div class="formas opcoes">${cat.formas.map((f) => `<button class="opcao ${st.forma === f.id ? 'sel' : ''}" data-forma="${f.id}">${esc(f.nome)}</button>`).join('')}</div></div>
        ${st.forma === 'DINHEIRO' ? `<div class="linha-2 mt"><label class="campo"><span>Valor recebido (opcional)</span><input id="recebido" inputmode="decimal" placeholder="${moedaInput(a.total)}"></label>
          <div class="campo"><span>Troco</span><div class="troco" id="troco">—</div></div></div>` : ''}
        <button class="btn btn-fantasma btn-pequeno mt" id="dividir">Dividir em mais de uma forma</button>`
      : `<div data-campo="pagamento">${st.linhas.map((l, i) => `<div class="pag-linha">
            <select data-lforma="${i}">${cat.formas.map((f) => `<option value="${f.id}" ${l.forma === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select>
            <input data-lvalor="${i}" inputmode="decimal" value="${moedaInput(l.valor)}"><button class="btn btn-pequeno" data-lrem="${i}" aria-label="Remover">×</button></div>`).join('')}
          <div class="chips"><button class="btn btn-pequeno" id="add-linha">+ forma</button>
          <span class="${restante === 0 ? 'texto-2' : ''}" style="${restante !== 0 ? 'color:var(--vermelho);font-weight:700' : ''}">${restante === 0 ? 'Valores conferem ✓' : `Falta distribuir ${moeda(restante)}`}</span>
          <button class="btn btn-fantasma btn-pequeno" id="nao-dividir">Usar uma forma só</button></div></div>`)
      : '<p class="texto-2">Atendimento sem valor: nenhum pagamento necessário.</p>'}
      <hr class="sep">
      ${a.total > 0 ? `<label class="check"><input type="checkbox" id="emitir" ${st.emitir ? 'checked' : ''}> Emitir NFS-e</label>` : ''}
      <div id="dados-nota" ${st.emitir && a.total > 0 ? '' : 'hidden'}>${camposTomador(t, cat)}</div>
      <button class="btn btn-sucesso btn-grande btn-bloco mt" id="finalizar">${st.emitir && a.total > 0 ? 'FINALIZAR E EMITIR NFS-e' : 'FINALIZAR'}</button>`;
    ligarRec();
  }

  function salvarTomadorLocal() {
    if ($('#t-doc', m.el)) Object.assign(t, lerTomador(m.el));
  }

  function ligarRec() {
    if ($('#t-doc', m.el)) ligarTomador(m.el, cat);
    $$('[data-forma]', m.el).forEach((b) => (b.onclick = () => { salvarTomadorLocal(); st.forma = b.dataset.forma; render(); if (st.forma === 'DINHEIRO') $('#recebido', m.el)?.focus(); }));
    $('#recebido', m.el) && ($('#recebido', m.el).oninput = (e) => {
      const r = parseMoeda(e.target.value);
      $('#troco', m.el).textContent = r ? (r >= a.total ? moeda(r - a.total) : 'Valor menor que o total') : '—';
    });
    $('#dividir', m.el) && ($('#dividir', m.el).onclick = () => {
      salvarTomadorLocal();
      st.dividir = true;
      st.linhas = [{ forma: st.forma || cat.formas[0].id, valor: a.total }, { forma: cat.formas.find((f) => f.id !== (st.forma || cat.formas[0].id))?.id || cat.formas[0].id, valor: 0 }];
      render();
    });
    $('#nao-dividir', m.el) && ($('#nao-dividir', m.el).onclick = () => { salvarTomadorLocal(); st.dividir = false; st.linhas = []; render(); });
    $('#add-linha', m.el) && ($('#add-linha', m.el).onclick = () => { salvarTomadorLocal(); st.linhas.push({ forma: cat.formas[0].id, valor: 0 }); render(); });
    $$('[data-lforma]', m.el).forEach((s) => (s.onchange = () => { st.linhas[s.dataset.lforma].forma = s.value; }));
    $$('[data-lvalor]', m.el).forEach((i) => (i.onchange = () => { salvarTomadorLocal(); st.linhas[i.dataset.lvalor].valor = parseMoeda(i.value); render(); }));
    $$('[data-lrem]', m.el).forEach((b) => (b.onclick = () => { salvarTomadorLocal(); st.linhas.splice(Number(b.dataset.lrem), 1); render(); }));
    $('#emitir', m.el) && ($('#emitir', m.el).onchange = (e) => { salvarTomadorLocal(); st.emitir = e.target.checked; render(); });
    $('#finalizar', m.el).onclick = (e) => comBotao(e.currentTarget, finalizar);
  }

  async function finalizar() {
    salvarTomadorLocal();
    let pagamentos = [];
    if (a.total > 0) {
      if (st.dividir) {
        $$('[data-lvalor]', m.el).forEach((i) => { st.linhas[i.dataset.lvalor].valor = parseMoeda(i.value); });
        pagamentos = st.linhas.filter((l) => l.valor > 0);
      } else {
        if (!st.forma) return erroCampo(m.el, 'pagamento', 'Escolha a forma de pagamento.');
        const recebido = st.forma === 'DINHEIRO' ? parseMoeda($('#recebido', m.el)?.value) : 0;
        pagamentos = [{ forma: st.forma, valor: a.total, valor_recebido: recebido || undefined }];
      }
    }
    try {
      const r = await api(`/atendimentos/${a.id}/finalizar`, {
        method: 'POST', body: { pagamentos, emitir_nota: st.emitir && a.total > 0, tomador: st.emitir ? t : { documento: '', nome: t.nome, email: t.email, telefone: t.telefone } },
      });
      mostrarResultado(m, r.atendimento, r.nota, r.aviso);
    } catch (err) {
      if (err.status === 409) { m.fechar(); return; }
      erroCampo(m.el, err.campo, err.message);
    }
  }

  render();
}

// ----------------------------------------------------------------------
// Resultado da emissão
// ----------------------------------------------------------------------
function linkNota(n) {
  return `${location.origin}/nota/${n.token_publico}`;
}

function linkWhatsapp(a, n) {
  const tel = String(a.tomador_telefone || a.cliente_telefone || '').replace(/\D/g, '');
  const destino = tel.length >= 10 ? (tel.length <= 11 ? `55${tel}` : tel) : '';
  const texto = `Olá! Segue a nota fiscal do serviço realizado no veículo ${formataPlaca(a.placa)} (${moeda(a.total)}):\n${linkNota(n)}\n\n${estado.catalogo.empresa.razao_social}`;
  return `https://wa.me/${destino}?text=${encodeURIComponent(texto)}`;
}

function linkEmail(a, n) {
  const assunto = `NFS-e ${n.numero_nfse} — ${estado.catalogo.empresa.razao_social}`;
  const corpo = `Olá,\n\nSegue a nota fiscal do serviço realizado no veículo ${formataPlaca(a.placa)} (${moeda(a.total)}):\n${linkNota(n)}\n\nObrigado!`;
  return `mailto:${encodeURIComponent(a.tomador_email || '')}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

function botoesNotaAutorizada(a, n) {
  return `<a class="btn btn-primario" href="${linkNota(n)}" target="_blank" rel="noopener">🖨️ Imprimir / ver</a>
    <a class="btn btn-sucesso" href="${linkWhatsapp(a, n)}" target="_blank" rel="noopener">💬 WhatsApp</a>
    <a class="btn" href="${linkEmail(a, n)}">✉️ E-mail</a>`;
}

function mostrarResultado(m, a, n, aviso) {
  let html;
  if (n?.situacao === 'AUTORIZADA') {
    html = `<div class="resultado"><div class="icone">✅</div><h2>NFS-e nº ${esc(n.numero_nfse)} emitida</h2>
      <p>Atendimento #${a.id} finalizado · ${moeda(a.total)}</p>
      <div class="resultado-acoes">${botoesNotaAutorizada(a, n)}</div></div>`;
  } else if (n && ['PENDENTE', 'PROCESSANDO'].includes(n.situacao)) {
    html = `<div class="resultado"><div class="icone">⏳</div><h2>Atendimento finalizado</h2>
      <p>A nota está sendo processada. <b>Pode liberar o cliente.</b> Ela será emitida automaticamente e aparecerá em “Notas com pendência” até concluir.</p>
      ${n.motivo ? `<p class="motivo">${esc(n.motivo)}</p>` : ''}</div>`;
  } else if (n?.situacao === 'REJEITADA') {
    html = `<div class="resultado"><div class="icone">⚠️</div><h2>Atendimento finalizado, mas a nota foi recusada</h2>
      <p class="motivo erro">${esc(n.motivo)}</p><p>O atendimento e o pagamento estão salvos. Corrija os dados e emita novamente.</p>
      <div class="resultado-acoes"><a class="btn btn-primario" href="#/atendimento/${a.id}" data-fechar>Corrigir e reemitir</a></div></div>`;
  } else {
    html = `<div class="resultado"><div class="icone">✅</div><h2>Atendimento finalizado</h2><p>${moeda(a.total)}${aviso ? '' : ' · sem nota fiscal'}</p>
      ${aviso ? `<p class="motivo erro">${esc(aviso)}</p>` : ''}</div>`;
  }
  m.el.innerHTML = `<button class="modal-x" aria-label="Fechar" data-fechar>&times;</button>${html}
    <div class="acoes-modal"><a class="btn" href="#/atendimento/${a.id}" data-fechar>Ver atendimento</a><a class="btn btn-primario" href="#/" id="novo-atend">Novo atendimento</a></div>`;
  m.el.querySelector('#novo-atend').onclick = (e) => { e.preventDefault(); ir('#/'); };
}

// ======================================================================
// Visualização (FINALIZADO / CANCELADO) + ações de NFS-e
// ======================================================================
function visualizar(app, a) {
  const cat = estado.catalogo;
  const ativa = a.notas.find((n) => ATIVAS.includes(n.situacao));
  const podeCancelarNota = ehAdmin() || cat.empresa.atendente_cancela_nota;
  const temPendente = a.notas.some((n) => ['PENDENTE', 'PROCESSANDO', 'CANCELANDO'].includes(n.situacao));

  const caixaNota = (n, idx) => {
    const cor = { AUTORIZADA: 'verde', REJEITADA: 'vermelho', CANCELADA: 'cinza' }[n.situacao] || 'amarelo';
    const acoes = [];
    if (n.situacao === 'AUTORIZADA') {
      acoes.push(botoesNotaAutorizada(a, n));
      acoes.push(`<button class="btn" data-xml="${n.id}" data-num="${esc(n.numero_nfse)}">⬇️ XML</button>`);
      if (podeCancelarNota) acoes.push(`<button class="btn btn-fantasma" style="color:var(--vermelho)" data-cancelar-nota="${n.id}">Cancelar nota</button>`);
    }
    if (n.situacao === 'CANCELADA' && n.token_publico) acoes.push(`<a class="btn" href="${linkNota(n)}" target="_blank" rel="noopener">Ver nota cancelada</a>`);
    if (['PENDENTE', 'PROCESSANDO', 'CANCELANDO'].includes(n.situacao)) acoes.push(`<button class="btn btn-primario" data-tentar="${n.id}">↻ ${n.situacao === 'PENDENTE' && !n.envio_incerto ? 'Tentar agora' : 'Consultar agora'}</button>`);
    if (idx === 0 && !ativa && a.status === 'FINALIZADO' && ['REJEITADA', 'CANCELADA'].includes(n.situacao)) {
      acoes.push(`<button class="btn btn-primario" data-reemitir>${n.situacao === 'REJEITADA' ? 'Corrigir dados e reemitir' : 'Emitir nova nota'}</button>`);
    }
    return `<div class="nota-caixa">
      <div class="cartao-titulo" style="margin:0"><div><span class="selo selo-${cor}">${esc(SITUACAO_NOTA[n.situacao])}</span>
        ${n.numero_nfse ? `<b> NFS-e nº ${esc(n.numero_nfse)}</b>` : ''} <span class="texto-2 pequeno">DPS ${esc(n.serie_dps)}/${n.numero_dps}${n.ambiente !== 'PRODUCAO' ? ' · homologação' : ''}</span></div>
        <span class="texto-2 pequeno">${dataHora(n.data_emissao || n.criado_em)}</span></div>
      ${n.motivo ? `<p class="motivo ${n.situacao === 'REJEITADA' ? 'erro' : ''}">${esc(n.motivo)}</p>` : ''}
      ${n.situacao === 'CANCELADA' ? `<p class="pequeno texto-2">Cancelada em ${dataHora(n.cancelada_em)} — ${esc(n.cancelamento_motivo)}</p>` : ''}
      ${['PENDENTE', 'PROCESSANDO'].includes(n.situacao) && n.proxima_tentativa_em ? `<p class="pequeno texto-2">Próxima tentativa automática: ${dataHora(n.proxima_tentativa_em)} · tentativas: ${n.tentativas}</p>` : ''}
      <div class="acoes">${acoes.join('')}</div>
      <details data-log="${n.id}"><summary>Histórico de comunicação</summary><div class="log-conteudo">Carregando…</div></details>
    </div>`;
  };

  app.innerHTML = `
    <div class="cab-atend">
      <a href="#/" class="btn btn-fantasma btn-pequeno">← Início</a>
      <span class="placa placa-grande">${esc(formataPlaca(a.placa))}</span>
      <h1>Atendimento #${a.id}</h1> ${seloStatus(a.status)}
    </div>
    <div class="atend">
      <div>
        <section class="cartao">
          <div class="cartao-titulo"><h2>🧾 Nota fiscal (NFS-e)</h2></div>
          ${a.notas.length ? a.notas.map(caixaNota).join('') : a.status === 'FINALIZADO' && a.total > 0
            ? '<p class="texto-2">Este atendimento ainda não tem nota.</p><button class="btn btn-primario btn-grande" data-reemitir>Emitir NFS-e</button>'
            : '<p class="texto-2">Sem nota fiscal.</p>'}
        </section>
        <section class="cartao">
          <h3>Serviços</h3>
          <ul class="itens">${a.itens.map((i) => `<li><span>${esc(i.descricao)}</span><span>${moeda(i.valor)}</span></li>`).join('')}</ul>
          <div class="total-linha"><span>Subtotal</span><span>${moeda(a.subtotal)}</span></div>
          ${a.desconto ? `<div class="total-linha"><span>Desconto</span><span>− ${moeda(a.desconto)}</span></div>` : ''}
          <div class="total-grande"><span>Total</span><span>${moeda(a.total)}</span></div>
          <h3>Pagamento</h3>
          ${a.pagamentos.length ? `<ul class="itens">${a.pagamentos.map((p) => `<li><span>${esc(FORMAS[p.forma] || p.forma)}${p.troco ? ` <span class="texto-2 pequeno">(recebido ${moeda(p.valor_recebido)}, troco ${moeda(p.troco)})</span>` : ''}${p.estornado ? ' <span class="selo selo-cinza">estornado</span>' : ''}</span><span>${moeda(p.valor)}</span></li>`).join('')}</ul>` : '<p class="texto-2">—</p>'}
        </section>
      </div>
      <aside class="atend-lateral">
        <section class="cartao">
          <h3>Detalhes</h3>
          <p><b>Veículo:</b> ${esc(a.modelo_cor || '—')} · ${esc(a.porte_nome)}</p>
          <p><b>Cliente:</b> ${a.cliente_id ? `<a href="#/cliente/${a.cliente_id}">${esc(a.cliente_nome || a.tomador_nome || 'ver cadastro')}</a>` : esc(a.tomador_nome || 'Não identificado')}</p>
          ${a.tomador_documento ? `<p><b>CPF/CNPJ na nota:</b> ${esc(formataDoc(a.tomador_documento))}</p>` : ''}
          ${a.observacao ? `<p><b>Observação:</b> ${esc(a.observacao)}</p>` : ''}
          <p class="pequeno texto-2">Aberto ${dataHora(a.aberto_em)} por ${esc(a.aberto_por_nome || '—')}<br>
          ${a.finalizado_em ? `Finalizado ${dataHora(a.finalizado_em)} por ${esc(a.finalizado_por_nome || '—')}<br>` : ''}
          ${a.cancelado_em ? `<b>Cancelado</b> ${dataHora(a.cancelado_em)} por ${esc(a.cancelado_por_nome || '—')}: ${esc(a.motivo_cancelamento)}` : ''}</p>
          ${a.status === 'FINALIZADO' && ehAdmin() ? '<button class="btn btn-fantasma btn-bloco" id="cancelar-atend" style="color:var(--vermelho)">Cancelar atendimento</button>' : ''}
          <a class="btn btn-primario btn-bloco mt" href="#/">Novo atendimento</a>
        </section>
      </aside>
    </div>`;

  $$('[data-tentar]').forEach((b) => (b.onclick = () => comBotao(b, async () => {
    try {
      const n = await api(`/nfse/${b.dataset.tentar}/tentar`, { method: 'POST' });
      toast(n.situacao === 'AUTORIZADA' ? `NFS-e nº ${n.numero_nfse} emitida.` : n.situacao === 'CANCELADA' ? 'Nota cancelada.' : `Situação: ${SITUACAO_NOTA[n.situacao]}.`, n.situacao === 'REJEITADA' ? 'erro' : 'ok');
    } catch (err) { toast(err.message, 'erro'); }
    ir(location.hash);
  })));
  $$('[data-reemitir]').forEach((b) => (b.onclick = () => corrigirEReemitir(a)));
  $$('[data-xml]').forEach((b) => (b.onclick = () => baixar(`/nfse/${b.dataset.xml}/xml`, `nfse-${b.dataset.num}.xml`).catch((e) => toast(e.message, 'erro'))));
  $$('[data-cancelar-nota]').forEach((b) => (b.onclick = async () => {
    const motivo = await confirmar('Cancelar esta NFS-e na prefeitura? O atendimento continua registrado.', { ok: 'Cancelar nota', perigo: true, campoMotivo: 'Motivo (mínimo 15 caracteres)' });
    if (!motivo) return;
    try {
      const n = await api(`/nfse/${b.dataset.cancelarNota}/cancelar`, { method: 'POST', body: { motivo } });
      toast(n.situacao === 'CANCELADA' ? 'Nota cancelada.' : n.motivo || 'Cancelamento em andamento.', n.situacao === 'CANCELADA' ? 'ok' : 'info');
    } catch (err) { toast(err.message, 'erro'); }
    ir(location.hash);
  }));
  $$('[data-log]').forEach((d) => d.addEventListener('toggle', async () => {
    if (!d.open || d.dataset.carregado) return;
    d.dataset.carregado = '1';
    const n = await api(`/nfse/${d.dataset.log}`);
    d.querySelector('.log-conteudo').innerHTML = n.tentativas_log.length ? `<div class="tabela-wrap"><table class="log"><tr><th>Quando</th><th>Operação</th><th>Resultado</th><th>Mensagem</th></tr>
      ${n.tentativas_log.map((t) => `<tr><td>${dataHora(t.iniciado_em)}</td><td>${esc(t.operacao)}</td><td>${esc(t.resultado)}</td><td>${esc([t.codigo, t.mensagem].filter(Boolean).join(' — '))}</td></tr>`).join('')}</table></div>`
      : '<p class="texto-2 pequeno">Nenhuma comunicação com o provedor ainda.</p>';
  }));
  $('#cancelar-atend') && ($('#cancelar-atend').onclick = () => cancelarAtendimento(a.id, a.notas.find((n) => n.situacao === 'AUTORIZADA')));

  // Atualiza sozinho enquanto houver nota em andamento.
  if (temPendente) {
    const hash = location.hash;
    timerAtualizacao = setTimeout(() => { if (location.hash === hash && !document.querySelector('.modal-fundo') && !document.querySelector('details[open]')) ir(hash); }, 6000);
  }
}

function corrigirEReemitir(a) {
  const cat = estado.catalogo;
  const m = modal(`<h2>Dados do cliente para a nota</h2>
    <p class="texto-2">Confira os dados e emita a nota. Um novo número de DPS será usado.</p>
    ${camposTomador({ documento: a.tomador_documento, nome: a.tomador_nome, email: a.tomador_email, telefone: a.tomador_telefone, endereco: a.tomador_endereco }, cat)}
    <div class="acoes-modal"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-sucesso" id="re-ok">Emitir NFS-e</button></div>`, { largo: true });
  ligarTomador(m.el, cat);
  $('#re-ok', m.el).onclick = (e) => comBotao(e.currentTarget, async () => {
    try {
      const atual = await api(`/atendimentos/${a.id}/tomador`, { method: 'PUT', body: lerTomador(m.el) });
      const n = await api(`/atendimentos/${a.id}/nfse`, { method: 'POST' });
      const ref = { ...atual, total: atual.total };
      m.fechar();
      const r = modal('<div></div>', { onFechar: () => ir(location.hash) });
      mostrarResultado(r, ref, n, null);
    } catch (err) { erroCampo(m.el, err.campo, err.message); }
  });
}

async function cancelarAtendimento(id, notaAutorizada) {
  const texto = notaAutorizada
    ? `Este atendimento tem a NFS-e nº ${notaAutorizada.numero_nfse} emitida. Ela será CANCELADA na prefeitura antes de cancelar o atendimento. O pagamento será estornado do caixa.`
    : 'Cancelar este atendimento? Ele sairá do faturamento.';
  const motivo = await confirmar(texto, { ok: 'Cancelar atendimento', perigo: true, campoMotivo: notaAutorizada ? 'Motivo (mínimo 15 caracteres)' : 'Motivo do cancelamento' });
  if (!motivo) return;
  try {
    await api(`/atendimentos/${id}/cancelar`, { method: 'POST', body: { motivo } });
    toast('Atendimento cancelado.');
    ir(`#/atendimento/${id}`);
  } catch (err) { toast(err.message, 'erro'); }
}
