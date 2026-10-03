// Autenticação por token de sessão (Bearer) e controle de perfil.
import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { confereSenha } from './senha.js';
import { agora, somaMinutos, ErroNegocio } from './util.js';

const DURACAO_SESSAO_MIN = 60 * 24 * 30;

export function login(loginInformado, senha) {
  const u = db.prepare('SELECT * FROM usuarios WHERE login = ? AND ativo = 1').get(String(loginInformado ?? '').trim());
  if (!u || !confereSenha(senha, u.senha_hash)) throw new ErroNegocio('Usuário ou senha incorretos.', 401);
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(agora());
  db.prepare('INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?,?,?)').run(token, u.id, somaMinutos(DURACAO_SESSAO_MIN));
  return { token, usuario: publico(u) };
}

export function logout(token) {
  db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
}

export function publico(u) {
  return { id: u.id, nome: u.nome, login: u.login, perfil: u.perfil };
}

export function autenticar(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const s = token && db.prepare(
    `SELECT u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token = ? AND s.expira_em > ? AND u.ativo = 1`).get(token, agora());
  if (!s) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  req.usuario = publico(s);
  req.token = token;
  next();
}

export function somenteAdmin(req, res, next) {
  if (req.usuario?.perfil !== 'ADMIN') return res.status(403).json({ erro: 'Somente o administrador pode fazer isso.' });
  next();
}
