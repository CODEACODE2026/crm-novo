# MERCADOPAGO-PIX-WEBHOOK1 — IMPLEMENTATION REPORT

## Veredito

**READY FOR NEXT PHASE**

WEBHOOK1 foi implementado e validado em branch e worktree isolados, sobre o
commit CORE1 aprovado. Mercado Pago continua desabilitado por padrão. Nenhum
acesso a produção, pagamento real, credencial produtiva, push, pull request,
merge, deploy ou migration em ambiente existente foi realizado.

## Git e ancestralidade

- Repositório: `/opt/codeacode/repos/crm-novo`
- Worktree: `/opt/codeacode/worktrees/mercadopago-pix-webhook1`
- Branch: `feature/mercadopago-pix-webhook1`
- Baseline CORE1: `966f1ddb46ce092ba3ef4fae39eb2b132adfb6fc`
- Tree CORE1: `60e8d56553ffa416044bdb5e08e91b671b0e16f8`
- `origin/main` reconfirmada em 2026-11-02:
  `7e8edb35d365002aed9b9d82264529a5348939d3`
- CLIENT-EMAIL1:
  `279a20658edc529e2cbd8c492f18336e3b63b94a`
- `origin/main` e CLIENT-EMAIL1 são ancestrais do CORE1.
- A `main` local, que contém alterações de outras fases, não foi alterada.

O commit e a tree finais desta implementação são registrados na cópia de
entrega depois que este relatório entra no commit local.

## Contrato oficial do webhook

Fontes oficiais auditadas:

- Notificações de Orders:
  <https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications>
- Consulta autenticada de Order:
  <https://www.mercadopago.com.br/developers/en/reference/online-payments/checkout-api/get-order/get>

Endpoint recebido pelo CRM:

`POST /payment-webhooks/MERCADO_PAGO?data.id=<ORDER_ID>&type=order`

Entradas autenticadas e validadas:

- `x-signature: ts=<timestamp>,v1=<hmac-hex>`;
- `x-request-id`;
- query `data.id` e `type=order`;
- corpo `type=order`, `action=order.*`, `data.id` e `live_mode`;
- manifesto oficial
  `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`;
- HMAC-SHA256 com comparação de tempo constante.

O payload não é usado como prova de pagamento. Após a assinatura válida, o
backend consulta `GET /v1/orders/{order_id}` com a credencial ativa do ambiente
configurado e toma a decisão apenas a partir da Order autenticada.

## Vínculo e validações financeiras

A Order autenticada precisa corresponder ao `PaymentIntent` em todos os pontos:

- provider `MERCADO_PAGO`;
- ambiente `TEST` ou `PRODUCTION` e `live_mode` coerentes;
- `order_id` igual ao `providerTransactionId`;
- `payment_id` igual ao `externalDepixId`;
- `external_reference` igual ao identificador persistido;
- valor efetivamente pago, valor do pagamento e total da Order coerentes;
- moeda `BRL`;
- exatamente um pagamento;
- método `pix` e tipo `bank_transfer`;
- ausência de `paymentGroupId`.

`paid_amount` é priorizado na confirmação quando fornecido pela Orders API. Uma
divergência entre valor pago e valor local bloqueia a liquidação.

As colunas aditivas `providerEnvironment` e
`providerExternalReference` preservam o ambiente e a referência externa da
criação até a conciliação. A migration também adiciona índices únicos parciais
para payment ID e external reference de Mercado Pago.

## Liquidação e idempotência

Não foi criado um segundo fluxo de baixa. Webhook e sincronização manual chamam
o mesmo `applyProviderStatus`, que já concentra:

- baixa do recebível;
- criação da transação financeira;
- renovação;
- ativação;
- reativação;
- auditoria e eventos do cliente.

As garantias contra duplicidade e eventos fora de ordem são combinadas:

1. unicidade existente de provider + order ID;
2. unicidade parcial de payment ID e external reference para Mercado Pago;
3. consulta da Order atual, em vez de confiar no estado do evento atrasado;
4. transição monotônica: `PAID` não regride para estado pendente ou terminal
   anterior, e `REFUNDED` não regride para `PAID`;
5. compare-and-set transacional já existente para marcar o recebível pago;
6. unicidade da transação financeira por recebível;
7. evento técnico do webhook gravado somente depois da conciliação bem-sucedida,
   evitando que uma falha parcial envenene o retry oficial;
8. repetição do mesmo evento tratada como sucesso idempotente.

O teste PostgreSQL executou webhook e consulta manual simultaneamente e
confirmou uma única baixa, uma única transação financeira e um único evento de
pagamento.

## Estados tratados

- pendente/processando: atualiza a intenção, sem baixar recebível;
- confirmado/acreditado: liquida uma única vez pelo fluxo financeiro atual;
- expirado, cancelado ou rejeitado: não marca recebível como pago;
- reembolsado: registra o estado e a auditoria técnica, sem inventar uma baixa
  inversa ou desfazer automaticamente o histórico financeiro.

Renovação, ativação e reativação só são alcançadas depois de confirmação
autenticada e de todas as validações de vínculo, ambiente, método, moeda e valor.

## Auditoria e segredos

- O segredo de webhook usa o armazenamento criptografado já existente.
- Tokens e segredo HMAC não são persistidos em eventos nem logs.
- A auditoria técnica guarda identificadores mínimos, status e vínculo com o
  `PaymentIntent`.
- O registro automático via API FastDepix continua bloqueado para Mercado Pago;
  nesta fase a URL e o segredo devem ser configurados no painel oficial.

## Migration e PostgreSQL 12.22

Um PostgreSQL 12.22 oficial foi compilado e iniciado somente em diretório
temporário. O cluster recebeu o pré-requisito histórico `pgcrypto`, aplicou as
**58/58 migrations** e foi descartado ao final.

Verificações reais:

- versão `12.22`;
- 58 migrations concluídas;
- duas novas colunas nullable presentes;
- dois índices únicos parciais presentes;
- teste concorrente real: **1/1 aprovado**;
- zero fixtures WEBHOOK1 remanescentes após o teste.

Nenhum banco existente foi migrado ou modificado.

## Testes e gates

- Suíte focada WEBHOOK1: **5 arquivos, 347 testes aprovados**.
- API completa: **72 arquivos, 1.962 testes aprovados**;
  106 testes opt-in ignorados fora de seus perfis dedicados.
- Web completa: **49 arquivos, 832 testes aprovados**.
- PostgreSQL 12.22 dedicado: **1 teste aprovado**.
- Lint do monorepo: zero erros; seis avisos históricos em arquivos não alterados.
- Typecheck shared/API/web: aprovado.
- Builds shared/API/web: aprovados.
- `git diff --check`: aprovado.

Os cenários focados cobrem assinatura inválida, metadados ausentes ou
divergentes, repetição, eventos fora de ordem, Order inexistente, grupos
bloqueados, payment ID/referência/valor/total/moeda/provider/ambiente/live mode
divergentes, método não Pix, múltiplos pagamentos, estados pendente, confirmado,
expirado, cancelado, rejeitado e reembolsado, concorrência webhook + sync,
liquidação única e renovação/reativação somente após confirmação válida.

## Arquivos da missão

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20261102134500_add_payment_intent_provider_external_reference/migration.sql`
- `apps/api/src/finance/finance.service.ts`
- `apps/api/src/finance/finance.service.test.ts`
- `apps/api/src/finance/payment-webhook.controller.ts`
- `apps/api/src/finance/payment-webhook.controller.test.ts`
- `apps/api/src/finance/mercado-pago-webhook-migration.test.ts`
- `apps/api/src/finance/mercado-pago-webhook-postgres.test.ts`
- `apps/api/src/finance/payments/payment-provider.ts`
- `apps/api/src/finance/payments/mercado-pago-api.client.ts`
- `apps/api/src/finance/payments/mercado-pago-payment.provider.ts`
- `apps/api/src/finance/payments/mercado-pago-payment.provider.test.ts`
- `apps/api/src/finance/payments/payment-provider-credentials.service.ts`
- `apps/api/src/finance/payments/payment-provider-credentials.service.test.ts`
- `docs/project/MERCADOPAGO-PIX-WEBHOOK1-IMPLEMENTATION-REPORT.md`

Nenhum arquivo de UI, WhatsApp, KiraGo, BillingScheduler, RecoveryScheduler ou
outro provider foi alterado.

## Limitações e fronteiras preservadas

- Nenhuma chamada oficial foi executada, pois nenhuma credencial sandbox foi
  fornecida; os contratos HTTP foram validados com fixtures e mocks sanitizados.
- Mercado Pago continua fail-closed e desabilitado por padrão.
- A configuração do webhook no painel Mercado Pago não foi executada.
- Grupos, UI, WhatsApp e novas funcionalidades não foram iniciados.
- Reembolso não desfaz automaticamente uma liquidação histórica; uma política
  financeira explícita futura é necessária para estorno contábil.
- Não houve push, PR, merge ou deploy.
