// Representação imprimível da NFS-e (página pública acessada pelo link enviado ao cliente).
// Quando o provedor real devolver PDF/link oficial, este documento serve como comprovante auxiliar.
import { formataMoeda, formataDocumento } from '../util.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function danfseHtml(n, emp) {
  const t = JSON.parse(n.tomador || '{}');
  const simulado = emp.provedor === 'simulado';
  const homolog = n.ambiente !== 'PRODUCAO';
  const aviso = simulado ? 'SIMULAÇÃO — DOCUMENTO SEM VALOR FISCAL' : homolog ? 'HOMOLOGAÇÃO — SEM VALOR FISCAL' : '';
  const situacao = { AUTORIZADA: 'Autorizada', CANCELADA: 'CANCELADA', CANCELANDO: 'Cancelamento em andamento' }[n.situacao] || n.situacao;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>NFS-e ${esc(n.numero_nfse)} — ${esc(emp.razao_social)}</title>
<style>
  body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;background:#f3f4f6;color:#111;margin:0;padding:16px}
  .doc{max-width:760px;margin:0 auto;background:#fff;border:1px solid #d1d5db;padding:24px;border-radius:8px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:13px;text-transform:uppercase;color:#4b5563;margin:20px 0 6px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
  .aviso{background:#fef3c7;color:#92400e;font-weight:700;text-align:center;padding:8px;border-radius:6px;margin-bottom:16px}
  .cancelada{background:#fee2e2;color:#991b1b}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px 16px;font-size:14px}
  .rot{color:#6b7280;font-size:12px} .total{font-size:22px;font-weight:700;text-align:right;margin-top:12px}
  .acoes{text-align:center;margin:16px} button{font-size:16px;padding:10px 20px;border-radius:6px;border:0;background:#2563eb;color:#fff;cursor:pointer}
  @media print{body{background:#fff;padding:0}.acoes{display:none}.doc{border:0}}
</style></head><body>
<div class="acoes"><button onclick="print()">Imprimir / salvar PDF</button></div>
<div class="doc">
  ${aviso ? `<div class="aviso">${aviso}</div>` : ''}
  ${n.situacao === 'CANCELADA' ? '<div class="aviso cancelada">NOTA CANCELADA</div>' : ''}
  <h1>Nota Fiscal de Serviço Eletrônica — NFS-e</h1>
  <div class="grid">
    <div><div class="rot">Número</div><strong>${esc(n.numero_nfse)}</strong></div>
    <div><div class="rot">Emissão</div>${esc(n.data_emissao)}</div>
    <div><div class="rot">Código de verificação</div>${esc(n.codigo_verificacao)}</div>
    <div><div class="rot">Situação</div>${esc(situacao)}</div>
    <div><div class="rot">DPS</div>Série ${esc(n.serie_dps)} nº ${n.numero_dps}</div>
    ${n.chave_acesso ? `<div><div class="rot">Chave de acesso</div><small>${esc(n.chave_acesso)}</small></div>` : ''}
  </div>
  <h2>Prestador</h2>
  <div class="grid">
    <div><div class="rot">Razão social</div>${esc(emp.razao_social)}</div>
    <div><div class="rot">CNPJ</div>${esc(formataDocumento(emp.cnpj))}</div>
    <div><div class="rot">Inscrição municipal</div>${esc(emp.inscricao_municipal || '—')}</div>
    <div><div class="rot">Endereço</div>${esc(emp.endereco)} ${esc(emp.municipio)}${emp.uf ? '/' + esc(emp.uf) : ''}</div>
  </div>
  <h2>Tomador</h2>
  <div class="grid">
    <div><div class="rot">Nome / razão social</div>${esc(t.nome || (t.documento ? '—' : 'Consumidor não identificado'))}</div>
    <div><div class="rot">CPF/CNPJ</div>${esc(t.documento ? formataDocumento(t.documento) : '—')}</div>
  </div>
  <h2>Serviço</h2>
  <div class="grid">
    <div><div class="rot">Código do serviço</div>${esc(emp.codigo_servico)}</div>
    <div><div class="rot">Código de tributação</div>${esc(emp.codigo_tributacao)}</div>
  </div>
  <p>${esc(n.discriminacao)}</p>
  <div class="total">Valor do serviço: ${formataMoeda(n.valor)}</div>
  ${n.link_consulta ? `<p><a href="${esc(n.link_consulta)}">Consultar autenticidade no portal oficial</a></p>` : ''}
</div></body></html>`;
}
