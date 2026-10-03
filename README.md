# RVC — Sistema de Gestão para Lava-Car

Sistema web simples para lava-car/lava-jato com foco em **atendimento rápido** e **emissão confiável de NFS-e**.
Funciona no computador, tablet e celular (navegador).

- Especificação completa (análise, regras, requisitos, riscos): [docs/especificacao-mvp.md](docs/especificacao-mvp.md)

## Situação atual

| Parte | Situação |
|-------|----------|
| Atendimento (placa → serviços → receber), pátio, repetir último, avulso, desconto | ✅ Pronto |
| Recebimento (Dinheiro/PIX/Débito/Crédito/Outro, troco, pagamento dividido) | ✅ Pronto |
| Clientes e veículos, histórico | ✅ Pronto |
| Tabela de preços porte × serviço, portes, usuários (Administrador/Atendente) | ✅ Pronto |
| Relatórios (faturamento, ticket médio, formas de pagamento, descontos, cancelamentos, notas) e CSV | ✅ Pronto |
| Auditoria (descontos, cancelamentos, notas, configurações) | ✅ Pronto |
| **NFS-e: fila, reenvio automático, consulta antes de reenviar, anti-duplicidade, cancelamento, histórico, link/WhatsApp/e-mail** | ✅ Pronto |
| **NFS-e: integração com a prefeitura/provedor real** | ⚠️ **Pendente** — hoje usa um **provedor simulado** (sem valor fiscal) |

### ⚠️ Antes de usar para emitir notas de verdade

O sistema está pronto para **operar e treinar**, mas as notas emitidas hoje são **simuladas**. Para emitir NFS-e válidas é preciso:

1. Responder as dependências da seção 16 da especificação com o **contador** e a **prefeitura** (município, padrão nacional ou provedor municipal, regime, códigos, alíquota, certificado, regras do tomador e de cancelamento).
2. Escolher o meio de integração (intermediador de NFS-e ou API do Padrão Nacional).
3. Implementar o adaptador seguindo `server/nfse/provedores/modelo-integracao.js` (contrato em `base.js`) e registrá-lo em `provedores/index.js`.
4. Testar em **homologação** todos os cenários (sucesso, rejeição, timeout, cancelamento) e só então mudar o ambiente para **Produção**.

Toda a lógica de proteção (fila, consulta antes de reenviar, uma nota ativa por atendimento, numeração da DPS) já está pronta e é independente do provedor.

## Como rodar

Requisito: **Node.js 22.13 ou superior** (usa o SQLite embutido do Node; não precisa instalar banco).

```bash
npm install
npm start
```

Acesse **http://localhost:3000** — usuário `admin`, senha `admin123` (**troque no primeiro acesso**: menu do usuário › Trocar senha).

### Primeiros passos

1. **Configurações › Empresa e fiscal**: razão social, CNPJ, código IBGE do município, código de tributação e alíquota de ISS.
2. **Configurações › Serviços e preços**: ajuste a tabela (já vem com exemplos).
3. **Configurações › Usuários**: crie os atendentes.
4. Na tela **Início**, digite uma placa e tecle Enter.

### Testar os cenários de NFS-e (simulador)

Em **Configurações › Empresa e fiscal › Comportamento do simulador**:

| Modo | O que acontece |
|------|----------------|
| Sempre autoriza | Nota emitida na hora |
| Processa em ~8 s | Nota fica "Processando" e é autorizada automaticamente |
| Timeout | A nota é criada no "provedor", mas a resposta não chega. O sistema consulta antes de reenviar e **não duplica** |
| Rejeita | Nota recusada → "Corrigir dados e reemitir" |
| Fora do ar | Nota fica "Pendente" e é enviada sozinha quando o serviço volta |
| Aleatório | Mistura dos cenários acima |

## Variáveis de ambiente

| Variável | Padrão | Uso |
|----------|--------|-----|
| `PORT` | `3000` | Porta HTTP |
| `DB_PATH` | `data/rvc.db` | Arquivo do banco SQLite |
| `TZ` | `America/Sao_Paulo` | Fuso horário (define o "dia" dos relatórios) |
| `ADMIN_SENHA` | `admin123` | Senha do admin criada no primeiro início |

## Colocando no ar

- Rode atrás de **HTTPS** (ex.: Caddy ou Nginx como proxy reverso) — obrigatório fora da rede local.
- Faça **backup diário** do arquivo `data/rvc.db` (contém atendimentos, notas e XMLs, que precisam ser guardados pelo prazo legal).
- Mantenha um único processo do servidor (a fila de NFS-e roda dentro dele, a cada 5 s).

## Testes

```bash
npm test
```

Cobrem as regras críticas: preço congelado, soma dos pagamentos, emissão, bloqueio de segunda nota ativa, timeout sem duplicidade, indisponibilidade, DPS duplicada, rejeição e reemissão com novo número, processamento assíncrono, configuração incompleta, trava contra envio simultâneo, permissões e prazo de cancelamento.

## Estrutura

```
server/
  index.js            servidor HTTP + link público da nota + início da fila
  api.js              rotas /api
  db.js               schema SQLite e dados iniciais
  auth.js, senha.js   sessão e senhas (scrypt)
  atendimentos.js     regras de atendimento, pagamento e cancelamento
  consultas.js        tela inicial, listas e relatórios
  util.js             validações (placa, CPF, CNPJ inclusive alfanumérico), datas
  nfse/
    servico.js        fila, máquina de estados e proteções anti-duplicidade
    danfse.js         página imprimível da nota
    erros.js          mensagens de erro em linguagem simples
    provedores/       adaptadores (simulado, modelo para integração real)
public/               interface (HTML/CSS/JS sem build)
test/                 testes automatizados (node:test)
docs/                 especificação
```
