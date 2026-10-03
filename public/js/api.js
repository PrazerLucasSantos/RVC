// Cliente HTTP da API com token de sessão.
const CHAVE = 'rvc_sessao';

export const sessao = {
  get() {
    try { return JSON.parse(localStorage.getItem(CHAVE)); } catch { return null; }
  },
  set(s) {
    try { localStorage.setItem(CHAVE, JSON.stringify(s)); } catch { /* armazenamento indisponível */ }
  },
  limpar() {
    try { localStorage.removeItem(CHAVE); } catch { /* ignore */ }
  },
};

export class ErroApi extends Error {
  constructor(msg, status, campo) { super(msg); this.status = status; this.campo = campo; }
}

export async function api(caminho, { method = 'GET', body, bruto = false } = {}) {
  const s = sessao.get();
  const headers = {};
  if (s?.token) headers.Authorization = `Bearer ${s.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`/api${caminho}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ErroApi('Sem conexão com o servidor. Verifique a internet e tente novamente.', 0);
  }
  if (res.status === 401 && caminho !== '/login') {
    sessao.limpar();
    location.hash = '#/login';
    throw new ErroApi('Sessão expirada. Entre novamente.', 401);
  }
  if (bruto) {
    if (!res.ok) throw new ErroApi('Falha ao baixar o arquivo.', res.status);
    return res;
  }
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErroApi(dados.erro || 'Erro inesperado.', res.status, dados.campo);
  return dados;
}

export async function baixar(caminho, nomeArquivo) {
  const res = await api(caminho, { bruto: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nomeArquivo });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
