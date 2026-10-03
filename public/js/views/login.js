import { api, sessao } from '../api.js';
import { $, comBotao, toast } from '../ui.js';
import { estado, ir, carregarCatalogo } from '../app.js';

export function telaLogin(app) {
  app.innerHTML = `<form class="cartao login" id="f-login">
    <h1>🚗 Lava-Car</h1>
    <label class="campo"><span>Usuário</span><input id="l-login" autocomplete="username" autocapitalize="none" autofocus required></label>
    <label class="campo"><span>Senha</span><input id="l-senha" type="password" autocomplete="current-password" required></label>
    <button class="btn btn-primario btn-grande btn-bloco" id="l-ok">Entrar</button>
  </form>`;
  $('#l-login').focus();
  $('#f-login').onsubmit = (e) => {
    e.preventDefault();
    comBotao($('#l-ok'), async () => {
      try {
        const r = await api('/login', { method: 'POST', body: { login: $('#l-login').value, senha: $('#l-senha').value } });
        sessao.set({ token: r.token });
        estado.usuario = r.usuario;
        await carregarCatalogo(true);
        ir('#/');
      } catch (err) {
        toast(err.message, 'erro');
        $('#l-senha').select();
      }
    });
  };
}
