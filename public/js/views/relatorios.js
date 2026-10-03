// Relatórios por período (financeiro simples + situação das notas).
import { api } from '../api.js';
import { $, esc, moeda, data, dataHora, formataPlaca, hojeISO, diasAtrasISO, FORMAS, SITUACAO_NOTA } from '../ui.js';

export async function telaRelatorios(app, de = hojeISO(), ate = hojeISO()) {
  const r = await api(`/relatorios?de=${de}&ate=${ate}`);
  const s = r.resumo;
  const primeiroDoMes = `${hojeISO().slice(0, 8)}01`;
  const tabela = (cab, linhas) => linhas.length ? `<div class="tabela-wrap"><table><thead><tr>${cab.map((c) => `<th class="${c.num ? 'num' : ''}">${c.t}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>` : '<p class="texto-2">Nada no período.</p>';

  app.innerHTML = `<h1>Relatórios</h1>
    <form class="cartao filtros" id="f-rel">
      <label class="campo"><span>De</span><input type="date" id="de" value="${de}"></label>
      <label class="campo"><span>Até</span><input type="date" id="ate" value="${ate}"></label>
      <button class="btn btn-primario">Ver</button>
      <button class="btn" type="button" data-p="hoje">Hoje</button>
      <button class="btn" type="button" data-p="7">7 dias</button>
      <button class="btn" type="button" data-p="mes">Este mês</button>
    </form>
    <div class="indicadores">
      <div class="indicador"><b>${moeda(s.faturamento)}</b><span>Faturamento</span></div>
      <div class="indicador"><b>${s.qtd}</b><span>Atendimentos</span></div>
      <div class="indicador"><b>${moeda(s.ticket_medio)}</b><span>Ticket médio</span></div>
      <div class="indicador"><b>${moeda(s.descontos)}</b><span>Descontos</span></div>
      <div class="indicador"><b>${r.cancelados.length}</b><span>Cancelamentos</span></div>
      <div class="indicador"><b>${s.notas_emitidas}</b><span>NFS-e emitidas</span></div>
    </div>
    <div class="grade-2">
      <section class="cartao"><h2>Recebimentos por forma (conferência de caixa)</h2>
        ${tabela([{ t: 'Forma' }, { t: 'Qtd', num: 1 }, { t: 'Valor', num: 1 }], r.porForma.map((f) => `<tr><td>${esc(FORMAS[f.forma] || f.forma)}</td><td class="num">${f.qtd}</td><td class="num">${moeda(f.valor)}</td></tr>`))}
      </section>
      <section class="cartao"><h2>Notas fiscais</h2>
        ${tabela([{ t: 'Situação' }, { t: 'Qtd', num: 1 }, { t: 'Valor', num: 1 }], Object.values(s.notas_situacao).map((n) => `<tr><td>${esc(SITUACAO_NOTA[n.situacao])}</td><td class="num">${n.qtd}</td><td class="num">${moeda(n.valor)}</td></tr>`))}
      </section>
      <section class="cartao"><h2>Por serviço</h2>
        ${tabela([{ t: 'Serviço' }, { t: 'Qtd', num: 1 }, { t: 'Valor', num: 1 }], r.porServico.map((x) => `<tr><td>${esc(x.descricao)}</td><td class="num">${x.qtd}</td><td class="num">${moeda(x.valor)}</td></tr>`))}
      </section>
      <section class="cartao"><h2>Por dia</h2>
        ${tabela([{ t: 'Dia' }, { t: 'Qtd', num: 1 }, { t: 'Valor', num: 1 }], r.porDia.map((x) => `<tr><td>${data(x.dia)}</td><td class="num">${x.qtd}</td><td class="num">${moeda(x.valor)}</td></tr>`))}
      </section>
      <section class="cartao"><h2>Descontos concedidos</h2>
        ${tabela([{ t: '#' }, { t: 'Placa' }, { t: 'Quem' }, { t: 'Subtotal', num: 1 }, { t: 'Desconto', num: 1 }], r.descontos.map((x) => `<tr class="clicavel" onclick="location.hash='#/atendimento/${x.id}'"><td>${x.id}</td><td>${esc(formataPlaca(x.placa))}</td><td>${esc(x.usuario || '')}</td><td class="num">${moeda(x.subtotal)}</td><td class="num">${moeda(x.desconto)}</td></tr>`))}
      </section>
      <section class="cartao"><h2>Cancelamentos</h2>
        ${tabela([{ t: '#' }, { t: 'Quando' }, { t: 'Placa' }, { t: 'Quem' }, { t: 'Motivo' }, { t: 'Valor', num: 1 }], r.cancelados.map((x) => `<tr class="clicavel" onclick="location.hash='#/atendimento/${x.id}'"><td>${x.id}</td><td>${dataHora(x.cancelado_em)}</td><td>${esc(formataPlaca(x.placa))}</td><td>${esc(x.usuario || '')}</td><td>${esc(x.motivo_cancelamento)}</td><td class="num">${moeda(x.total)}</td></tr>`))}
      </section>
    </div>`;
  $('#f-rel').onsubmit = (e) => { e.preventDefault(); telaRelatorios(app, $('#de').value, $('#ate').value); };
  app.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => {
    const p = b.dataset.p;
    telaRelatorios(app, p === 'hoje' ? hojeISO() : p === '7' ? diasAtrasISO(6) : primeiroDoMes, hojeISO());
  }));
}
