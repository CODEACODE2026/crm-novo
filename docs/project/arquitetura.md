# CRM Novo - Arquitetura

## Decisao Arquitetural

Usar monorepo com backend e frontend separados:

```text
crm-novo/
  apps/
    api/
    web/
  packages/
    shared/
  docs/
    project/
```

Esta decisao facilita evolucao coordenada entre contratos de API, tipos
compartilhados, validacoes comuns e documentacao, preservando separacao clara
entre API e interface.

Package manager aprovado para o monorepo: `pnpm`.

O repositorio Git do projeto deve ser inicializado na Sprint 1, sem commit ou
push automatico.

## Backend

Stack:

- Node.js.
- NestJS.
- TypeScript.
- Prisma ORM.
- PostgreSQL.
- API REST.
- JWT.

Padroes:

- Modulos por dominio.
- Controllers finos.
- Services e use cases para regras de negocio.
- DTOs com validacao.
- Prisma transactions em operacoes atomicas.
- Filtros globais de erro.
- Logs estruturados com request id.
- Guards para autenticacao e autorizacao.
- Auditoria para operacoes criticas.

## Frontend

Stack:

- Next.js.
- TypeScript.
- Interface responsiva.
- Consumo exclusivo da API REST.

Padroes:

- Organizacao por modulo.
- Componentes reutilizaveis.
- Layout administrativo com sidebar e header.
- Estados de loading, vazio e erro.
- Tabelas responsivas.
- Formularios claros.
- Status visuais consistentes.

## Modulos Backend

```text
auth
users
clients
plans
client-events
renewals
finance
billing
automations
whatsapp
payments
dashboard
audit
settings
```

## Entidades Principais

### User

Base para autenticacao inicial e futura autorizacao.

Campos conceituais:

- `id`.
- `name`.
- `email`.
- `passwordHash`.
- `role`.
- `active`.
- `createdAt`.
- `updatedAt`.

### Plan

Plano recorrente editavel.

Campos conceituais:

- `id`.
- `name`.
- `durationMonths`.
- `defaultValue`.
- `active`.
- `createdAt`.
- `updatedAt`.

### Client

Cliente operacional.

Campos conceituais:

- `id`.
- `name`.
- `phoneRaw`.
- `phoneNormalized`.
- `email`.
- `reference`.
- `notes`.
- `status`.
- `planId`.
- `recurrenceValue`.
- `dueDate`.
- `billingNoticeDays`.
- `createdAt`.
- `updatedAt`.
- `deletedAt`, se soft delete for usado.

Restricoes:

- `reference` unica.
- `phoneNormalized` unico quando preenchido.

### ClientStatusHistory

Historico estruturado de mudanca de status.

Campos conceituais:

- `id`.
- `clientId`.
- `fromStatus`.
- `toStatus`.
- `reason`.
- `changedByUserId`.
- `createdAt`.

### ClientEvent

Timeline operacional visivel.

Campos conceituais:

- `id`.
- `clientId`.
- `type`.
- `title`.
- `description`.
- `metadata`.
- `createdByUserId`.
- `createdAt`.

### Renewal

Historico imutavel de renovacoes.

Campos conceituais:

- `id`.
- `clientId`.
- `planId`.
- `previousDueDate`.
- `newDueDate`.
- `amount`.
- `origin`.
- `responsibleUserId`.
- `receivableId`.
- `createdAt`.

### Receivable

Conta a receber.

Campos conceituais:

- `id`.
- `clientId`.
- `renewalId`.
- `description`.
- `amount`.
- `dueDate`.
- `paymentStatus`.
- `paidAt`.
- `paymentMethod`.
- `transactionIdentifier`.
- `paymentIntentId`.
- `notes`.
- `createdAt`.
- `updatedAt`.

Observacao:

- `VENCIDO` nao sera estado persistido nesta fase. Sera condicao calculada
  quando `dueDate` estiver no passado e a conta nao estiver paga/cancelada.

### FinancialTransaction

Movimentacao financeira efetiva.

Campos conceituais:

- `id`.
- `type`.
- `categoryId`.
- `clientId`.
- `receivableId`.
- `description`.
- `amount`.
- `occurredOn`.
- `paymentMethod`.
- `notes`.
- `createdByUserId`.
- `createdAt`.

### FinancialCategory

Categoria financeira.

Campos conceituais:

- `id`.
- `name`.
- `type`.
- `active`.
- `createdAt`.
- `updatedAt`.

### MessageTemplate

Template de mensagem.

Campos conceituais:

- `id`.
- `name`.
- `origin`.
- `body`.
- `active`.
- `createdAt`.
- `updatedAt`.

### MessageDispatch

Registro de envio ou tentativa de envio.

Campos conceituais:

- `id`.
- `clientId`.
- `phoneNormalized`.
- `origin`.
- `templateId`.
- `finalText`.
- `scheduledFor`.
- `sentAt`.
- `status`.
- `providerMessageId`.
- `errorMessage`.
- `idempotencyKey`.
- `createdAt`.
- `updatedAt`.

### WhatsAppConnection

Conexao futura com provider real.

Campos conceituais:

- `id`.
- `provider`.
- `instanceName`.
- `status`.
- `connectedPhone`.
- `metadata`.
- `createdAt`.
- `updatedAt`.

### WhatsAppPendingContact

Contato pendente vindo do WhatsApp.

Campos conceituais:

- `id`.
- `whatsappConnectionId`.
- `displayName`.
- `phoneRaw`.
- `phoneNormalized`.
- `firstMessage`.
- `lastMessage`.
- `firstContactAt`.
- `lastContactAt`.
- `status`.
- `approvedClientId`.
- `createdAt`.
- `updatedAt`.

### RecoveryCampaign

Campanha de recuperacao de cliente inativo.

Campos conceituais:

- `id`.
- `clientId`.
- `status`.
- `startedAt`.
- `canceledAt`.
- `completedAt`.
- `createdAt`.
- `updatedAt`.

### RecoveryStep

Etapa de recuperacao.

Campos conceituais:

- `id`.
- `campaignId`.
- `stepNumber`.
- `daysAfterInactivation`.
- `templateId`.
- `scheduledFor`.
- `sentAt`.
- `status`.
- `messageDispatchId`.
- `errorMessage`.
- `idempotencyKey`.
- `createdAt`.
- `updatedAt`.

### AutomationJob

Job persistido para automacoes sem dependencia inicial de Redis/BullMQ.

Campos conceituais:

- `id`.
- `type`.
- `status`.
- `scheduledFor`.
- `payload`.
- `attempts`.
- `maxAttempts`.
- `lockedAt`.
- `lockedBy`.
- `idempotencyKey`.
- `lastError`.
- `createdAt`.
- `updatedAt`.

### PaymentIntent

Abstracao futura para PIX.

Campos conceituais:

- `id`.
- `provider`.
- `receivableId`.
- `amount`.
- `status`.
- `transactionId`.
- `pixCopyPaste`.
- `qrCode`.
- `expiresAt`.
- `metadata`.
- `createdAt`.
- `updatedAt`.

### AuditLog

Auditoria administrativa/tecnica.

Campos conceituais:

- `id`.
- `actorUserId`.
- `action`.
- `entityType`.
- `entityId`.
- `before`.
- `after`.
- `metadata`.
- `createdAt`.

## Estrategia de Datas

- Datas de vencimento e renovacao sao datas de negocio.
- Datas de negocio devem usar coluna PostgreSQL `DATE`, mapeada corretamente
  pelo Prisma.
- Evitar conversoes que alterem o dia ao atravessar UTC/timezone.
- Timezone operacional: `America/Sao_Paulo`.
- Calculo de renovacao adiciona meses de calendario.
- Se o dia original nao existir no mes destino, usar ultimo dia valido.
- Casos obrigatorios de teste:
  - mensal.
  - bimestral.
  - trimestral.
  - semestral.
  - anual.
  - fevereiro.
  - ano bissexto.
  - vencimento no dia 29, 30 e 31.

## Estrategia de Automacoes

Nesta fase, preparar arquitetura com jobs persistidos em banco.

Redis/BullMQ fica como preparacao futura, nao como dependencia inicial.

Regras:

- Job deve possuir status persistido.
- Job deve possuir `idempotencyKey`.
- Processador deve revalidar o estado antes de executar.
- Falhas devem ser registradas.
- Retentativas devem ser limitadas.
- Operacoes financeiras ou externas ambiguas nao devem usar retry cego.

## Estrategia de Integracoes

### WhatsApp

- Criar contratos internos e providers.
- Implementacao real depende de documentacao da API futura.
- Nao criar endpoint ficticio.
- Nao simular provider real como se estivesse pronto.

### PIX

- Criar contrato `PaymentProvider`.
- Criar entidade conceitual `PaymentIntent`.
- Implementacao real depende de API futura.
- Nao acoplar financeiro a fornecedor especifico.

## Estrategia de Multiempresa Futura

Nao implementar agora.

Preparar:

- Nomes e modulos sem premissas rigidas de unico dono.
- Autorizacao backend desde o inicio.
- Separar dominio de configuracoes globais.
- Evitar regras que impossibilitem adicionar `Company` ou `tenantId` depois.

## Indices Provaveis

- `Client.reference`.
- `Client.phoneNormalized`.
- `Client.status`.
- `Client.dueDate`.
- `Receivable.clientId`.
- `Receivable.dueDate`.
- `Receivable.paymentStatus`.
- `FinancialTransaction.occurredOn`.
- `MessageDispatch.idempotencyKey`.
- `AutomationJob.status` + `scheduledFor`.
- `AutomationJob.idempotencyKey`.

## Quality Gates

Cada Sprint tecnica deve validar, quando aplicavel:

- Typecheck.
- Lint.
- Tests.
- Build.
- `git diff --check`.
- Revisao de diff.
- Ausencia de secrets.
- Migrations revisadas.
- Regras criticas cobertas por testes.
