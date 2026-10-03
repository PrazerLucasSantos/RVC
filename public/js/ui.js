// Utilidades de interface: escape, formatação, toasts e modais.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function moeda(centavos) {
  return ((centavos || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// "35", "35,5", "1.234,56", "R$ 35,00" -> centavos
export function parseMoeda(txt) {
  const s = String(txt ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function moedaInput(centavos) {
  if (centavos === null || centavos === undefined || centavos === '') return '';
  return (centavos / 100).toFixed(2).replace('.', ',');
}

export function dataHora(s) {
  if (!s) return '';
  const [d, t = ''] = s.split(' ');
  const [a, m, dia] = d.split('-');
  return `${dia}/${m}/${a}${t ? ' ' + t.slice(0, 5) : ''}`;
}

export function data(s) {
  if (!s) return '';
  const [a, m, dia] = s.slice(0, 10).split('-');
  return `${dia}/${m}/${a}`;
}

export function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function diasAtrasISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formataPlaca(p) {
  return p ? `${p.slice(0, 3)}-${p.slice(3)}` : '';
}

export function formataDoc(d) {
  d = String(d || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

export function tempoDesde(s) {
  if (!s) return '';
  const [d, t] = s.split(' ');
  const [a, m, dia] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const min = Math.max(0, Math.round((Date.now() - new Date(a, m - 1, dia, h, mi).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h ${min % 60} min`;
  return `${Math.floor(min / 1440)} dia(s)`;
}

export const STATUS_ATEND = { ABERTO: 'No pátio', FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado' };
export const SITUACAO_NOTA = {
  PENDENTE: 'Pendente', PROCESSANDO: 'Processando', AUTORIZADA: 'Emitida', REJEITADA: 'Rejeitada', CANCELANDO: 'Cancelando', CANCELADA: 'Cancelada',
};
export const FORMAS = { DINHEIRO: 'Dinheiro', PIX: 'PIX', DEBITO: 'Débito', CREDITO: 'Crédito', OUTRO: 'Outro' };

export function seloNota(situacao, statusAtend) {
  if (!situacao) return statusAtend === 'FINALIZADO' ? '<span class="selo selo-cinza">Sem nota</span>' : '';
  const cor = { AUTORIZADA: 'verde', PENDENTE: 'amarelo', PROCESSANDO: 'amarelo', CANCELANDO: 'amarelo', REJEITADA: 'vermelho', CANCELADA: 'cinza' }[situacao];
  return `<span class="selo selo-${cor}">NFS-e ${esc(SITUACAO_NOTA[situacao])}</span>`;
}

export function seloStatus(status) {
  const cor = { ABERTO: 'azul', FINALIZADO: 'verde', CANCELADO: 'cinza' }[status];
  return `<span class="selo selo-${cor}">${esc(STATUS_ATEND[status])}</span>`;
}

let toastTimer;
export function toast(msg, tipo = 'ok') {
  let el = $('#toast');
  if (!el) {
    el = Object.assign(document.createElement('div'), { id: 'toast' });
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.className = `toast toast-${tipo} visivel`;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visivel'), tipo === 'erro' ? 6000 : 3000);
}

const modaisAbertos = new Set();

// Descarta todos os modais sem disparar onFechar (usado ao trocar de tela).
export function descartarModais() {
  for (const m of [...modaisAbertos]) m(false);
}

// Modal simples. Retorna { el, fechar }. onFechar é chamado ao fechar.
export function modal(html, { onFechar, largo = false } = {}) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `<div class="modal ${largo ? 'modal-largo' : ''}" role="dialog" aria-modal="true">
    <button class="modal-x" aria-label="Fechar" data-fechar>&times;</button>${html}</div>`;
  document.body.appendChild(fundo);
  document.body.classList.add('com-modal');
  const encerrar = (notificar = true) => {
    if (!modaisAbertos.has(encerrar)) return;
    modaisAbertos.delete(encerrar);
    fundo.remove();
    if (!$('.modal-fundo')) document.body.classList.remove('com-modal');
    document.removeEventListener('keydown', tecla);
    if (notificar) onFechar?.();
  };
  const fechar = () => encerrar(true);
  modaisAbertos.add(encerrar);
  const tecla = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', tecla);
  fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-fechar]')) fechar(); });
  const el = fundo.querySelector('.modal');
  setTimeout(() => el.querySelector('[autofocus]')?.focus(), 30);
  return { el, fechar };
}

export function confirmar(texto, { ok = 'Confirmar', perigo = false, campoMotivo = null } = {}) {
  return new Promise((resolve) => {
    let resolvido = false;
    const m = modal(`<h2>Confirmação</h2><p>${esc(texto)}</p>
      ${campoMotivo ? `<label class="campo"><span>${esc(campoMotivo)}</span><textarea id="cf-motivo" rows="3" autofocus></textarea></label>` : ''}
      <div class="acoes-modal"><button class="btn" data-fechar>Voltar</button>
      <button class="btn ${perigo ? 'btn-perigo' : 'btn-primario'}" id="cf-ok">${esc(ok)}</button></div>`,
    { onFechar: () => { if (!resolvido) resolve(null); } });
    $('#cf-ok', m.el).onclick = () => {
      resolvido = true;
      const motivo = campoMotivo ? $('#cf-motivo', m.el).value.trim() : true;
      m.fechar();
      resolve(motivo);
    };
  });
}

// Executa uma ação assíncrona desabilitando o botão (evita clique duplo).
export async function comBotao(botao, fn) {
  if (botao.disabled) return;
  const texto = botao.innerHTML;
  botao.disabled = true;
  botao.classList.add('carregando');
  try {
    return await fn();
  } finally {
    botao.disabled = false;
    botao.classList.remove('carregando');
    botao.innerHTML = texto;
  }
}

export function erroCampo(raiz, campo, msg) {
  $$('.campo-erro', raiz).forEach((e) => e.classList.remove('campo-erro'));
  const alvo = campo && $(`[data-campo="${campo}"]`, raiz);
  if (alvo) {
    alvo.classList.add('campo-erro');
    alvo.querySelector('input,select,textarea')?.focus();
  }
  toast(msg, 'erro');
}

export function vazio(texto) {
  return `<div class="vazio">${esc(texto)}</div>`;
}
