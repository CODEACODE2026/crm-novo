# CRM Novo - Legacy Import Runbook

## IMPORT1.4 - Active + Historical Canceled

Politica atual de importacao de clientes legados:

- `Ativo`: importar como `Client.status=ATIVO` e `ClientReference.status=ATIVO`.
- `Inativo`: importar como `Client.status=CANCELADO` e `ClientReference.status=CANCELADO`.
- `Cancelado`: importar como `Client.status=CANCELADO` e `ClientReference.status=CANCELADO`.
- `Novo`: nao importar.
- `Pendente`: nao importar.
- Status desconhecido: `INVALID`.

`Inativo` legado vira `CANCELADO` no CRM Novo por decisao de negocio. O objetivo
e preservar cadastro e historico sem tornar o cliente elegivel a cobranca.

## Efeitos Permitidos

IMPORT1 para `Ativo`, `Inativo` e `Cancelado` cria somente:

- `Client`.
- `ClientReference`.
- `LegacyImportRecord`.

IMPORT1 nao cria:

- `Receivable`.
- `MessageDispatch`.
- `PaymentIntent`.
- `FinancialTransaction` operacional.
- `ClientEvent`.
- `ClientStatusHistory`.
- Recovery.
- PIX.
- WhatsApp.

## Plano, Valor e Vencimento

Clientes historicos cancelados preservam:

- Plano via plan mapping do ambiente atual.
- `value_mensalidade` em `recurringValue`.
- `vencimento` em `dueDate`.
- `avisar` em `billingNoticeDays`.

Esses dados sao historicos e ajudam consulta e reativacao futura. Enquanto o
cadastro esta `CANCELADO`, eles nao devem gerar cobranca.

## IMPORT2A

IMPORT2A deve aceitar historico `PAGO` / `RECEITA` para clientes efetivamente
importados por `LegacyImportRecord IMPORTED`, incluindo:

- Ativos importados como `ATIVO`.
- Inativos importados como `CANCELADO`.
- Cancelados importados como `CANCELADO`.

A resolucao continua:

```text
payment.client_id -> LegacyImportRecord -> crmClientId -> crmClientReferenceId
```

Nao adicionar fallback por nome, telefone ou email.

`PENDENTE` financeiro continua `PENDING_NOT_SUPPORTED`.
Cliente `Novo`, por nao possuir `LegacyImportRecord`, continua
`CLIENT_NOT_IMPORTED`.

## IMPORT3

IMPORT3 continua restrito a:

- `Client.status=ATIVO`.
- `ClientReference.status=ATIVO`.

Cliente importado como `CANCELADO` nao fica `READY`, nao cria `Receivable` e nao
entra no cutover operacional.

## Export Final

Clientes:

```sql
SELECT
  id,
  name,
  phone,
  email,
  status,
  vencimento,
  avisar,
  value_mensalidade,
  type_cobranca,
  referencia,
  observation,
  created_at,
  updated_at,
  date_desativado
FROM <tabela_clientes_legado>
WHERE status IN ('Ativo', 'Inativo', 'Cancelado');
```

Financeiro:

```sql
SELECT
  p.id,
  p.client_id,
  p.status,
  p.tipo_transacao,
  p.tipo_pagamento,
  p.valor_debito,
  p.data_pagamento,
  p.data_criado,
  p.observation
FROM <tabela_pagamentos_legado> p
JOIN <legacy_ids_efetivamente_importados> c ON c.id = p.client_id
WHERE p.status = 'PAGO'
  AND p.tipo_transacao = 'RECEITA';
```

O conjunto financeiro deve ser resolvido pelos legacy ids efetivamente
importados, nao apenas pelos clientes `Ativo`.

## Fora do Escopo

- Reativacao nova.
- IMPORT3 para cancelados.
- Criacao de Receivables historicos.
- Importacao de divida pendente.
- Migration Prisma.
