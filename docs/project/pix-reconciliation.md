# PIX0.4 - Reconciliacao Segura de PIX Externo Orfao

## Auditoria antes da implementacao

- `FinanceController` expunha criacao de PIX, listagem de intents, sync, confirmacao mock e cancelamento. A reconciliacao foi adicionada como preview read-only e confirmacao explicita.
- `FinanceService.createReceivablePix` valida receivable pendente, bloqueia PIX ativo, chama o provider e persiste `PaymentIntent`. O debito arquitetural permanece: o create externo ainda ocorre dentro de `prisma.$transaction`.
- `FinanceService.syncPaymentIntent` consulta provider pelo registry e aplica o resultado em `applyProviderStatus`.
- `applyProviderStatus` e a rotina central de settlement: status nao pago apenas atualiza intent; status pago baixa a `Receivable`, cria no maximo uma `FinancialTransaction` e registra evento.
- `processPaymentWebhook` normaliza evento, deduplica em `PaymentWebhookEvent` e reaproveita `applyProviderStatus`.
- `PaymentProviderRegistryService` ja abstraia `createPix`, `getPixStatus`, `cancelPix` e mock paid. PIX0.4 adicionou `getPixTransaction` para consulta completa sem acoplar controller/service ao FastFlow.
- `FastFlowPaymentProvider` e `FastPayPaymentProvider` usam `FastDepixApiClient` e normalizam `id` numerico/string para string.
- `FastDepixApiClient.getTransaction(token, id)` chama `GET /transactions/:id`.
- `PaymentIntent` ja possui `@@unique([provider, providerTransactionId])`, suficiente para bloquear duplicidade sem migration.
- `Receivable` usa status `PENDENTE`, `PAGO`, `CANCELADO`; `FinancialTransaction.receivableId` e unico, protegendo baixa duplicada.

## Contrato FastDepix existente

Campos tipados atualmente em `FastDepixTransactionResponse`:

- `id`
- `amount`
- `depix_transaction_id`
- `blockchain_tx_id`
- `end_to_end_id`
- `status`
- `qr_code`
- `qr_code_text`
- `qr_code_expires_at`
- `created_at`
- `paid_at`
- `payer_phone`

PIX0.4 usa somente campos ja disponiveis nesse contrato tipado. Nao ha token, secret, Authorization, ciphertext, PIX copia-e-cola completo ou QR payload em logs novos.

## Decisoes de dominio

- Preview valida primeiro o estado local e nao grava nada.
- Confirmacao sempre reconsulta o provider antes de gravar; preview nao e autoridade final.
- Valor do provider deve bater exatamente com `Receivable.amount` usando `Prisma.Decimal`.
- `WAITING_PAYMENT`: cria `PaymentIntent`, mantem `Receivable` pendente, nao cria novo PIX e nao cria `FinancialTransaction`.
- `PAID`: cria/adota a intent e reaproveita `applyProviderStatus` para baixa financeira existente.
- `EXPIRED`: cria historico local `EXPIRED`, mantem `Receivable` pendente e permite novo PIX pelo fluxo normal.
- `CANCELED`, `REFUNDED` e `FAILED`: podem ser adotados como historico sem baixa.
- Status externo desconhecido bloqueia a reconciliacao.
- Confirmacao e idempotente por `provider + providerTransactionId`; retry/double click nao deve duplicar intent nem baixa.

## Checklist real futuro para #75148

Nao executar nesta fase.

1. Executar `git pull` no Windows.
2. Reiniciar API/Web.
3. Garantir schedulers OFF.
4. Confirmar FastFlow configurado.
5. Abrir a Receivable correta: `0699aa7a-23d0-4463-9501-daf92c930bea`.
6. Abrir `PIX -> Mais acoes -> Reconciliar PIX externo`.
7. Selecionar provider `FASTFLOW`.
8. Informar transaction ID `75148`.
9. Executar PREVIEW.
10. PARAR.
11. Conferir status, valor, cliente, expiracao e impactos com operador.
12. Confirmar adocao somente depois de autorizacao explicita.

## Debito PIX0.5

Antes de producao, reformular criacao de PIX para tolerar `provider success + local failure`, timeout ambiguo, recovery/reconciliation automatica e idempotency no provider quando disponivel.

## Debito PIX0.6

O hardening PIX0.5.1 serializa a decisao de substituicao por `Receivable`, mas ainda mantem a chamada HTTP ao provider dentro do escopo transacional para evitar multiplicar PIX externos no desenho atual. Em uma etapa futura, evoluir para reserva local/outbox ou idempotencia externa formal, reduzindo a duracao da transaction sem perder a garantia de uma unica tentativa operacional ativa.

## PIX0.5 - Substituicao segura de PIX

O status local `SUPERSEDED` representa uma tentativa de PIX que deixou de ser a tentativa
operacional atual do CRM porque o operador gerou uma nova tentativa. Ele nao significa
`CANCELED`, `EXPIRED`, `FAILED` ou `REFUNDED`.

Decisoes:

- `status` e o estado operacional local do CRM.
- `externalStatus` preserva o ultimo estado conhecido informado pelo provider.
- `status = SUPERSEDED` com `externalStatus = WAITING_PAYMENT` ou equivalente e valido.
- A substituicao nao chama cancelamento externo e nao implica cancelamento no provider.
- O cancelamento externo nao foi confirmado/suportado no ambiente testado; isso nao afirma uma limitacao absoluta da FastFlow.
- Dois PIX externos podem coexistir para a mesma `Receivable` quando o operador confirma conscientemente a substituicao.
- A confirmacao de substituicao envia `expectedCurrentIntentId` obtido no preview; dentro do lock, se o current intent mudou, o POST retorna conflito antes de chamar o provider.
- Um novo replace operacional futuro deve iniciar novo preview para o current intent vigente, permitindo cadeias legitimas A -> B -> C sem confundir com double-click concorrente baseado em A.
- O PIX antigo continua podendo ser sincronizado ou liquidado por webhook; se virar `PAID`, o settlement local continua valido.
- `FinancialTransaction.receivableId` unico e as checagens de settlement preservam idempotencia local e evitam receita duplicada.
- PIX agrupado (`paymentGroupId != null`) fica bloqueado nesta fase.
- Se `provider.createPix` concluir e a persistencia local falhar, pode surgir novo PIX orfao; a reconciliacao PIX0.4 permanece como mecanismo de recuperacao.
- Eventos de auditoria nao devem registrar copia-e-cola, QR payload, token ou secret.
