// Tela inicial: busca por placa + pátio + pendências de nota + resumo do dia.
import { api } from '../api.js';
import { $, esc, moeda, formataPlaca, tempoDesde, seloNota, vazio, toast } from '../ui.js';
import { ehAdmin, ir } from '../app.js';

const pareceplaca = (s) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(s);

export async function telaInicio(app) {
  const d = await api('/inicio');
  const r = d.resumo;
  app.innerHTML = `
    ${d.alertas.map((a) => `<div class="alerta-faixa alerta-${a.nivel}">${esc(a.texto)}${a.link && ehAdmin() ? `<a href="${a.link}">Resolver →</a>` : ''}</div>`).join('')}
    <form class="cartao" id="f-busca">
      <div class="busca-placa">
        <input id="busca" placeholder="PLACA" maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Placa, nome, telefone ou CPF">
        <button class="btn btn-primario">Buscar</button>
      </div>
      <p class="texto-2 pequeno" style="margin:8px 0 0">Digite a placa e tecle Enter. Também é possível buscar por nome, telefone ou CPF/CNPJ.</p>
      <div id="resultados"></div>
    </form>

    <div class="indicadores">
      <div class="indicador"><b>${r.qtd}</b><span>Atendimentos hoje</span></div>
      ${ehAdmin() ? `<div class="indicador"><b>${moeda(r.faturamento)}</b><span>Faturamento hoje</span></div>
      <div class="indicador"><b>${moeda(r.ticket_medio)}</b><span>Ticket médio</span></div>` : ''}
      <div class="indicador"><b>${r.notas_emitidas}</b><span>NFS-e emitidas</span></div>
      <div class="indicador ${d.pendencias.length ? 'alerta' : ''}"><b>${d.pendencias.length}</b><span>Notas com pendência</span></div>
      <div class="indicador"><b>${d.patio.length}</b><span>No pátio</span></div>
    </div>

    <div class="grade-2">
      <section class="cartao">
        <div class="cartao-titulo"><h2>🚘 No pátio (${d.patio.length})</h2><a class="btn btn-pequeno" href="#/atendimento/novo">+ Novo</a></div>
        ${d.patio.length ? `<ul class="lista">${d.patio.map((a) => `<li><a class="item-lista" href="#/atendimento/${a.id}">
          <span class="placa">${esc(formataPlaca(a.placa))}</span>
          <div class="principal"><div>${esc(a.servicos || 'Sem serviços')}</div><div class="sub">${esc(a.modelo_cor || a.porte_nome)} · há ${tempoDesde(a.aberto_em)}</div></div>
          <div class="valor">${moeda(a.total)}<div class="sub">Receber →</div></div></a></li>`).join('')}</ul>` : vazio('Nenhum carro no pátio.')}
      </section>

      <section class="cartao">
        <div class="cartao-titulo"><h2>🧾 Notas com pendência (${d.pendencias.length})</h2></div>
        ${d.pendencias.length ? `<ul class="lista">${d.pendencias.map((a) => `<li><a class="item-lista" href="#/atendimento/${a.id}">
          <span class="placa">${esc(formataPlaca(a.placa))}</span>
          <div class="principal"><div>${seloNota(a.nota_situacao)} <span class="sub">#${a.id} · ${moeda(a.total)}</span></div>
            <div class="sub">${esc(a.nota_motivo || '')}</div></div>
          <div class="valor"><span class="btn btn-pequeno">Resolver</span></div></a></li>`).join('')}</ul>` : vazio('Tudo em dia. Nenhuma nota pendente. ✅')}
      </section>
    </div>

    <section class="cartao">
      <div class="cartao-titulo"><h2>Últimos atendimentos de hoje</h2><a href="#/atendimentos">Ver todos →</a></div>
      ${d.ultimos.length ? `<ul class="lista">${d.ultimos.map((a) => `<li><a class="item-lista" href="#/atendimento/${a.id}">
        <span class="placa">${esc(formataPlaca(a.placa))}</span>
        <div class="principal"><div>${esc(a.servicos)}</div><div class="sub">${esc(a.cliente_nome || 'Cliente não identificado')} · ${esc((a.formas || '').replace(/\+/g, ' + '))}</div></div>
        <div class="valor">${moeda(a.total)}<div>${seloNota(a.nota_situacao, a.status)}</div></div></a></li>`).join('')}</ul>` : vazio('Nenhum atendimento finalizado hoje.')}
    </section>`;

  const input = $('#busca');
  input.focus();
  $('#f-busca').onsubmit = async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return input.focus();
    const placa = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (pareceplaca(placa)) return ir(`#/atendimento/novo?placa=${placa}`);
    try {
      const res = await api(`/busca?q=${encodeURIComponent(q)}`);
      const div = $('#resultados');
      if (!res.length) {
        div.innerHTML = `<p class="texto-2 mt">Nada encontrado. ${/^[A-Za-z]{3}/.test(q) ? 'Confira a placa (formato ABC1234 ou ABC1D23).' : ''}</p>`;
        return;
      }
      div.innerHTML = `<ul class="lista mt">${res.map((r) => r.veiculo_id
        ? `<li><a class="item-lista" href="#/atendimento/novo?placa=${esc(r.placa)}"><span class="placa">${esc(formataPlaca(r.placa))}</span>
          <div class="principal"><div>${esc(r.cliente_nome || 'Sem cliente')}</div><div class="sub">${esc(r.modelo_cor || '')} · ${esc(r.porte_nome)} ${r.telefone ? '· ' + esc(r.telefone) : ''}</div></div>
          <span class="btn btn-pequeno">Atender</span></a></li>`
        : `<li><a class="item-lista" href="#/cliente/${r.cliente_id}"><span>👤</span><div class="principal"><div>${esc(r.cliente_nome)}</div><div class="sub">Cliente sem veículo cadastrado</div></div></a></li>`).join('')}</ul>`;
    } catch (err) { toast(err.message, 'erro'); }
  };
}
