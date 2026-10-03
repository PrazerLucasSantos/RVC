import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export function hashSenha(senha) {
  const sal = randomBytes(16).toString('hex');
  return `${sal}:${scryptSync(String(senha), sal, 64).toString('hex')}`;
}

export function confereSenha(senha, hash) {
  const [sal, h] = String(hash).split(':');
  if (!sal || !h) return false;
  const calc = scryptSync(String(senha), sal, 64);
  const esperado = Buffer.from(h, 'hex');
  return esperado.length === calc.length && timingSafeEqual(calc, esperado);
}
