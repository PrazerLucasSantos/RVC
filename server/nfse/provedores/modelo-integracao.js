// MODELO para integrar um provedor real (intermediador de NFS-e ou Padrão Nacional).
//
// Passos:
//  1. Copie este arquivo (ex.: provedores/meu-gateway.js) e implemente os quatro métodos
//     seguindo o contrato de ./base.js.
//  2. Registre-o em ./index.js.
//  3. Em Configurações › Empresa e fiscal, selecione o provedor e informe as credenciais
//     (ficam em empresa.provedor_config).
//  4. Teste em HOMOLOGAÇÃO todos os cenários (sucesso, rejeição, timeout, cancelamento)
//     antes de mudar o ambiente para PRODUÇÃO.
//
// Regras obrigatórias para não gerar nota duplicada:
//  - Envie SEMPRE a mesma série/número de DPS (ou a mesma `referencia`) recebidos em `dps`.
//    Nunca gere numeração aqui: quem controla é o sistema.
//  - Timeout, erro de rede, HTTP 5xx ou resposta ilegível => throw new ErroComunicacao(...).
//    Nunca devolva REJEITADA se não houver certeza de que a nota NÃO foi criada.
//  - Se o provedor responder que a DPS/referência já existe, devolva { resultado: 'DUPLICADA' }.
import { ErroComunicacao } from './base.js';

export const provedorModelo = {
  nome: 'modelo',
  async emitir(/* dps, empresa */) {
    throw new ErroComunicacao('Provedor real ainda não implementado. Use o provedor "simulado".');
  },
  async consultar(/* ref, empresa */) {
    throw new ErroComunicacao('Provedor real ainda não implementado.');
  },
  async cancelar(/* ref, motivo, empresa */) {
    throw new ErroComunicacao('Provedor real ainda não implementado.');
  },
  async testarConexao() {
    return { ok: false, mensagem: 'Provedor real ainda não implementado. Veja server/nfse/provedores/modelo-integracao.js.' };
  },
};
