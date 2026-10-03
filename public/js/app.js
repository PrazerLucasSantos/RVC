// Roteador da aplicação (hash) e estado global da sessão.
import { api, sessao } from './api.js';
import { $, $$, esc, modal, toast, comBotao, descartarModais } from './ui.js';
import { telaLogin } from './views/login.js';
import { telaInicio } from './views/inicio.js';
import { telaAtendimento } from './views/atendimento.js';
import { telaAtendimentos } from './views/atendimentos.js';
import { telaClientes, telaCliente } from './views/clientes.js';
import { telaRelatorios } from './views/relatorios.js';
import { telaConfig } from './views/config.js';

export const estado = { usuario: null, catalogo: null };

export const ehAdmin = () => estado.usuario?.perfil === 'ADMIN';

export async function carregarCatalogo(forcar = false) {
  if (!estado.catalogo || forcar) estado.catalogo = await api('/catalogo');
  $('#nome-empresa').textContent = estado.catalogo.empresa.razao_social || 'Lava-Car';
  return estado.catalogo;
}

export function ir(hash) {
  if (location.hash === hash) rotear();
  else location.hash = hash;
}

function telaMais(app) {
  app.innerHTML = `<h1>Mais</h1><div class="cartao mais-menu" style="padding:0">
    ${ehAdmin() ? '<a href="#/relatorios">📊 Relatórios</a><a href="#/config">⚙️ Configurações</a>' : ''}
    <a href="#" id="mais-senha">🔑 Trocar minha senha</a>
    <a href="#" id="mais-sair">🚪 Sair</a></div>`;
  $('#mais-senha').onclick = (e) => { e.preventDefault(); trocarSenha(); };
  $('#mais-sair').onclick = (e) => { e.preventDefault(); sair(); };
}

async function sair() {
  await api('/logout', { method: 'POST' }).catch(() => {});
  sessao.limpar();
  estado.usuario = null;
  estado.catalogo = null;
  ir('#/login');
}

function trocarSenha() {
  const m = modal(`<h2>Trocar minha senha</h2>
    <label class="campo" data-campo="atual"><span>Senha atual</span><input type="password" id="s-atual" autofocus autocomplete="current-password"></label>
    <label class="campo" data-campo="nova"><span>Nova senha (mín. 6 caracteres)</span><input type="password" id="s-nova" autocomplete="new-password"></label>
    <div class="acoes-modal"><button class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="s-ok">Salvar</button></div>`);
  $('#s-ok', m.el).onclick = (e) => comBotao(e.currentTarget, async () => {
    try {
      await api('/me/senha', { method: 'PUT', body: { atual: $('#s-atual', m.el).value, nova: $('#s-nova', m.el).value } });
      m.fechar();
      toast('Senha alterada.');
    } catch (err) { toast(err.message, 'erro'); }
  });
}

function menuUsuario() {
  const m = modal(`<h2>${esc(estado.usuario.nome)}</h2><p class="texto-2">${estado.usuario.perfil === 'ADMIN' ? 'Administrador' : 'Atendente'} · login ${esc(estado.usuario.login)}</p>
    <div class="acoes-modal"><button class="btn" id="u-senha">Trocar senha</button><button class="btn btn-perigo" id="u-sair">Sair</button></div>`);
  $('#u-senha', m.el).onclick = () => { m.fechar(); trocarSenha(); };
  $('#u-sair', m.el).onclick = () => { m.fechar(); sair(); };
}

const rotas = [
  [/^#\/login$/, 'login', (app) => telaLogin(app)],
  [/^#\/?$/, 'inicio', (app) => telaInicio(app)],
  [/^#\/atendimento\/novo(?:\?(.*))?$/, 'novo', (app, m) => telaAtendimento(app, null, new URLSearchParams(m[1] || ''))],
  [/^#\/atendimento\/(\d+)$/, 'atendimentos', (app, m) => telaAtendimento(app, Number(m[1]))],
  [/^#\/atendimentos(?:\?(.*))?$/, 'atendimentos', (app, m) => telaAtendimentos(app, new URLSearchParams(m[1] || ''))],
  [/^#\/clientes$/, 'clientes', (app) => telaClientes(app)],
  [/^#\/cliente\/(novo|\d+)$/, 'clientes', (app, m) => telaCliente(app, m[1] === 'novo' ? null : Number(m[1]))],
  [/^#\/relatorios$/, 'relatorios', (app) => telaRelatorios(app), true],
  [/^#\/config$/, 'config', (app) => telaConfig(app), true],
  [/^#\/mais$/, 'mais', (app) => telaMais(app)],
];

export async function rotear() {
  descartarModais();
  const app = $('#app');
  const hash = location.hash || '#/';
  const logado = !!sessao.get()?.token;
  if (!logado && hash !== '#/login') return ir('#/login');

  if (logado && !estado.usuario) {
    try {
      estado.usuario = await api('/me');
      await carregarCatalogo();
    } catch {
      return;
    }
  }
  const emLogin = hash === '#/login';
  $('#topo').hidden = emLogin;
  $('#menu-inferior').hidden = emLogin;
  $$('[data-admin]').forEach((el) => { el.hidden = !ehAdmin(); });
  if (estado.usuario) $('#btn-usuario').textContent = `👤 ${estado.usuario.nome.split(' ')[0]}`;

  const rota = rotas.find(([re]) => re.test(hash));
  if (!rota) return ir('#/');
  const [re, nome, fn, admin] = rota;
  if (admin && !ehAdmin()) return ir('#/');
  $$('[data-rota]').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === nome));
  window.scrollTo(0, 0);
  app.innerHTML = '<div class="vazio">Carregando…</div>';
  try {
    await fn(app, hash.match(re));
  } catch (e) {
    app.innerHTML = `<div class="cartao"><p>${esc(e.message)}</p><a class="btn" href="#/">Voltar ao início</a></div>`;
  }
}

$('#btn-usuario').onclick = menuUsuario;
window.addEventListener('hashchange', rotear);
rotear();
