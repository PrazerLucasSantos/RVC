import { provedorSimulado } from './simulado.js';
import { provedorModelo } from './modelo-integracao.js';

const provedores = { simulado: provedorSimulado, modelo: provedorModelo };

export const nomesProvedores = Object.keys(provedores);

export function provedorDe(empresa) {
  return provedores[empresa.provedor] || provedorSimulado;
}
