# Sistema de Gestão para Lava-Car — Proposta Revisada (MVP)

> Documento de análise crítica e especificação funcional.
> Princípio de corte usado em todo o documento:
> **"Isso realmente facilita o atendimento, a gestão ou a emissão da NFS-e?"** Se não, sai do MVP.
>
> Itens marcados com **⚠️ VALIDAR** dependem de legislação municipal, do provedor de NFS-e, do regime tributário ou do contador, e precisam ser confirmados antes do desenvolvimento.

---

## Sumário

1. [Avaliação geral](#1-avaliação-geral)
2. [O que remover](#2-o-que-remover)
3. [O que melhorar](#3-o-que-melhorar)
4. [O que está faltando](#4-o-que-está-faltando)
5. [MVP recomendado](#5-mvp-recomendado)
6. [Funcionalidades futuras](#6-funcionalidades-futuras)
7. [Módulos finais](#7-módulos-finais)
8. [Telas finais](#8-telas-finais)
9. [Fluxo principal revisado](#9-fluxo-principal-revisado)
10. [Fluxo de exceção da NFS-e](#10-fluxo-de-exceção-da-nfs-e)
11. [Regras de negócio](#11-regras-de-negócio)
12. [Requisitos funcionais (MVP)](#12-requisitos-funcionais-mvp)
13. [Modelo conceitual](#13-modelo-conceitual)
14. [Status](#14-status)
15. [Campos por tela](#15-campos-por-tela)
16. [Dependências externas](#16-dependências-externas)
17. [Riscos](#17-riscos)
18. [Anexo — Classificação das funcionalidades em análise](#18-anexo--classificação-das-funcionalidades-em-análise)

---

## 1. Avaliação geral

A proposta inicial está **bem orientada**: o foco em rapidez, a precificação por *tipo de veículo × serviço*, a busca por placa e o botão único "Finalizar e emitir NFS-e" são as decisões certas. A regra de que uma falha de NFS-e não pode derrubar o atendimento é a mais importante do documento.

Os principais problemas encontrados:

| # | Problema | Impacto |
|---|----------|---------|
| 1 | **Cadastros pesados demais para o balcão.** Cliente PF/PJ com muitos campos, veículo com marca/modelo/cor/ano. O atendente vai pular campos ou inventar dados. | Lentidão e dados ruins |
| 2 | **Cliente tratado como obrigatório.** No lava-car, quem identifica o atendimento é o **veículo (placa)**. Cliente só é necessário quando quer nota identificada. | Cliques desnecessários |
| 3 | **Status misturando conceitos.** "Pago" é financeiro, "Em execução" é operacional, "Não emitida" não é status de nota (é ausência de nota). | Estados contraditórios (ex.: "Pago" mas "Cancelado"?) |
| 4 | **Status de NFS-e sem diferenciar "rejeitada" de "resultado desconhecido".** Isso é exatamente o que causa **nota duplicada** em integrações reais. | Risco fiscal |
| 5 | **Dados fiscais espalhados no cadastro de serviço.** Em lava-car, praticamente todos os serviços caem no mesmo código de serviço. Repetir isso em cada serviço gera erro. | Erro de emissão |
| 6 | **Telas demais.** Dashboard, Atendimentos, NFS-e, Clientes e Veículos separados. Dá para reduzir de 10 para 7 telas sem perder nada. | Curva de aprendizado |
| 7 | **Ausências críticas:** certificado digital e vencimento, numeração da DPS/RPS, ambiente de homologação, regra de "uma NFS-e por atendimento", bloqueio de edição após nota emitida, fila de reenvio, auditoria mínima. | Risco operacional e fiscal |
| 8 | **Falta o conceito de "pátio".** Na prática, o carro chega, é registrado, é lavado e só depois é cobrado. O fluxo proposto assume tudo de uma vez. | Fluxo não aderente à realidade |

**Veredito:** a base é boa. A versão revisada fica **menor** em campos, telas e status, e **mais robusta** na NFS-e.

---

## 2. O que remover

| Item removido | Onde estava | Motivo |
|---------------|-------------|--------|
| **Código do serviço digitado pelo usuário** | Serviços | O sistema gera ID interno. Ninguém busca serviço por código num lava-car. |
| **Descrição do serviço** | Serviços | O nome basta. A discriminação da nota é montada a partir dos nomes. |
| **Duração estimada** | Serviços | Só serve para agenda/fila com previsão — fora do MVP. |
| **Código de serviço / tributação no cadastro de cada serviço** | Serviços | Vai para a **Configuração Fiscal** da empresa (um padrão para todos). Ver seção 3. |
| **Quantidade no item** | Atendimento | Sempre 1. Ninguém lava o mesmo carro duas vezes no mesmo atendimento. |
| **Acréscimo** | Atendimento | Substituído por um serviço "Avulso / Adicional" com valor digitável (ex.: sujeira excessiva). Fica rastreável e entra na nota com descrição. |
| **"Responsável" como campo digitado** | Atendimento | O usuário logado é registrado automaticamente. "Lavador responsável" só faz sentido com comissão (futuro). |
| **Marca e ano do veículo** | Veículos | Não influenciam preço nem nota. Substituídos por um único campo livre opcional "Modelo/cor" (ex.: "Virtus prata"). |
| **Nome fantasia do cliente** | Clientes | Não vai na nota. A razão social basta. |
| **Inscrição municipal do tomador como campo padrão** | Clientes | Raramente exigida. Fica como campo opcional dentro de "dados fiscais" e só aparece se o município exigir. ⚠️ VALIDAR |
| **Status "Em execução"** | Atendimento | Para lava-car pequeno/médio, "no pátio" (Aberto) já basta. Ver futuro: "Pronto para retirada". |
| **Status "Pago"** | Atendimento | É informação financeira, não operacional. No MVP, finalizar = receber. |
| **Status "Não emitida"** | NFS-e | Não é status: é a ausência de nota. Exibido como "Sem nota" na lista, sem registro. |
| **Perfil "Operador"** | Usuários | O lavador não precisa usar o sistema no MVP. Dois perfis bastam. |
| **Tela de Permissões** | Configurações | Perfis fixos (Administrador / Atendente). Permissão granular é complexidade sem retorno. |
| **Cadastro de Formas de Pagamento** | Cadastros | Lista fixa (Dinheiro, PIX, Débito, Crédito, Outro) com opção de ocultar. Não precisa de CRUD. |
| **Tela Dashboard separada** | Telas | A tela inicial **é** a tela de trabalho (busca por placa + pátio + pendências + resumo do dia). |
| **Tela NFS-e separada** | Telas | Vira um **filtro** na tela de Atendimentos ("situação da nota") + bloco de pendências na tela inicial. |
| **Tela Veículos separada** | Telas | Veículos ficam dentro de Clientes, e a busca por placa já está na tela inicial. |
| **Parcelamento** | Pagamentos | Quem parcela é a maquininha. O sistema só registra "Crédito". |
| **Pagamento parcial** | Pagamentos | Raro em lava-car e complica o caixa. |

---

## 3. O que melhorar

### 3.1 Precificação: manter a matriz, mas como **grade editável**

A combinação **Porte do veículo × Serviço = Valor** é a melhor modelagem para lava-car: reflete o esforço real, é fácil de entender e cobre 95% dos casos. Alternativas avaliadas:

| Modelo | Avaliação |
|--------|-----------|
| Preço base + multiplicador por porte (ex.: SUV = +40%) | Mais "elegante", porém gera valores quebrados (R$ 48,30) e o dono do lava-car não pensa assim. **Rejeitado.** |
| Preço único por serviço | Não reflete a realidade (SUV dá mais trabalho). **Rejeitado.** |
| **Matriz Porte × Serviço (recomendado)** | Direto, previsível, igual à tabela pendurada na parede do lava-car. |

Melhorias sobre a proposta:

- **Edição em grade única** (linhas = serviços, colunas = portes). O administrador preenche a tabela inteira numa tela, como uma planilha.
- **Opção "mesmo preço para todos os portes"** por serviço (ex.: aromatizante, R$ 10). Um checkbox replica o valor.
- **Célula vazia = serviço indisponível para aquele porte** (ex.: "Lavagem de motor" para moto). O botão não aparece no atendimento.
- **Preço congelado no item**: o valor é copiado para o atendimento no momento da inclusão. Alterar a tabela não muda atendimentos abertos nem passados.
- **Serviço "Avulso"** com valor digitado na hora, para exceções, sem precisar de "acréscimo" genérico.

### 3.2 Tipos de veículo → **Porte**

O que define preço não é a carroceria, é o **tamanho/esforço**. Um Corolla Cross (SUV compacto) e um sedã médio dão trabalho parecido; uma caminhonete grande, não. Recomendação:

- Chamar o cadastro de **Porte** (ou "Categoria de preço").
- Sugestão inicial (editável pelo admin): **Moto · Pequeno (hatch) · Médio (sedã, SUV compacto) · Grande (SUV, picape média) · Extra grande (picape grande, van)**.
- Cada porte tem um campo de **exemplos** ("Gol, Onix, HB20") exibido como dica no momento de escolher, para o atendente não errar.
- Mantém criar/editar/ativar/inativar. Não exclui se já houver uso.

> Na prática, o dono pode manter os nomes "Hatch / Sedan / SUV / Caminhonete / Van" se preferir — o importante é o conceito: **é uma categoria de preço**, não uma ficha técnica.

### 3.3 Dados fiscais: separar do cadastro de serviço

- **Configuração Fiscal da empresa** (uma vez só): regime tributário, código de serviço (LC 116), código de tributação nacional/municipal, alíquota de ISS, CNAE, certificado, série/numeração, ambiente.
- **Serviço não carrega dados fiscais no MVP.** Todos usam o padrão da empresa. Em lava-car, os serviços normalmente se enquadram no mesmo item da lista de serviços (provavelmente **subitem 14.01 da LC 116/2003** — limpeza/conservação de veículos). ⚠️ VALIDAR com o contador.
- **Futuro:** permitir que um serviço específico tenha "perfil fiscal próprio" (ex.: se o lava-car vender algo enquadrado em outro código).

Isso importa porque **uma NFS-e normalmente comporta um único código de serviço** (no Padrão Nacional, a DPS possui um único código de tributação). Com todos os serviços no mesmo código, um atendimento com vários serviços gera **uma nota**, com a discriminação listando os itens. ⚠️ VALIDAR no padrão do município.

### 3.4 Cliente: **opcional** e progressivo

- **Atendimento não exige cliente.** Exige placa e porte.
- Cliente tem **um único campo de documento** (CPF ou CNPJ, detectado pelo tamanho) em vez de dois formulários PF/PJ.
- Dados são pedidos **somente quando necessários**:
  - Só para contato/histórico: nome + telefone (opcionais).
  - Nota para pessoa física: CPF (e nome, se o padrão exigir). ⚠️ VALIDAR se a nota pode sair **sem tomador identificado** (consumidor final).
  - Nota para empresa: CNPJ + razão social + endereço (se exigido). ⚠️ VALIDAR.
- A pergunta "CPF/CNPJ na nota?" aparece **no recebimento**, igual ao supermercado — o atendente já está acostumado com essa lógica.

### 3.5 Veículo: mínimo indispensável

- **Placa** (chave de busca), **porte** (define preço), **modelo/cor** (texto livre opcional), **cliente habitual** (opcional).
- Placa normalizada: maiúsculas, sem hífen, aceita padrão antigo (ABC1234) e Mercosul (ABC1D23).
- O cliente **do atendimento** (tomador da nota) é registrado no atendimento, porque o mesmo carro pode ser trazido por pessoas diferentes (ex.: carro da empresa). O veículo só guarda o "cliente habitual" como sugestão.

### 3.6 Atendimento: menos campos, com "fotografia" dos dados

Campos que ficam: número, abertura/fechamento (automáticos), veículo, **porte no momento do atendimento**, cliente (opcional), itens com valor congelado, desconto, total, pagamentos, observação, status, usuário que abriu/finalizou, NFS-e vinculada.

### 3.7 Status separados por domínio

Atendimento, pagamento e NFS-e têm ciclos de vida diferentes e **não devem compartilhar um campo de status**. Detalhe na [seção 14](#14-status).

### 3.8 Fluxo com "pátio"

Dois caminhos na mesma tela, sem configuração:

- **Rápido (cliente espera):** placa → serviços → receber → nota. Tudo de uma vez.
- **Com pátio (cliente deixa o carro):** placa → serviços → **Salvar** (carro vai para "No pátio") → depois, na retirada: tocar no carro → **Receber** → nota.

### 3.9 Tela inicial = tela de trabalho

Em vez de um dashboard decorativo, a tela inicial mostra o que o atendente precisa agir: campo de placa grande, lista do pátio, notas com problema e um resumo do dia. Detalhe na [seção 8](#8-telas-finais).

### 3.10 Envio da nota: WhatsApp por link, sem integração

Botão "Enviar por WhatsApp" abre o WhatsApp com mensagem pronta e o **link do PDF/consulta da nota** (`wa.me/<telefone>?text=...`). Custo zero, sem API paga, resolve 90% da necessidade. Integração oficial com WhatsApp fica para o futuro.

### 3.11 Arquitetura: integrar via **intermediador de NFS-e** atrás de um adaptador

Integrar diretamente com cada prefeitura é o maior risco técnico do projeto. Recomendação de arquiteto:

- Usar uma **API intermediária de NFS-e** (gateways comerciais que já abstraem municípios e o Padrão Nacional, com webhook de retorno e referência idempotente). ⚠️ VALIDAR cobertura do município e custo por nota.
- No código, isolar a integração em um **adaptador** (`ProvedorNFSe`: emitir, consultar, cancelar, baixar PDF/XML). Trocar de provedor ou ir direto ao Padrão Nacional não afeta o resto do sistema.
- Emissão sempre **assíncrona** com fila e reprocessamento (padrão *outbox*), nunca dentro da mesma transação que grava o atendimento.
- Aplicação **web responsiva** (PWA), funcionando em computador, tablet e celular, com um único backend e banco relacional (ex.: PostgreSQL).

---

## 4. O que está faltando

| # | Item faltante | Por que é importante | Classificação |
|---|---------------|----------------------|---------------|
| 1 | **Uma NFS-e ativa por atendimento** (restrição no banco) | Barreira definitiva contra duplicidade | MVP |
| 2 | **Numeração própria da DPS/RPS, reaproveitada nos reenvios** | É o mecanismo real de idempotência junto ao provedor | MVP |
| 3 | **Status "resultado desconhecido"** (timeout) separado de "rejeitada" | Sem isso, o reenvio gera nota em dobro | MVP |
| 4 | **Bloqueio de edição após nota autorizada** | Valores do atendimento e da nota não podem divergir | MVP |
| 5 | **Fila de reprocessamento automático** com consulta antes de reenviar | Recupera falhas de rede sem intervenção | MVP |
| 6 | **Certificado digital: upload, validação e alerta de vencimento** | Certificado vencido para a emissão inteira | MVP ⚠️ VALIDAR se aplicável |
| 7 | **Ambiente de homologação × produção** (chave na configuração) | Testar sem gerar nota real | MVP |
| 8 | **Tradução de mensagens de erro do provedor** | "E0312 – cTribNac inválido" não ajuda o atendente | MVP |
| 9 | **Auditoria mínima** (quem cancelou, quem deu desconto, quem reenviou nota) | Controle sobre funcionários e defesa fiscal | MVP |
| 10 | **Cancelamento de atendimento com motivo** e reversão do pagamento | Sem isso o caixa não fecha | MVP |
| 11 | **Troco** (valor recebido em dinheiro → troco calculado) | Muito usado no balcão | MVP |
| 12 | **Pagamento dividido** (ex.: parte dinheiro, parte PIX) | Situação comum no balcão | MVP (opcional na tela, não no fluxo padrão) |
| 13 | **Configuração "emitir nota automaticamente ao finalizar"** | Alguns estabelecimentos emitem sempre; outros só sob demanda ⚠️ VALIDAR obrigatoriedade municipal | MVP |
| 14 | **Discriminação da nota gerada automaticamente** a partir dos itens e da placa | Evita digitação e padroniza | MVP |
| 15 | **Prazo de cancelamento visível** na nota | Evita tentar cancelar fora do prazo ⚠️ VALIDAR | MVP |
| 16 | **Tratamento de desconto na nota** (valor líquido vs. desconto incondicionado) | Afeta base de cálculo do ISS ⚠️ VALIDAR | MVP |
| 17 | **Atendimento a receber (fiado / faturado para empresas)** | Frotas e clientes fixos pagam no fim do mês | Futuro (v1.1) |
| 18 | **LGPD básica**: CPF só quando necessário, sem exposição em listas, acesso por perfil | Obrigação legal | MVP |
| 19 | **Backup e retenção dos XMLs** | Guarda fiscal obrigatória por anos ⚠️ VALIDAR prazo | MVP |
| 20 | **Consulta automática de CNPJ** (preenche razão social e endereço) | Reduz digitação para PJ | Futuro |

---

## 5. MVP recomendado

O MVP deve permitir que um lava-car **opere o dia inteiro e emita todas as notas** sem depender de planilha ou papel.

**Atendimento**
- Busca por placa (campo principal), com busca alternativa por nome/telefone/CPF-CNPJ.
- Cadastro rápido de veículo na própria tela (placa + porte).
- Seleção de serviços por botões com preço já calculado pelo porte.
- "Repetir último atendimento" (1 toque).
- Serviço avulso com valor digitado.
- Desconto (R$ ou %) no total.
- Salvar no pátio ou receber direto.
- Observação livre.
- Cancelamento com motivo.

**Recebimento**
- Formas: Dinheiro, PIX, Débito, Crédito, Outro.
- Troco para dinheiro.
- Pagamento dividido (opcional).
- "CPF/CNPJ na nota?" no próprio recebimento.

**NFS-e**
- Emissão automática ao finalizar (configurável) ou manual depois.
- Processamento assíncrono com fila, reprocessamento automático e consulta antes de reenviar.
- Proteções contra duplicidade (seção 10).
- Armazenamento de número, código de verificação, chave/protocolo, XML, PDF/link e histórico de tentativas.
- Visualizar/imprimir PDF, enviar por e-mail e por WhatsApp (link).
- Cancelamento dentro do prazo, com motivo.
- Mensagens de erro em linguagem simples + ação sugerida.
- Configuração fiscal da empresa, certificado (se aplicável), homologação/produção.

**Gestão**
- Tela inicial com pátio, pendências de nota e resumo do dia.
- Histórico por veículo/cliente.
- Relatório por período: faturamento, quantidade, ticket médio, por forma de pagamento, descontos, cancelamentos, situação das notas.

**Administração**
- Serviços e tabela de preços (grade).
- Portes de veículo.
- Usuários com 2 perfis: Administrador e Atendente.
- Dados da empresa e configuração fiscal.

---

## 6. Funcionalidades futuras

Ordenadas por valor esperado.

| Prioridade | Funcionalidade | Justificativa |
|-----------|----------------|---------------|
| v1.1 | **Atendimento a receber (fiado/faturado)** com baixa posterior | Comum com frotas, locadoras e clientes fixos |
| v1.1 | **Fechamento de caixa formal** (valor contado × esperado, diferença registrada) | Controle de dinheiro em espécie com funcionários |
| v1.1 | **Status "Pronto para retirada"** + aviso por WhatsApp | Útil quando o pátio fica cheio |
| v1.1 | **Consulta de CNPJ automática** | Agiliza cadastro de PJ |
| v1.2 | **Pacotes / planos mensais** (ex.: 4 lavagens/mês) | Receita recorrente; exige controle de saldo e regra fiscal própria ⚠️ VALIDAR momento da emissão |
| v1.2 | **Comissão por lavador** | Exige registrar quem lavou; só quando o dono pedir |
| v1.2 | **Fidelidade simples** (a cada N lavagens, 1 grátis) | Barato de implementar depois que há histórico |
| v1.2 | **Limite de desconto por perfil** | Controle extra se houver abuso |
| v1.3 | **Agendamento** | Útil para estética automotiva (polimento, higienização); pouco útil para lavagem rápida |
| v1.3 | **Fotos antes/depois** | Protege contra reclamação de avaria; exige armazenamento |
| v1.3 | **Integração oficial WhatsApp (API)** para envio automático | Custo por mensagem; o link `wa.me` resolve no MVP |
| v1.3 | **Perfil fiscal por serviço** | Só se surgir serviço com código tributário diferente |
| v1.3 | **Substituição de NFS-e** (quando o padrão permitir) | Alternativa ao cancelar + reemitir ⚠️ VALIDAR |
| v2 | **Multiempresa / multiunidade** | Só se virar produto para várias lojas |
| v2 | **Modo offline** | Complexo; o mais barato é internet móvel de contingência |

---

## 7. Módulos finais

Cinco módulos, em vez de dez áreas:

```
┌────────────────────────────────────────────────────────────────┐
│ 1. ATENDIMENTO (núcleo)                                        │
│    busca por placa · pátio · itens · desconto · recebimento    │
├────────────────────────────────────────────────────────────────┤
│ 2. NFS-e                                                       │
│    emissão assíncrona · fila · consulta · cancelamento ·       │
│    PDF/XML · envio · histórico de tentativas · adaptador       │
├────────────────────────────────────────────────────────────────┤
│ 3. CLIENTES E VEÍCULOS                                         │
│    cadastro mínimo · histórico · repetir último                │
├────────────────────────────────────────────────────────────────┤
│ 4. RELATÓRIOS                                                  │
│    resumo do dia · período · formas de pagamento · notas       │
├────────────────────────────────────────────────────────────────┤
│ 5. CONFIGURAÇÕES                                               │
│    serviços e preços · portes · empresa e fiscal ·             │
│    certificado · usuários                                      │
└────────────────────────────────────────────────────────────────┘
```

Arquitetura lógica:

```
[Navegador / PWA] ──HTTPS──> [API do sistema] ──> [Banco relacional]
                                   │
                                   └─> [Fila de NFS-e (outbox)] ──> [Worker]
                                                                       │
                                            [Adaptador ProvedorNFSe] <─┘
                                                       │
                                    [Intermediador ou Padrão Nacional / Prefeitura]
                                                       │
                                            (webhook / consulta de retorno)
```

---

## 8. Telas finais

**7 telas** (+ modais). Menu lateral (desktop) ou inferior (celular) com 5 itens: **Início · Atendimentos · Clientes · Relatórios · Configurações**.

| # | Tela | Objetivo | Quem acessa |
|---|------|----------|-------------|
| 1 | **Login** | Entrar com usuário e senha. Sessão longa no dispositivo do balcão para não pedir login toda hora. | Todos |
| 2 | **Início** | Ponto de partida de tudo. Campo grande "Digite a placa" com foco automático; lista **No pátio** (atendimentos abertos, toque para receber); bloco **Notas com pendência** (rejeitadas/pendentes, com botão "Resolver"); **Resumo do dia** (atendimentos, faturamento, ticket médio, notas emitidas). | Todos (valores do dia só Admin, opcional) |
| 3 | **Atendimento** | Tela única para abrir, editar, receber, emitir nota e ver o resultado. Também é a tela de detalhe de um atendimento já finalizado (com ações da nota: ver PDF, enviar, cancelar, reenviar). | Todos |
| 3a | ↳ *Modal Recebimento* | Forma de pagamento, troco, divisão, CPF/CNPJ na nota, botão **Finalizar e emitir NFS-e**. | Todos |
| 3b | ↳ *Painel Resultado da Nota* | Sucesso (número + Imprimir / PDF / WhatsApp / E-mail), processando ou erro com ação sugerida. | Todos |
| 4 | **Atendimentos** | Lista com filtros: período, placa/cliente, status do atendimento, **situação da nota** (substitui a tela "NFS-e"). Exportar CSV. | Todos (Atendente: só do dia, opcional) |
| 5 | **Clientes** | Busca por nome/telefone/documento/placa; ficha do cliente com seus veículos e histórico. Edição de veículo (placa, porte, modelo) acontece aqui. | Todos |
| 6 | **Relatórios** | Período: faturamento, quantidade, ticket médio, por forma de pagamento, por serviço, descontos, cancelamentos, notas por situação. | Admin |
| 7 | **Configurações** | Abas: **Serviços e preços** (grade) · **Portes** · **Empresa e fiscal** (dados, regime, códigos, alíquota, certificado, série, ambiente, emissão automática) · **Usuários**. | Admin |

---

## 9. Fluxo principal revisado

A sequência proposta (Cliente/Veículo → Serviço → Preço → Pagamento → NFS-e → Finalização) foi ajustada em três pontos:

1. **Começa pela placa, não pelo cliente.**
2. **Preço não é um passo** — aparece junto do serviço.
3. **Finalização acontece antes da NFS-e**, não depois. O atendimento e o pagamento são gravados primeiro; a nota vem em seguida, de forma assíncrona. Assim, uma falha de nota **nunca** desfaz o atendimento.

### Fluxo revisado

```
PLACA ──> SERVIÇOS (com preço) ──> [Salvar no pátio]* ──> RECEBER ──> FINALIZADO ──> NFS-e
                                                                       (gravado)      (assíncrona)
```

**Passo a passo (cliente que já veio antes — caso mais comum):**

| # | Ação do atendente | O que o sistema faz |
|---|-------------------|---------------------|
| 1 | Digita `ABC1D23` + Enter na tela inicial | Encontra veículo; mostra modelo, porte, cliente habitual e **chips dos últimos serviços** |
| 2 | Toca **"Repetir último"** ou toca os serviços | Adiciona itens com preço do porte; total atualiza na hora |
| 3a | *(cliente vai esperar)* Toca **Receber** | Abre o modal de recebimento |
| 3b | *(cliente deixa o carro)* Toca **Salvar** | Atendimento fica "No pátio"; volta à tela inicial |
| 4 | Escolhe forma de pagamento (botões grandes); CPF/CNPJ já vem preenchido se o cliente tiver | Calcula troco se for dinheiro |
| 5 | Toca **FINALIZAR E EMITIR NFS-e** | Valida → grava pagamento e finaliza (transação única) → enfileira nota → aguarda retorno por até ~15 s |
| 6 | Vê o resultado | Sucesso: número da nota + Imprimir / PDF / WhatsApp / E-mail. Demora: "Atendimento finalizado. A nota está sendo processada — pode liberar o cliente." |

**Total: 4 a 5 toques** para cliente recorrente.

**Veículo novo:** no passo 1, a placa não é encontrada → a mesma tela mostra os botões de **porte** (com exemplos) e um campo opcional "Modelo/cor". Escolher o porte libera os serviços. O veículo é gravado junto com o atendimento — não há tela de cadastro separada. **+1 toque.**

**Validações no passo 5 (antes de gravar):**
- Pelo menos 1 item; total ≥ 0; soma dos pagamentos = total.
- Se a nota vai ser emitida: dados mínimos do tomador conforme o tipo (CPF válido; CNPJ válido + razão social + endereço, se exigidos) e configuração fiscal completa. Se faltar algo do tomador, o modal pede **somente o campo que falta**, na hora.
- Se a configuração fiscal/certificado estiver com problema, o atendimento é finalizado normalmente e a nota fica **Pendente** com aviso claro ao Admin (o balcão não para).

---

## 10. Fluxo de exceção da NFS-e

### 10.1 Princípios de proteção

1. **Atendimento e pagamento são gravados antes e independentemente da nota** (transação própria). A nota é um registro separado, vinculado ao atendimento.
2. **Uma NFS-e ativa por atendimento**: restrição única no banco para `atendimento_id` onde situação ∈ {Pendente, Processando, Autorizada, Cancelando}.
3. **Número da DPS/RPS reservado uma única vez** por tentativa lógica e **reutilizado em todo reenvio** até haver resposta definitiva. O provedor rejeita DPS repetida (mesmo emitente + série + número), o que transforma o reenvio em operação idempotente. Com intermediador, usa-se a **referência única** do atendimento (ex.: `ATD-000123`) pelo mesmo motivo. ⚠️ VALIDAR o comportamento do provedor.
4. **Resultado desconhecido nunca gera nova emissão às cegas**: primeiro **consulta**; só reenvia se a consulta confirmar que a nota não existe.
5. **Novo número de DPS só após rejeição definitiva** (o provedor confirmou que não criou nota).
6. **Atendimento com nota autorizada fica bloqueado** para edição de itens, valores e tomador. Corrigir = cancelar nota (e reemitir) ou cancelar o atendimento.
7. **Tudo é registrado** em `NFSeTentativa`: data/hora, usuário/sistema, operação, payload enviado, resposta bruta, código e mensagem.
8. **Fila com reprocessamento automático** (backoff: 1 min, 5 min, 15 min, 1 h, depois a cada 6 h) apenas para falhas de comunicação. Rejeição de dados não é reprocessada automaticamente.
9. **Worker com trava por nota** (lock) para que dois processos nunca enviem a mesma nota ao mesmo tempo; botão "Tentar novamente" desabilitado enquanto há envio em curso.

### 10.2 Cenários

| Cenário | O que acontece | Situação da nota | O que o usuário vê | Ação disponível |
|---------|---------------|------------------|--------------------|-----------------|
| **Emissão bem-sucedida** | Provedor autoriza. Sistema grava número, código de verificação, chave/protocolo, XML, link/PDF, data de emissão. | **Autorizada** | "NFS-e nº 1234 emitida." + Imprimir / PDF / WhatsApp / E-mail | Enviar, imprimir, cancelar (no prazo) |
| **Timeout** (enviado, sem resposta) | Resultado desconhecido. Worker **consulta** pela DPS/referência. Se existir → Autorizada. Se não existir → reenvia **com o mesmo número**. Se consulta também falhar → fila. | **Pendente** (motivo: aguardando confirmação) | "Atendimento finalizado. A nota está sendo processada. Pode liberar o cliente." | Nenhuma ação obrigatória; Admin vê em Pendências |
| **Erro do provedor** (HTTP 5xx, falha interna) | Tratado como resultado desconhecido (igual timeout). | **Pendente** | Igual ao timeout | Reprocessamento automático; "Tentar agora" |
| **Nota processando** (provedor assíncrono, lote/protocolo) | Sistema guarda protocolo e consulta periodicamente ou aguarda webhook. | **Processando** | "Nota em processamento na prefeitura." | Aguardar; "Consultar agora" |
| **Nota rejeitada** (erro de dados/regras) | Provedor confirma que **não** gerou nota. Mensagem traduzida + campo provável. | **Rejeitada** | Ex.: "CPF do cliente inválido. Corrija e emita novamente." | **Corrigir e reemitir** (gera nova tentativa com novo número de DPS) ou **Dispensar nota** (Admin, com motivo ⚠️ VALIDAR se permitido) |
| **Duplicidade detectada pelo provedor** ("DPS/RPS já informada") | Significa que a nota provavelmente já existe. Sistema **consulta** e, se encontrar, vincula a nota existente. | **Autorizada** (após consulta) | Transparente para o usuário | — |
| **Duplicidade tentada pelo usuário** (clique duplo, duas abas) | Botão desabilitado após 1º clique + restrição única no banco + idempotência por chave do atendimento na API. | Inalterada | "Esta nota já está sendo emitida." | — |
| **Tentativa de reemissão manual** | Permitida só em **Rejeitada** ou **Pendente**. Em Pendente, executa **consulta antes** de reenviar. Em Autorizada/Processando, botão não existe. | Conforme resultado | Resultado da tentativa | — |
| **Cancelamento** | Admin (ou Atendente, se configurado) informa motivo → sistema verifica prazo → envia evento de cancelamento. Confirmado → Cancelada. Fora do prazo → bloqueia e orienta (procedimento junto à prefeitura/contador). | **Cancelando** → **Cancelada** (ou volta para Autorizada se negado, com mensagem) | "Nota cancelada." / "Prazo de cancelamento expirado. Procure o contador." | Após cancelada: reemitir nova nota (se o atendimento continua válido) ou cancelar o atendimento |
| **Indisponibilidade temporária** (provedor/prefeitura fora do ar, sem internet) | Atendimento finaliza normalmente; nota entra na fila como Pendente. Banner discreto: "Emissão de notas temporariamente indisponível — as notas serão emitidas automaticamente." | **Pendente** | Banner + contador de pendentes na tela inicial | Automático; alerta ao Admin se pendente > X horas ⚠️ VALIDAR prazo legal para emissão posterior |
| **Configuração fiscal/certificado inválido ou vencido** | Nenhuma nota é enviada; todas ficam Pendentes; alerta vermelho para o Admin. | **Pendente** (motivo: configuração) | Atendente: "Nota pendente." Admin: "Certificado vencido em 10/10. Atualize em Configurações." | Após corrigir, fila reprocessa automaticamente |
| **Cancelamento do atendimento com nota autorizada** | Exige cancelar a nota primeiro (o sistema faz em sequência). O atendimento só fica Cancelado após a nota ser Cancelada. | Cancelando → Cancelada | Confirmação: "Isto vai cancelar a NFS-e nº 1234. Confirmar?" | — |
| **Cancelamento do atendimento com nota Pendente/Processando** | Bloqueado até a situação ser resolvida (consulta), para não deixar nota órfã. | — | "Aguarde o retorno da nota para cancelar." | "Consultar agora" |

### 10.3 Máquina de estados da NFS-e

```
             (enfileirar)
  [sem nota] ───────────> PENDENTE ──(envio aceito c/ protocolo)──> PROCESSANDO
                            │  ▲                                        │
       (timeout/5xx/offline)│  │(consulta: não existe → reenvia mesmo nº)│
                            ▼  │                                        │
                          (fila) ◄──────────(consulta sem resposta)─────┤
                            │                                           │
                            ├──(autorizada)──────────────> AUTORIZADA <─┤
                            │                                  │        │
                            └──(rejeitada)──> REJEITADA        │        └─(rejeitada)─> REJEITADA
                                                  │            │
                         (corrigir e reemitir: nova tentativa) │ (solicitar cancelamento)
                                                  ▼            ▼
                                              PENDENTE     CANCELANDO ──(confirmado)──> CANCELADA
                                                               │
                                                               └─(negado)──> AUTORIZADA
```

---

## 11. Regras de negócio

### Atendimento
- **RN001** — Todo atendimento exige **placa** e **porte**. Cliente é opcional.
- **RN002** — Placa é armazenada normalizada (maiúsculas, sem hífen/espaço) e deve seguir o padrão antigo (`AAA9999`) ou Mercosul (`AAA9A99`).
- **RN003** — Uma placa corresponde a um único veículo cadastrado.
- **RN004** — O porte do veículo é copiado para o atendimento na abertura. Alterar o porte do veículo depois não altera atendimentos existentes.
- **RN005** — O preço do item é obtido da tabela **Serviço × Porte** e congelado no item no momento da inclusão.
- **RN006** — Serviço sem preço cadastrado para o porte não é exibido para seleção.
- **RN007** — O serviço "Avulso" exige descrição e valor digitados.
- **RN008** — Total = soma dos itens − desconto. O total nunca pode ser negativo.
- **RN009** — O desconto pode ser em R$ ou %, é aplicado sobre o total e fica registrado com o usuário que o concedeu.
- **RN010** — Um atendimento só pode ser finalizado com pelo menos um item e com a soma dos pagamentos igual ao total.
- **RN011** — Atendimento Aberto pode ser editado livremente. Atendimento Finalizado **não** tem itens ou valores alterados (o pagamento já foi registrado); para corrigir, o Administrador cancela e abre outro. Os dados do cliente na nota só podem ser corrigidos quando não há nota ativa (para reemitir após rejeição ou cancelamento).
- **RN012** — Cancelar um atendimento exige motivo e registra usuário e data/hora. O pagamento associado é estornado logicamente (sai do faturamento, aparece em cancelamentos).
- **RN013** — Cancelar atendimento Finalizado é permitido apenas ao Administrador.
- **RN014** — Atendimento com NFS-e Autorizada só é cancelado após a NFS-e ser cancelada com sucesso.
- **RN015** — Atendimento com NFS-e Pendente ou Processando não pode ser cancelado até a situação da nota ser definida.
- **RN016** — A numeração do atendimento é sequencial e nunca reutilizada.
- **RN017** — O número de atendimentos abertos (no pátio) não tem limite; atendimentos abertos há mais de 24 h são destacados.

### Pagamento
- **RN018** — Formas de pagamento disponíveis: Dinheiro, PIX, Débito, Crédito, Outro. O Administrador pode ocultar formas não usadas.
- **RN019** — Um atendimento pode ter mais de um pagamento (forma diferente); a soma deve ser igual ao total.
- **RN020** — Para Dinheiro, o valor recebido pode ser maior que o devido; o sistema calcula o troco e registra apenas o valor devido como recebido.
- **RN021** — Não há pagamento parcial nem parcelamento no MVP.

### NFS-e
- **RN022** — Cada atendimento pode ter **no máximo uma NFS-e ativa** (Pendente, Processando, Autorizada ou Cancelando).
- **RN023** — A NFS-e é solicitada **depois** de o atendimento e o pagamento estarem gravados. Falha na nota nunca desfaz atendimento ou pagamento.
- **RN024** — Quando a configuração "emissão automática" estiver ligada, a nota é solicitada ao finalizar. Desligada, a emissão é manual pelo botão "Emitir NFS-e".
- **RN025** — O valor da NFS-e é o total do atendimento. O tratamento do desconto (valor líquido ou desconto incondicionado) segue a configuração fiscal. ⚠️ VALIDAR
- **RN026** — A discriminação do serviço é gerada automaticamente: lista de serviços + modelo e placa do veículo (ex.: "Lavagem completa; Cera — VW Virtus, placa ABC1D23").
- **RN027** — Todos os itens usam o código de serviço e tributação padrão da empresa. ⚠️ VALIDAR enquadramento
- **RN028** — O número da DPS/RPS é sequencial por série, controlado pelo sistema, reservado por tentativa e **reutilizado em reenvios** até resposta definitiva.
- **RN029** — Em caso de resultado desconhecido (timeout, erro 5xx, queda de conexão), o sistema deve **consultar** a nota antes de qualquer reenvio.
- **RN030** — Um novo número de DPS só é gerado após rejeição definitiva confirmada pelo provedor.
- **RN031** — Reemissão manual é permitida apenas para notas Rejeitadas (após correção) ou Pendentes (com consulta prévia).
- **RN032** — Cancelamento de NFS-e exige motivo, respeita o prazo configurado/legal e é permitido ao Administrador (e ao Atendente apenas se habilitado). ⚠️ VALIDAR prazo e regras
- **RN033** — Dados mínimos do tomador: sem identificação (se permitido pelo município) ⚠️ VALIDAR; PF = CPF válido (+ nome se exigido); PJ = CNPJ válido + razão social (+ endereço/inscrição municipal se exigidos). ⚠️ VALIDAR
- **RN034** — Toda tentativa de emissão, consulta e cancelamento é registrada com requisição, resposta, usuário e data/hora.
- **RN035** — XML e dados da nota autorizada são armazenados pelo prazo legal de guarda. ⚠️ VALIDAR prazo (usualmente 5 anos)
- **RN036** — O sistema só emite em produção quando o ambiente estiver explicitamente configurado como "Produção"; caso contrário, emite em homologação e marca a nota como "TESTE".
- **RN037** — O Administrador é alertado 30, 15 e 1 dia(s) antes do vencimento do certificado digital (se aplicável).

### Cadastros e acesso
- **RN038** — Serviços, portes e usuários não são excluídos se já tiverem sido usados; são inativados.
- **RN039** — CPF/CNPJ são validados pelo dígito verificador e são únicos por cliente.
- **RN040** — Perfis: **Administrador** (acesso total) e **Atendente** (atendimento, recebimento, clientes, emissão e reenvio de nota; sem relatórios de período, configurações, cancelamento de atendimento finalizado ou cancelamento de nota — salvo se habilitado).
- **RN041** — Documentos (CPF/CNPJ) são exibidos mascarados em listagens.

---

## 12. Requisitos funcionais (MVP)

### Acesso
- **RF001** — Autenticar usuário com login e senha, mantendo sessão no dispositivo.
- **RF002** — Gerenciar usuários (criar, editar, inativar, redefinir senha) com perfil Administrador ou Atendente.

### Configurações
- **RF003** — Manter dados da empresa (razão social, CNPJ, inscrição municipal, endereço, telefone, e-mail, logotipo opcional).
- **RF004** — Manter configuração fiscal: regime tributário, códigos de serviço/tributação, alíquota de ISS, CNAE (se exigido), série e próximo número da DPS/RPS, tratamento do desconto, emissão automática (sim/não), ambiente (homologação/produção), credenciais do provedor.
- **RF005** — Enviar e validar certificado digital (quando aplicável), exibindo titular e validade.
- **RF006** — Testar a conexão com o provedor de NFS-e a partir da configuração.
- **RF007** — Manter portes de veículo (nome, exemplos, ordem, ativo).
- **RF008** — Manter serviços (nome, ativo, ordem de exibição, "avulso" sim/não).
- **RF009** — Manter tabela de preços em grade Serviço × Porte, com opção "mesmo preço para todos os portes".
- **RF010** — Ativar/ocultar formas de pagamento da lista fixa.

### Atendimento
- **RF011** — Buscar veículo por placa (campo com foco automático na tela inicial), com busca alternativa por nome, telefone ou CPF/CNPJ do cliente.
- **RF012** — Cadastrar veículo na própria tela de atendimento quando a placa não existir (placa, porte, modelo/cor opcional).
- **RF013** — Exibir, ao localizar o veículo, cliente habitual, porte e os últimos serviços realizados.
- **RF014** — Repetir os serviços do último atendimento do veículo com um toque.
- **RF015** — Adicionar e remover serviços por botões, exibindo o preço do porte e atualizando o total em tempo real.
- **RF016** — Adicionar serviço avulso com descrição e valor.
- **RF017** — Aplicar desconto em R$ ou %.
- **RF018** — Vincular ou cadastrar rapidamente o cliente do atendimento (nome, telefone, CPF/CNPJ).
- **RF019** — Registrar observação livre no atendimento.
- **RF020** — Salvar atendimento como Aberto (no pátio).
- **RF021** — Listar atendimentos abertos (pátio) na tela inicial, com acesso direto ao recebimento.
- **RF022** — Receber pagamento com uma ou mais formas, cálculo de troco e validação da soma.
- **RF023** — Solicitar/confirmar CPF/CNPJ para a nota no recebimento, pedindo apenas dados faltantes do tomador.
- **RF024** — Finalizar atendimento gravando pagamento e status em transação única.
- **RF025** — Cancelar atendimento com motivo, respeitando as regras de nota vinculada.

### NFS-e
- **RF026** — Enfileirar a emissão da NFS-e ao finalizar (se automática) ou por ação manual.
- **RF027** — Processar a fila de forma assíncrona com reprocessamento automático, consulta prévia em resultado desconhecido e trava por nota.
- **RF028** — Exibir o resultado da emissão ao usuário, aguardando o retorno por tempo limitado e informando quando a nota seguir em processamento.
- **RF029** — Armazenar número, código de verificação, chave/protocolo, data de emissão, XML, link/PDF e situação da nota.
- **RF030** — Registrar o histórico de tentativas (envio, consulta, cancelamento) com requisição e resposta.
- **RF031** — Traduzir códigos de erro do provedor em mensagens simples com ação sugerida.
- **RF032** — Permitir corrigir dados e reemitir nota Rejeitada; permitir "tentar agora" para nota Pendente.
- **RF033** — Consultar a situação de uma nota no provedor sob demanda.
- **RF034** — Cancelar NFS-e com motivo, verificando o prazo.
- **RF035** — Visualizar/imprimir o PDF (DANFSe) e baixar o XML.
- **RF036** — Enviar a nota por e-mail e por WhatsApp (link com mensagem pré-preenchida).
- **RF037** — Receber retorno assíncrono do provedor (webhook) quando disponível.
- **RF038** — Alertar o Administrador sobre notas pendentes há mais de X horas e sobre vencimento do certificado.

### Consulta e relatórios
- **RF039** — Listar atendimentos com filtros por período, placa/cliente, status do atendimento e situação da nota.
- **RF040** — Exibir histórico de atendimentos por veículo e por cliente.
- **RF041** — Exibir resumo do dia na tela inicial: quantidade, faturamento, ticket médio, notas emitidas, pendentes e rejeitadas.
- **RF042** — Gerar relatório por período: faturamento, quantidade, ticket médio, totais por forma de pagamento, por serviço, descontos concedidos, cancelamentos e notas por situação.
- **RF043** — Exportar listas e relatórios em CSV.

### Auditoria
- **RF044** — Registrar usuário e data/hora em: abertura, finalização, desconto, alteração após finalização, cancelamento de atendimento, emissão, reemissão e cancelamento de nota.

---

## 13. Modelo conceitual

### Ajustes em relação à proposta

| Entidade proposta | Decisão |
|-------------------|---------|
| Cliente | **Mantida**, com campo único de documento (PF/PJ pelo tamanho) e quase tudo opcional. |
| Veículo | **Mantida**, enxuta. |
| TipoVeiculo | **Renomeada para Porte.** |
| Servico | **Mantida**, sem dados fiscais. |
| PrecoServico | **Mantida** como **Preco** (Serviço × Porte). |
| Atendimento | **Mantida**, com snapshot de porte e tomador. |
| ItemAtendimento | **Mantida**, sem quantidade. |
| Pagamento | **Mantida** (permite pagamento dividido). Forma de pagamento é **enum**, não entidade. |
| NFSe | **Mantida.** |
| Usuario | **Mantida**, com perfil como enum. |
| — | **Nova: Empresa** (dados + configuração fiscal; registro único). |
| — | **Nova: NFSeTentativa** (histórico de envio/consulta/cancelamento — essencial para auditoria e suporte). |
| — | **Nova: Auditoria** (log simples de ações sensíveis). |

### Diagrama

```
 Empresa (1 registro: dados + config fiscal + certificado + numeração DPS)

 Porte 1───N Preco N───1 Servico
   │
   │ 1
   N
 Veiculo N───0..1 Cliente (habitual)
   │ 1
   │
   N
 Atendimento N───0..1 Cliente (tomador do atendimento)
   │  │  │
   │  │  └── 1───N Pagamento           (forma: enum)
   │  └───── 1───N ItemAtendimento N───1 Servico   (valor congelado)
   │
   └──────── 1───N NFSe   (no máx. 1 ativa; histórico de rejeitadas/canceladas)
                    │
                    └── 1───N NFSeTentativa

 Usuario 1───N Atendimento (abriu / finalizou / cancelou)
 Usuario 1───N Auditoria
```

### Atributos principais

**Empresa**: razao_social, cnpj, inscricao_municipal, endereco, municipio_ibge, telefone, email, regime_tributario, codigo_servico_lc116, codigo_tributacao, aliquota_iss, cnae, tratamento_desconto, emissao_automatica, ambiente, serie_dps, proximo_numero_dps, credenciais_provedor (cifradas), certificado (cifrado), certificado_validade.

**Porte**: id, nome, exemplos, ordem, ativo.

**Servico**: id, nome, avulso (bool), ordem, ativo.

**Preco**: servico_id, porte_id, valor. *(chave única servico+porte)*

**Cliente**: id, nome, telefone, email, documento (CPF/CNPJ), tipo (PF/PJ, derivado), endereco (opcional), inscricao_municipal (opcional).

**Veiculo**: id, placa (única), porte_id, modelo_cor, cliente_habitual_id.

**Atendimento**: id, numero, veiculo_id, porte_id (snapshot), cliente_id (tomador), tomador_snapshot (documento/nome no momento da nota), subtotal, desconto_tipo, desconto_valor, total, observacao, status, aberto_em, aberto_por, finalizado_em, finalizado_por, cancelado_em, cancelado_por, motivo_cancelamento.

**ItemAtendimento**: id, atendimento_id, servico_id, descricao (snapshot; obrigatória no avulso), valor.

**Pagamento**: id, atendimento_id, forma (enum), valor, valor_recebido (dinheiro), troco, estornado (bool), criado_em, criado_por.

**NFSe**: id, atendimento_id, situacao, serie_dps, numero_dps, referencia_idempotencia, valor, discriminacao, numero_nfse, codigo_verificacao, chave_acesso/protocolo, data_emissao, link_consulta, pdf_url, xml, motivo_situacao (mensagem), cancelamento_motivo, cancelada_em, ambiente, proxima_tentativa_em, tentativas_count.

**NFSeTentativa**: id, nfse_id, operacao (emitir/consultar/cancelar), iniciado_em, finalizado_em, usuario_id (ou "sistema"), requisicao, resposta, codigo_retorno, mensagem, resultado (sucesso/rejeitado/desconhecido).

**Usuario**: id, nome, login, senha_hash, perfil (enum), ativo.

**Auditoria**: id, usuario_id, data_hora, entidade, entidade_id, acao, detalhe.

---

## 14. Status

### 14.1 Atendimento (operacional)

| Status | Significado | Transições |
|--------|-------------|-----------|
| **Aberto** | Registrado, carro no pátio, ainda não recebido | → Finalizado, → Cancelado |
| **Finalizado** | Serviço concluído **e** pagamento recebido | → Cancelado (Admin, regras de nota) |
| **Cancelado** | Encerrado sem efeito financeiro | Final |

> "Em execução" e "Pago" foram removidos: o primeiro não muda nenhuma decisão no MVP; o segundo é informação financeira que, no MVP, é sempre verdadeira em "Finalizado". Quando entrar "a receber" (v1.1), o status financeiro será **derivado** dos pagamentos, não armazenado no atendimento.

### 14.2 Pagamento

No MVP **não há campo de status de pagamento**. Um pagamento existe (válido) ou está **estornado** (flag, quando o atendimento é cancelado). Status financeiro derivado (`Pendente / Pago`) só será necessário com "a receber" no futuro.

### 14.3 NFS-e

| Situação | Significado | Ação do usuário |
|----------|-------------|-----------------|
| *(Sem nota)* | Não há registro de NFS-e — **não é um status armazenado**, é exibição | "Emitir NFS-e" |
| **Pendente** | Na fila: ainda não enviada **ou** enviada sem confirmação (resultado desconhecido) | Aguardar / "Tentar agora" (com consulta prévia) |
| **Processando** | Aceita pelo provedor, aguardando resultado (protocolo/lote) | Aguardar / "Consultar agora" |
| **Autorizada** | Nota emitida com número | Ver, imprimir, enviar, cancelar |
| **Rejeitada** | Provedor confirmou que não gerou nota (erro de dados/regra) | Corrigir e reemitir |
| **Cancelando** | Pedido de cancelamento enviado, aguardando confirmação | Aguardar |
| **Cancelada** | Cancelamento confirmado | Reemitir nova nota (se aplicável) |

Por que "Pendente" e não "Erro": a palavra "erro" misturaria dois casos opostos — **"não foi criada" (Rejeitada, pode reemitir)** e **"não sei se foi criada" (Pendente, precisa consultar)**. Essa distinção é a principal proteção contra nota duplicada.

---

## 15. Campos por tela

### 15.1 Tela de Atendimento

| Campo | Tipo | Obrigatório | Regra/Observação |
|-------|------|-------------|------------------|
| Placa | Texto (7) | Sim | Foco automático; normaliza; valida padrão antigo/Mercosul; busca ao digitar 7 caracteres ou Enter |
| Porte | Botões (seleção única) | Sim | Preenchido do veículo; obrigatório só para veículo novo; mostra exemplos; trocar porte recalcula itens ainda não salvos (com aviso) |
| Modelo/cor | Texto livre | Não | Ex.: "Virtus prata" |
| Cliente | Busca/seleção | Não | Sugere o cliente habitual; botão "+ cliente" abre mini formulário (nome, telefone, CPF/CNPJ) |
| Serviços | Botões (múltipla) | Sim (≥1 para finalizar) | Exibe preço do porte; toque adiciona, toque no item remove; chips "Repetir último" |
| Avulso — descrição | Texto | Sim, se avulso | — |
| Avulso — valor | Moeda | Sim, se avulso | > 0 |
| Desconto | Moeda ou % | Não | Alterna R$/%; total não fica negativo |
| Total | Moeda (calculado) | — | Somente leitura, em destaque |
| Observação | Texto curto | Não | Ex.: "risco na porta traseira" |
| Número / data | Automático | — | Somente leitura |
| Botões | — | — | **Salvar** (pátio) · **Receber** (principal) · Cancelar atendimento (menu secundário) |

### 15.2 Modal de Recebimento

| Campo | Tipo | Obrigatório | Regra/Observação |
|-------|------|-------------|------------------|
| Total a receber | Moeda (calculado) | — | Em destaque |
| Forma de pagamento | Botões grandes | Sim | Dinheiro, PIX, Débito, Crédito, Outro (só as ativas) |
| Valor recebido | Moeda | Não | Só para Dinheiro; calcula troco |
| Troco | Moeda (calculado) | — | Somente leitura |
| Dividir pagamento | Link → linhas forma+valor | Não | Soma deve fechar o total; botão finalizar desabilitado até fechar |
| CPF/CNPJ na nota | Texto (máscara dinâmica) | Condicional | Pré-preenchido do cliente; vazio = sem identificação (se permitido ⚠️ VALIDAR); valida DV |
| Nome / Razão social | Texto | Condicional | Aparece só se exigido para o tipo de tomador |
| Endereço do tomador | Grupo (CEP com autopreenchimento) | Condicional | Aparece só se exigido (geralmente PJ) ⚠️ VALIDAR |
| E-mail para envio | E-mail | Não | Pré-preenchido do cliente |
| Botão principal | — | — | **FINALIZAR E EMITIR NFS-e** (ou **FINALIZAR** se emissão automática desligada) |

### 15.3 Painel de Resultado da Nota

| Campo | Tipo | Obrigatório | Regra/Observação |
|-------|------|-------------|------------------|
| Situação | Indicador colorido | — | Verde (Autorizada), amarelo (Pendente/Processando), vermelho (Rejeitada) |
| Número da NFS-e | Texto | — | Quando autorizada |
| Mensagem | Texto | — | Simples, com ação sugerida |
| Ações | Botões | — | Imprimir · Ver PDF · WhatsApp · E-mail · Novo atendimento |

### 15.4 Cliente (mini formulário e ficha)

| Campo | Tipo | Obrigatório | Regra/Observação |
|-------|------|-------------|------------------|
| Nome / Razão social | Texto | Não* | *Obrigatório se for tomador PJ (ou PF, se exigido) |
| Telefone | Telefone | Não | Usado no WhatsApp e na busca |
| CPF/CNPJ | Texto (máscara dinâmica) | Não* | *Obrigatório para nota identificada; único; valida DV |
| E-mail | E-mail | Não | Envio da nota |
| Endereço | Grupo (CEP, logradouro, número, bairro, cidade/UF) | Não* | *Só se exigido pelo município para o tomador ⚠️ VALIDAR |
| Inscrição municipal | Texto | Não | Exibido apenas em "mais dados fiscais" |
| Veículos | Lista | — | Na ficha: placa, porte, modelo; editar/adicionar |
| Histórico | Lista | — | Na ficha: data, placa, serviços, valor, nota |

### 15.5 Veículo (dentro do atendimento ou da ficha do cliente)

| Campo | Tipo | Obrigatório | Regra/Observação |
|-------|------|-------------|------------------|
| Placa | Texto (7) | Sim | Única; normalizada |
| Porte | Seleção | Sim | Somente portes ativos |
| Modelo/cor | Texto | Não | — |
| Cliente habitual | Seleção | Não | Sugestão no atendimento |

### 15.6 Configurações › Serviços e preços (grade)

| Campo | Tipo | Obrigatório | Regra/Observação |
|-------|------|-------------|------------------|
| Nome do serviço | Texto | Sim | Único entre ativos |
| Avulso | Sim/Não | Sim | Se sim, valor é digitado no atendimento (sem grade) |
| Mesmo preço para todos | Checkbox | Não | Replica o valor em todas as colunas |
| Preço por porte (uma coluna por porte) | Moeda | Não | Vazio = indisponível para o porte |
| Ordem | Número / arrastar | Não | Ordem dos botões no atendimento |
| Ativo | Sim/Não | Sim | — |

### 15.7 Configurações › Portes

| Campo | Tipo | Obrigatório | Regra/Observação |
|-------|------|-------------|------------------|
| Nome | Texto | Sim | Ex.: "Médio" |
| Exemplos | Texto | Não | Ex.: "Virtus, Corolla, Compass" — dica no atendimento |
| Ordem | Número | Não | — |
| Ativo | Sim/Não | Sim | Inativar não afeta histórico |

### 15.8 Configurações › Empresa e fiscal

| Campo | Tipo | Obrigatório | Regra/Observação |
|-------|------|-------------|------------------|
| Razão social, CNPJ, endereço, município (IBGE) | Textos | Sim | Dados do prestador |
| Inscrição municipal | Texto | Condicional | ⚠️ VALIDAR exigência |
| Regime tributário | Seleção | Sim | MEI / Simples Nacional / Lucro Presumido-Real ⚠️ VALIDAR opções do padrão |
| Código do serviço (LC 116) | Texto | Sim | Provável 14.01 ⚠️ VALIDAR |
| Código de tributação nacional/municipal | Texto | Sim | ⚠️ VALIDAR |
| Alíquota ISS (%) | Decimal | Condicional | Não se aplica a MEI ⚠️ VALIDAR |
| CNAE | Texto | Condicional | Se exigido pelo padrão |
| Tratamento do desconto | Seleção | Sim | Valor líquido / desconto incondicionado ⚠️ VALIDAR |
| Série e próximo número DPS/RPS | Texto / Número | Sim | Alterar número exige confirmação (risco de duplicidade) |
| Emissão automática ao finalizar | Sim/Não | Sim | Padrão: Sim |
| Ambiente | Homologação / Produção | Sim | Mudança para Produção exige confirmação |
| Credenciais do provedor | Texto (segredo) | Sim | Armazenadas cifradas |
| Certificado digital (A1) + senha | Arquivo + segredo | Condicional | Exibe titular e validade ⚠️ VALIDAR necessidade |
| Botão "Testar conexão" | Ação | — | Valida credenciais/certificado |

### 15.9 Configurações › Usuários

| Campo | Tipo | Obrigatório | Regra/Observação |
|-------|------|-------------|------------------|
| Nome | Texto | Sim | — |
| Login | Texto | Sim | Único |
| Senha | Senha | Sim (na criação) | Mínimo 6 caracteres; Admin pode redefinir |
| Perfil | Administrador / Atendente | Sim | — |
| Ativo | Sim/Não | Sim | — |

---

## 16. Dependências externas

Tudo abaixo deve ser respondido **antes** de iniciar o desenvolvimento da integração. Sugestão: uma reunião com o contador + teste no ambiente de homologação.

| # | Dependência | Pergunta a responder | Com quem |
|---|-------------|----------------------|----------|
| 1 | **Município da empresa** | Qual município? (define tudo o mais) | Dono |
| 2 | **Padrão/provedor de NFS-e** | O município usa o **Padrão Nacional** (Emissor Nacional / Sefin Nacional / ADN) ou sistema próprio (ABRASF, Betha, IPM, GINFES, ISSNet, etc.)? A convergência ao padrão nacional determinada pela reforma tributária (LC 214/2025) já foi concluída no município? | Prefeitura / contador |
| 3 | **Intermediador × integração direta** | Usaremos um intermediador de NFS-e? Ele cobre o município? Qual o custo por nota/mês? Suporta webhook e referência idempotente? | Equipe técnica |
| 4 | **Regime tributário** | MEI, Simples Nacional ou outro? MEI tem regras próprias de emissão (Emissor Nacional) e não destaca ISS. | Contador |
| 5 | **Autenticação** | Certificado digital A1 (mTLS/assinatura)? Usuário e senha? Token? | Prefeitura / intermediador |
| 6 | **Certificado digital** | É necessário? Tipo (A1 é o viável para sistema web; A3 não serve para emissão automática em servidor)? Quem é o titular? Validade? | Contador |
| 7 | **Códigos tributários** | Subitem da LC 116 (provável 14.01), código de tributação nacional/municipal, CNAE, NBS (se exigido). Todos os serviços cabem no mesmo código? | Contador |
| 8 | **ISS** | Alíquota; local de incidência; existe **retenção de ISS** quando o tomador é PJ (substituto tributário)? Como informar? | Contador / prefeitura |
| 9 | **IBS/CBS (reforma tributária)** | Quais campos de IBS/CBS são obrigatórios na NFS-e no ano corrente para este regime? | Contador |
| 10 | **Desconto** | Informar valor líquido ou desconto incondicionado? | Contador |
| 11 | **Dados obrigatórios do tomador** | Nota sem identificação do tomador é permitida? Para PF, só CPF basta? Para PJ, endereço e inscrição municipal são obrigatórios? | Padrão do município |
| 12 | **Obrigatoriedade de emissão** | É obrigatório emitir para todo serviço, mesmo que o cliente não peça? (impacta a configuração "emissão automática" e a opção "dispensar nota") | Contador |
| 13 | **Regras de cancelamento** | Prazo para cancelar; motivos aceitos; necessidade de aprovação fiscal após o prazo; existe substituição de nota? | Padrão do município |
| 14 | **Emissão posterior / contingência** | Qual o prazo para emitir uma nota após o serviço quando o sistema da prefeitura estiver fora? | Prefeitura / contador |
| 15 | **Numeração** | O sistema controla série/número da DPS/RPS? Há numeração já usada em outro emissor (não pode colidir)? | Contador / provedor |
| 16 | **Ambiente de homologação** | Existe? Como obter acesso? Dados de teste? | Prefeitura / intermediador |
| 17 | **Ambiente de produção** | Credenciamento/autorização prévia para emitir via API? Prazo de liberação? | Prefeitura |
| 18 | **DANFSe/PDF e link** | O provedor devolve PDF ou só XML (exigindo gerar o DANFSe)? Há link público de consulta para enviar ao cliente? | Provedor |
| 19 | **Guarda de documentos** | Prazo de retenção de XML exigido. | Contador |
| 20 | **Envio de e-mail** | O provedor/intermediador já envia a nota por e-mail ao tomador? (evita implementar SMTP) | Provedor |

---

## 17. Riscos

| # | Risco | Tipo | Prob. | Impacto | Mitigação |
|---|-------|------|-------|---------|-----------|
| 1 | **Nota duplicada** por reenvio após timeout | Fiscal | Alta sem proteção | Alto | RN022, RN028–RN031: restrição única, número de DPS reutilizado, consulta antes de reenviar, trava por nota |
| 2 | **Integração municipal instável/heterogênea** | Técnico | Alta | Alto | Intermediador + adaptador; fila com reprocessamento; homologação antes de produção |
| 3 | **Mudanças de layout** (Padrão Nacional, IBS/CBS da reforma tributária) | Fiscal/Técnico | Alta (2026–2033 é período de transição) | Alto | Intermediador absorve mudanças; adaptador isolado; acompanhamento com contador |
| 4 | **Enquadramento tributário incorreto** (código, alíquota, retenção) | Fiscal | Média | Alto | Validação com contador antes do go-live; configuração centralizada |
| 5 | **Certificado vencido** para toda a emissão | Operacional | Média | Alto | Alertas RN037; status visível em Configurações |
| 6 | **Divergência entre atendimento e nota** (edição após emissão) | Fiscal | Média | Alto | RN011: bloqueio de edição após autorizada |
| 7 | **Atendente não preenche CPF correto** → nota rejeitada ou para pessoa errada | Funcional | Média | Médio | Validação de DV; confirmação visual do nome; correção e reemissão simples |
| 8 | **Queda de internet no balcão** | Técnico | Média | Médio | Notas ficam Pendentes e saem depois; recomendação de internet móvel de contingência; modo offline só no futuro |
| 9 | **Notas pendentes esquecidas** além do prazo legal | Fiscal | Média | Alto | Bloco de pendências na tela inicial + alerta por tempo (RF038) |
| 10 | **Cancelamento fora do prazo** | Fiscal | Baixa | Médio | Prazo exibido na nota; bloqueio com orientação |
| 11 | **Fraude interna** (cancelar atendimento e embolsar dinheiro, descontos indevidos) | Funcional | Média | Médio | Cancelamento de finalizado só Admin; auditoria; relatório de cancelamentos e descontos |
| 12 | **Vazamento de dados** (CPF, credenciais, certificado) | Segurança/LGPD | Baixa | Alto | Segredos cifrados; mascaramento; HTTPS; perfis; coletar CPF só quando necessário |
| 13 | **Escopo crescer** (agenda, estoque, comissão antes do MVP rodar) | Projeto | Alta | Médio | Este documento como linha de corte; backlog futuro priorizado |
| 14 | **Custo por nota do intermediador** inviabilizar margem | Negócio | Baixa | Médio | Cotar antes; adaptador permite migrar para integração direta |
| 15 | **Baixa adoção pelos funcionários** | Funcional | Média | Alto | 4–5 toques no fluxo principal; botões grandes; teste com atendente real antes do lançamento |

---

## 18. Anexo — Classificação das funcionalidades em análise

| Funcionalidade | Classificação | Justificativa |
|----------------|---------------|---------------|
| Agendamento | **Futuro** | Útil para estética (polimento/higienização), pouco para lavagem rápida |
| Fila de veículos | **MVP (simplificada)** | Vira a lista "No pátio" na tela inicial — sem previsão de horário |
| Fotos antes/depois | **Futuro** | Protege contra reclamação, mas exige armazenamento e tempo no balcão |
| Estoque | **Desnecessário** | Não facilita atendimento nem nota; produtos de limpeza são controlados fora |
| Comissão de funcionário | **Futuro** | Exige registrar o lavador em cada atendimento |
| Fidelidade | **Futuro** | Simples depois de haver histórico |
| Pacotes de lavagem | **Futuro** | Exige saldo e regra fiscal de quando emitir ⚠️ VALIDAR |
| Mensalidades | **Futuro** | Idem pacotes, mais cobrança recorrente |
| Cupons | **Desnecessário** | O desconto manual cobre; cupom é marketing de varejo online |
| Integração com WhatsApp (API) | **Futuro** | Link `wa.me` resolve no MVP |
| Envio da NFS-e por WhatsApp (link) | **MVP** | Custo zero, alto valor percebido |
| Envio automático da NFS-e por e-mail | **MVP** (se e-mail informado) | Muitos provedores já fazem; senão, envio simples |
| Leitura automática da placa (OCR/câmera) | **Futuro** | Digitar 7 caracteres é rápido; OCR exige câmera e tratamento de erro |
| Cadastro rápido por placa | **MVP** | Núcleo do fluxo |
| Busca por telefone | **MVP** | Busca alternativa barata |
| Busca por CPF/CNPJ | **MVP** | Busca alternativa barata |
| Relatórios | **MVP (enxuto)** | Uma tela de período + resumo do dia |
| Impressão de comprovante (não fiscal) | **Futuro** | A nota (PDF) substitui; ticket de entrada pode ser útil depois |
| Impressão da NFS-e | **MVP** | Via PDF do navegador |
| Cancelamento de atendimento | **MVP** | Sem isso o caixa não fecha |
| Estorno | **MVP (lógico)** | Ocorre via cancelamento do atendimento; sem estorno financeiro avulso |
| Reabertura de atendimento | **Desnecessário** | Substituída por: editar enquanto Aberto; cancelar e refazer depois de finalizado |
| Repetir último atendimento | **MVP** | 1 toque para o cliente recorrente — maior ganho de velocidade |
| Pagamento dividido | **MVP (opcional na tela)** | Comum no balcão; não atrapalha o fluxo padrão |
| Pagamento pendente (fiado/faturado) | **Futuro (v1.1)** | Real em frotas, mas adiciona contas a receber |
| Pagamento parcial | **Desnecessário** | Raro em lava-car |
| Parcelamento | **Desnecessário** | Responsabilidade da maquininha |
| Fechamento de caixa formal | **Futuro (v1.1)** | Resumo do dia por forma de pagamento cobre o MVP |
| Perfil Operador | **Desnecessário (MVP)** | Lavador não opera sistema; volta junto com comissão/status "pronto" |
| Multiempresa | **Futuro (v2)** | Só se virar produto |
