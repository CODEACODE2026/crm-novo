# CRM Novo - Master Prompt

## Papel do Projeto

O CRM Novo e um sistema web administrativo da Code a Code para gestao de
clientes, recorrencias, financeiro, cobrancas, recuperacao de clientes e
integracoes futuras com WhatsApp e PIX.

Este documento e fonte oficial de verdade junto com `discovery.md`.

## Diretriz Principal

Construir uma solucao moderna, modular, incremental e segura. O sistema legado
nao deve ser copiado tecnicamente. Ele so podera ser usado futuramente como
fonte de regras de negocio e dados, apos analise explicita.

## Stack Aprovada

- Backend: Node.js, NestJS, TypeScript, Prisma ORM, PostgreSQL.
- Frontend: Next.js, TypeScript.
- API: REST.
- Autenticacao: JWT.
- Estrutura: monorepo.

## Estrutura Alvo

```text
crm-novo/
  apps/
    api/
    web/
  packages/
    shared/
  docs/
    project/
      discovery.md
      master-prompt.md
      requisitos.md
      arquitetura.md
      direcao-criativa.md
      backlog.md
      qa-checklist.md
      ambiente-devops.md
```

## Modulos de Dominio

- Auth.
- Users.
- Clients.
- Plans.
- ClientEvents.
- Renewals.
- Finance.
- Billing.
- Automations.
- WhatsApp.
- Payments.
- Dashboard.
- Audit.
- Settings.

## Regras Inegociaveis

- Nao implementar tudo de uma vez.
- Cada Sprint deve ser pequena, validavel e homologavel.
- Nao fazer commit sem autorizacao.
- Nao fazer push sem autorizacao.
- Nao inventar API de WhatsApp.
- Nao inventar API de PIX.
- Nao implementar multiempresa agora.
- Nao iniciar Sprint 1 sem homologacao da documentacao da Sprint 0.
- Regras de negocio nao ficam no frontend.
- Controllers nao devem concentrar regra de dominio.
- Renovacao deve ser transacional.
- Mensagens automaticas devem ter idempotencia.
- Cliente com historico relevante nao deve desaparecer por exclusao fisica.
- Historico de cliente e auditoria sao trilhas diferentes.

## Datas de Negocio

`Client.dueDate`, vencimentos financeiros e datas de renovacao sao datas de
negocio. A implementacao deve evitar bugs de timezone ou alteracao involuntaria
do dia por conversoes UTC.

Timezone operacional inicial: `America/Sao_Paulo`.

## Decisoes Aprovadas

- `Client.reference` sera unica.
- Telefone canonico usa E.164 sem `+`, exemplo `5544999999999`.
- Renovacao adiciona meses de calendario.
- Quando o dia nao existir no mes destino, usar o ultimo dia valido.
- Planos terao CRUD simples.
- Seeds iniciais: Mensal, Bimestral, Trimestral, Semestral e Anual.
- Baixa de conta a receber gera ou vincula uma `FinancialTransaction`.
- Cliente `CANCELADO` cancela campanhas automaticas de recuperacao.
- `VENCIDO` sera condicao calculada nesta fase.
- Arquitetura preparada para jobs sem Redis/BullMQ por enquanto.

## Fluxo de Renovacao

1. Usuario aciona `Renovar cliente`.
2. Sistema exibe plano atual, vencimento atual, valor e novo vencimento
   previsto.
3. Usuario pode confirmar ou alterar dados permitidos.
4. Sistema executa transacao atomica.
5. Cliente permanece ou volta para `ATIVO`.
6. Vencimento e atualizado.
7. Renovacao e registrada.
8. Conta a receber e criada.
9. Historico operacional e atualizado.
10. Auditoria e registrada quando aplicavel.

## Fluxo de Cobranca Futura

```text
Agendamento
-> Job persistido
-> Processamento
-> WhatsApp Provider
-> Resultado
-> MessageDispatch
```

O cadastro do cliente nunca deve enviar mensagem diretamente.

## Fluxo de Recuperacao Futura

Quando cliente for inativado e marcado para tentativa de recuperacao:

- Agendar etapas de 3, 10, 15 e 30 dias.
- Cada etapa pode usar template diferente.
- Se cliente renovar antes do proximo disparo, cancelar etapas futuras.
- Se cliente for cancelado, cancelar campanhas automaticas.
- Nunca enviar a mesma etapa duas vezes.

## Qualidade Esperada

- TypeScript strict.
- DTOs e validacao server-side.
- Services pequenos.
- Transacoes em regras criticas.
- Migrations versionadas.
- Testes das regras de data, renovacao, cobranca e financeiro.
- Logs estruturados.
- Erros padronizados.
- Sem secrets no Git.
- Build, typecheck, lint e testes antes de homologacao tecnica.

## Ordem de Trabalho

O projeto deve seguir Sprints:

1. Sprint 0 - Descoberta e Arquitetura.
2. Sprint 1 - Fundacao.
3. Sprint 2 - Clientes e Planos.
4. Sprint 3 - Renovacao.
5. Sprint 4 - Financeiro.
6. Sprint 5 - Dashboard.
7. Sprint 6 - WhatsApp Base.
8. Sprint 7 - Lista de Espera.
9. Sprint 8 - Cobranca Automatica.
10. Sprint 9 - Recuperacao.
11. Sprint 10 - PIX.
12. Sprint 11 - Importacao do Legado.

Nenhuma Sprint tecnica deve iniciar sem aprovacao explicita.
