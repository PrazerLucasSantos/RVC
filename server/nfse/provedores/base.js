// Contrato que todo provedor de NFS-e deve implementar (adaptador).
//
// emitir(dps, empresa)       -> { resultado: 'AUTORIZADA', nota }
//                              | { resultado: 'PROCESSANDO', protocolo }
//                              | { resultado: 'REJEITADA', codigo, mensagem }
//                              | { resultado: 'DUPLICADA', codigo, mensagem }   (DPS já recebida antes)
// consultar(ref, empresa)    -> { resultado: 'AUTORIZADA', nota } | { resultado: 'PROCESSANDO' }
//                              | { resultado: 'REJEITADA', codigo, mensagem } | { resultado: 'NAO_ENCONTRADA' }
// cancelar(ref, motivo, emp) -> { resultado: 'CANCELADA' } | { resultado: 'NEGADO', codigo, mensagem }
// testarConexao(empresa)     -> { ok: true, mensagem }
//
// nota = { numero, codigo_verificacao, chave_acesso, data_emissao, link_consulta, xml }
// ref  = { serie, numero, referencia, protocolo, chave_acesso, numero_nfse }
//
// Qualquer falha em que NÃO se sabe o que aconteceu do lado do provedor (timeout, queda de
// conexão, HTTP 5xx, resposta ilegível) DEVE lançar ErroComunicacao. O serviço de NFS-e trata
// esse caso como "resultado desconhecido" e consulta antes de qualquer reenvio.

export class ErroComunicacao extends Error {
  constructor(mensagem, detalhe = '') {
    super(mensagem);
    this.detalhe = detalhe;
  }
}
