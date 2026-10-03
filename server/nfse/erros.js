// Tradução de códigos de retorno em mensagens simples, com ação sugerida.
const MENSAGENS = {
  E_TOMADOR_DOC: 'CPF/CNPJ do cliente inválido. Corrija o documento e emita novamente.',
  E_TOMADOR_NOME: 'Falta o nome/razão social do cliente. Complete e emita novamente.',
  E_TOMADOR_ENDERECO: 'Falta o endereço do cliente (empresa). Complete e emita novamente.',
  E_SIM_REJEICAO: 'A prefeitura recusou o código de serviço. Avise o administrador para revisar a configuração fiscal.',
  E_DPS_DUPLICADA: 'Esta nota já havia sido enviada. O sistema localizou a nota existente.',
  E_NAO_ENCONTRADA: 'A nota não foi encontrada no provedor.',
  E_PRAZO_CANCELAMENTO: 'O prazo para cancelar esta nota terminou. Procure o contador.',
  CONFIG: 'A configuração fiscal está incompleta. O administrador precisa completar em Configurações. A nota será enviada automaticamente depois.',
  CERTIFICADO: 'O certificado digital está vencido. O administrador precisa atualizá-lo. A nota será enviada automaticamente depois.',
  COMUNICACAO: 'Sem confirmação da prefeitura no momento. O atendimento está salvo e a nota será enviada automaticamente. Pode liberar o cliente.',
};

export function traduzir(codigo, mensagemOriginal = '') {
  return MENSAGENS[codigo] || (mensagemOriginal ? `A nota foi recusada: ${mensagemOriginal}` : 'A nota foi recusada. Verifique os dados e tente novamente.');
}
