// Lista de atendimentos com filtros (substitui a tela separada de NFS-e).
import { api, baixar } from '../api.js';
import { $, esc, moeda, dataHora, formataPlaca, seloNota, seloStatus, hojeISO, diasAtrasISO, vazio, toast, FORMAS } from '../ui.js';
import { ir } from '../app.js';

export async function telaAtendimentos(app, params) {
  const f = {
    de: params.get('de') || hojeISO(), ate: params.get('ate') || hojeISO(), q: params.get('q') || '',
    status: params.get('status') || '', nota: params.get('nota') || '',
  };
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const lista = await api(`/atendimentos?${qs}`);
  const total = lista.filter((a) => a.status === 'FINALIZADO').reduce((s, a) => s + a.total, 0);

  app.innerHTML = `<h1>Atendimentos</h1>
    <form class="cartao filtros" id="f-filtros">
      <label class="campo"><span>De</span><input type="date" name="de" value="${f.de}"></label>
      <label class="campo"><span>Até</span><input type="date" name="ate" value="${f.ate}"></label>
      <label class="campo"><span>Placa ou cliente</span><input name="q" value="${esc(f.q)}" placeholder="Buscar"></label>
      <label class="campo"><span>Situação</span><select name="status">
        <option value="">Todas</option>${Object.entries({ ABERTO: 'No pátio', FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado' }).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="campo"><span>Nota fiscal</span><select name="nota">
        <option value="">Todas</option>${Object.entries({ SEM: 'Sem nota', AUTORIZADA: 'Emitida', PENDENTE: 'Pendente', PROCESSANDO: 'Processando', REJEITADA: 'Rejeitada', CANCELANDO: 'Cancelando', CANCELADA: 'Cancelada' }).map(([k, v]) => `<option value="${k}" ${f.nota === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <button class="btn btn-primario">Filtrar</button>
      <button class="btn" type="button" id="csv">⬇️ CSV</button>
    </form>
    <div class="chips" style="margin-bottom:12px">
      <button class="btn btn-pequeno" data-periodo="0">Hoje</button>
      <button class="btn btn-pequeno" data-periodo="6">7 dias</button>
      <button class="btn btn-pequeno" data-periodo="29">30 dias</button>
      <span class="texto-2 pequeno" style="margin-left:auto">${lista.length} atendimento(s) · finalizados: <b>${moeda(total)}</b></span>
    </div>
    <div class="cartao" style="padding:0">
      ${lista.length ? `<div class="tabela-wrap"><table>
        <thead><tr><th>#</th><th>Data</th><th>Placa</th><th>Cliente</th><th>Serviços</th><th>Pagamento</th><th class="num">Total</th><th>Situação</th><th>NFS-e</th></tr></thead>
        <tbody>${lista.map((a) => `<tr class="clicavel" data-id="${a.id}">
          <td>${a.id}</td><td>${dataHora(a.finalizado_em || a.aberto_em)}</td><td><span class="placa">${esc(formataPlaca(a.placa))}</span></td>
          <td>${esc(a.cliente_nome || '—')}</td><td>${esc(a.servicos || '')}</td>
          <td>${esc((a.formas || '').split('+').filter(Boolean).map((x) => FORMAS[x] || x).join(' + '))}</td>
          <td class="num">${moeda(a.total)}</td><td>${seloStatus(a.status)}</td>
          <td>${seloNota(a.nota_situacao, a.status)} ${a.nota_numero ? `<span class="pequeno texto-2">nº ${esc(a.nota_numero)}</span>` : ''}</td></tr>`).join('')}</tbody>
      </table></div>` : vazio('Nenhum atendimento no período.')}
    </div>`;

  const aplicar = (obj) => {
    const p = new URLSearchParams(Object.entries(obj).filter(([, v]) => v)).toString();
    ir(`#/atendimentos${p ? '?' + p : ''}`);
  };
  $('#f-filtros').onsubmit = (e) => {
    e.preventDefault();
    aplicar(Object.fromEntries(new FormData(e.target)));
  };
  app.querySelectorAll('[data-periodo]').forEach((b) => (b.onclick = () => aplicar({ ...f, de: diasAtrasISO(Number(b.dataset.periodo)), ate: hojeISO() })));
  app.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => ir(`#/atendimento/${tr.dataset.id}`)));
  $('#csv').onclick = () => baixar(`/atendimentos.csv?${qs}`, `atendimentos-${f.de}-a-${f.ate}.csv`).catch((e) => toast(e.message, 'erro'));
}
