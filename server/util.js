// Utilidades de validação, normalização e datas.

export class ErroNegocio extends Error {
  constructor(mensagem, status = 400, campo = undefined) {
    super(mensagem);
    this.status = status;
    this.campo = campo;
  }
}

export function normalizaPlaca(placa) {
  return String(placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Padrão antigo (ABC1234) e Mercosul (ABC1D23).
export function placaValida(placa) {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa);
}

// Documento normalizado: maiúsculas, sem pontuação (o CNPJ pode ser alfanumérico desde 07/2026).
export function normalizaDocumento(doc) {
  return String(doc ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function cpfValido(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = dv(cpf.slice(0, 9));
  const d2 = dv(cpf.slice(0, 10));
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

// Aceita CNPJ numérico e alfanumérico (valor do caractere = código ASCII − 48).
export function cnpjValido(cnpj) {
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const valor = (c) => c.charCodeAt(0) - 48;
  const dv = (base) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += valor(base[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(cnpj.slice(0, 12)) === Number(cnpj[12]) && dv(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

export function tipoDocumento(doc) {
  if (!doc) return null;
  if (doc.length === 11) return 'PF';
  if (doc.length === 14) return 'PJ';
  return null;
}

export function documentoValido(doc) {
  const tipo = tipoDocumento(doc);
  if (tipo === 'PF') return cpfValido(doc);
  if (tipo === 'PJ') return cnpjValido(doc);
  return false;
}

export function mascaraDocumento(doc) {
  if (!doc) return '';
  if (doc.length === 11) return `***.${doc.slice(3, 6)}.${doc.slice(6, 9)}-**`;
  if (doc.length === 14) return `${doc.slice(0, 2)}.${doc.slice(2, 5)}.***/****-${doc.slice(12)}`;
  return doc;
}

export function formataDocumento(doc) {
  if (!doc) return '';
  if (doc.length === 11) return `${doc.slice(0, 3)}.${doc.slice(3, 6)}.${doc.slice(6, 9)}-${doc.slice(9)}`;
  if (doc.length === 14) return `${doc.slice(0, 2)}.${doc.slice(2, 5)}.${doc.slice(5, 8)}/${doc.slice(8, 12)}-${doc.slice(12)}`;
  return doc;
}

export function soDigitos(v) {
  return String(v ?? '').replace(/\D/g, '');
}

// Datas em horário local (TZ do processo), formato 'YYYY-MM-DD HH:MM:SS' — ordenável como texto.
const pad = (n) => String(n).padStart(2, '0');

export function formataDataHora(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function agora() {
  return formataDataHora(new Date());
}

export function hoje() {
  return agora().slice(0, 10);
}

export function somaMinutos(minutos, base = new Date()) {
  return formataDataHora(new Date(base.getTime() + minutos * 60000));
}

export function parseDataHora(s) {
  const [d, t = '00:00:00'] = s.split(' ');
  const [a, m, dia] = d.split('-').map(Number);
  const [h, mi, se] = t.split(':').map(Number);
  return new Date(a, m - 1, dia, h, mi, se);
}

export function formataMoeda(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function inteiro(v, campo) {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new ErroNegocio(`Valor inválido para ${campo}.`, 400, campo);
  return n;
}

export function texto(v, max = 200) {
  const s = String(v ?? '').trim();
  return s.length > max ? s.slice(0, max) : s;
}
